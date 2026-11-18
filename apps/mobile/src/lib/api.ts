/**
 * The real Safqa backend (Cloudflare Worker). Same API the website uses:
 * account (email + password), the member's tier, watchlist sync and live prices.
 * Tokens: access token in memory + AsyncStorage, refresh token in SecureStore.
 * Everything degrades gracefully: offline or signed out, the app keeps working
 * on the cached snapshot and the local watchlist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; telegramUrl?: string };
export const API_URL = (extra.apiUrl ?? 'https://safqa-api.safqaeg.workers.dev').replace(/\/$/, '');
export const TELEGRAM_URL = extra.telegramUrl ?? 'https://t.me/SafqaDealsBot';

export type TierId = 'free' | 'silver' | 'gold' | 'diamond';
export interface TierInfo { id: TierId; ar: string; en: string; emoji: string; price: number; color: string; perks: string[]; limits: { watchlist: number; alerts: number; collections: number; agentQuestionsPerDay: number } }
export interface User { id: string; email: string; name: string; tier: TierId; tierUntil: string | null; tierInfo: TierInfo | null; xp?: number }
export interface ServerWatch { id: string; targetPriceEgp: number | null; createdAt: string; product: { id: string } }

/** Same prices and limits as apps/edge/src/tiers.ts (refreshed from GET /api/v2/tiers). */
export const TIERS: TierInfo[] = [
  { id: 'free', ar: 'مجاني', en: 'Free', emoji: '🌱', price: 0, color: '#1FA67A', perks: [], limits: { watchlist: 10, alerts: 5, collections: 3, agentQuestionsPerDay: 20 } },
  { id: 'silver', ar: 'فضّي', en: 'Silver', emoji: '🥈', price: 49, color: '#B8C4D3', perks: [], limits: { watchlist: 30, alerts: 20, collections: 10, agentQuestionsPerDay: 50 } },
  { id: 'gold', ar: 'ذهبي', en: 'Gold', emoji: '👑', price: 99, color: '#F5B524', perks: [], limits: { watchlist: 100, alerts: 75, collections: 30, agentQuestionsPerDay: 200 } },
  { id: 'diamond', ar: 'ماسي', en: 'Diamond', emoji: '💎', price: 199, color: '#7C9CFF', perks: [], limits: { watchlist: 500, alerts: 300, collections: 100, agentQuestionsPerDay: 500 } },
];

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const ACCESS = 'safqa.api.access';
const REFRESH = 'safqa.api.refresh';
const USER = 'safqa.api.user.v1';
const TIERS_KEY = 'safqa.api.tiers.v1';

interface AuthState { user: User | null; tiers: TierInfo[]; ready: boolean }
let state: AuthState = { user: null, tiers: TIERS, ready: false };
let access: string | null = null;
const subs = new Set<() => void>();
const set = (next: Partial<AuthState>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};
export const getAuth = () => state;
export function useAuth() {
  return useSyncExternalStore((f) => {
    subs.add(f);
    return () => subs.delete(f);
  }, () => state);
}
export const tierOf = (s: AuthState = state) => s.tiers.find((t) => t.id === (s.user?.tier ?? 'free')) ?? TIERS[0]!;

async function raw(path: string, init: RequestInit = {}, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(API_URL + path, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function refreshTokens(): Promise<boolean> {
  const r = await SecureStore.getItemAsync(REFRESH);
  if (!r) return false;
  const res = await raw('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: r }) });
  if (!res.ok) {
    if (res.status === 401) await clearSession();
    return false;
  }
  const j = await res.json();
  await saveTokens(j.accessToken, j.refreshToken);
  return true;
}

async function saveTokens(a: string, r: string) {
  access = a;
  await AsyncStorage.setItem(ACCESS, a);
  await SecureStore.setItemAsync(REFRESH, r);
}
async function clearSession() {
  access = null;
  await AsyncStorage.multiRemove([ACCESS, USER]);
  await SecureStore.deleteItemAsync(REFRESH).catch(() => undefined);
  set({ user: null });
}

/** JSON call; refreshes the access token once on 401. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const res = await raw(path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !retried && access && (await refreshTokens())) return api(path, opts, true);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `HTTP ${res.status}`);
  return data as T;
}

export async function hydrateAuth() {
  try {
    access = await AsyncStorage.getItem(ACCESS);
    const u = await AsyncStorage.getItem(USER);
    const t = await AsyncStorage.getItem(TIERS_KEY);
    set({ user: u ? JSON.parse(u) : null, tiers: t ? JSON.parse(t) : TIERS, ready: true });
  } catch {
    set({ ready: true });
  }
  void refreshMe();
  void api<{ tiers: TierInfo[] }>('/api/v2/tiers')
    .then((r) => {
      if (Array.isArray(r.tiers) && r.tiers.length) {
        set({ tiers: r.tiers });
        void AsyncStorage.setItem(TIERS_KEY, JSON.stringify(r.tiers));
      }
    })
    .catch(() => undefined);
}

/** Reads the member (and tier) from the server; keeps the cached copy offline. */
export async function refreshMe(): Promise<User | null> {
  if (!access && !(await SecureStore.getItemAsync(REFRESH).catch(() => null))) return null;
  try {
    if (!access) await refreshTokens();
    const u = await api<User>('/api/auth/me');
    set({ user: u });
    await AsyncStorage.setItem(USER, JSON.stringify(u));
    return u;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await clearSession();
    return state.user;
  }
}

export async function login(email: string, password: string) {
  const j = await api<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/login', { body: { email: email.trim(), password } });
  await saveTokens(j.accessToken, j.refreshToken);
  set({ user: j.user });
  await AsyncStorage.setItem(USER, JSON.stringify(j.user));
  return j.user;
}
export async function register(name: string, email: string, password: string) {
  const j = await api<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/register', { body: { name: name.trim(), email: email.trim(), password } });
  await saveTokens(j.accessToken, j.refreshToken);
  set({ user: j.user });
  await AsyncStorage.setItem(USER, JSON.stringify(j.user));
  return j.user;
}
export async function logout() {
  const r = await SecureStore.getItemAsync(REFRESH).catch(() => null);
  if (r) void api('/api/auth/logout', { body: { refreshToken: r } }).catch(() => undefined);
  await clearSession();
}

// ---------- watchlist ----------
export const serverWatchlist = () => api<{ items: ServerWatch[] }>('/api/watchlist').then((r) => r.items);
export const serverAddWatch = (productId: string, target: number | null) => api<ServerWatch>('/api/watchlist', { body: { productId, targetPriceEgp: target } });
export const serverSetTarget = (id: string, target: number | null) => api<ServerWatch>(`/api/watchlist/${id}`, { method: 'PATCH', body: { targetPriceEgp: target } });
export const serverRemoveWatch = (id: string) => api<{ ok: boolean }>(`/api/watchlist/${id}`, { method: 'DELETE' });

// ---------- prices ----------
/** The latest snapshot the backend serves (same format as the static site). */
export async function serverSnapshot(): Promise<unknown> {
  const res = await raw('/api/v2/snapshot', { headers: { accept: 'application/json' } }, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
