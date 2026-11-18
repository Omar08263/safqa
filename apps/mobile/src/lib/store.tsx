/**
 * App state kept on the phone (AsyncStorage): watchlist with target prices,
 * settings and onboarding. A tiny external store so every screen stays in sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { ApiError, getAuth, type ServerWatch, serverAddWatch, serverRemoveWatch, serverSetTarget, serverWatchlist, tierOf, useAuth } from './api';

export interface WatchItem { id: string; target: number | null; addedAt: string; lastPrice: number | null; notifiedAt?: string; serverId?: string }
export interface Settings { theme: 'system' | 'light' | 'dark'; haptics: boolean; notifications: boolean; onboarded: boolean; minDropPct: number }
interface State { watch: WatchItem[]; settings: Settings; ready: boolean }

const KEY = 'safqa.app.v1';
const defaults: Settings = { theme: 'system', haptics: true, notifications: true, onboarded: false, minDropPct: 5 };
let state: State = { watch: [], settings: defaults, ready: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const persist = () => void AsyncStorage.setItem(KEY, JSON.stringify({ watch: state.watch, settings: state.settings }));

export async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
    state = { watch: parsed.watch ?? [], settings: { ...defaults, ...(parsed.settings ?? {}) }, ready: true };
  } catch {
    state = { ...state, ready: true };
  }
  emit();
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  persist();
  emit();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useApp(): State {
  return useSyncExternalStore(subscribe, () => state);
}
export function useSettings() {
  const s = useApp();
  return { settings: s.settings, ready: s.ready, update: (patch: Partial<Settings>) => set({ settings: { ...state.settings, ...patch } }) };
}
/** Watchlist size follows the member's tier from the server (free = 10 when signed out). */
export const watchLimit = () => tierOf().limits.watchlist;
export function useWatch() {
  const s = useApp();
  useAuth();
  return {
    limit: watchLimit(),
    items: s.watch,
    has: (id: string) => s.watch.some((w) => w.id === id),
    add: (id: string, price: number | null, target: number | null = null): 'added' | 'full' | 'exists' => {
      if (state.watch.some((w) => w.id === id)) return 'exists';
      if (state.watch.length >= watchLimit()) return 'full';
      set({ watch: [{ id, target, addedAt: new Date().toISOString(), lastPrice: price }, ...state.watch] });
      void pushAdd(id, target);
      return 'added';
    },
    remove: (id: string) => {
      const prev = state.watch.find((w) => w.id === id);
      set({ watch: state.watch.filter((w) => w.id !== id) });
      if (prev?.serverId && getAuth().user) void serverRemoveWatch(prev.serverId).catch(() => undefined);
      return prev;
    },
    restore: (item: WatchItem) => {
      set({ watch: [{ ...item, serverId: undefined }, ...state.watch.filter((w) => w.id !== item.id)] });
      void pushAdd(item.id, item.target);
    },
    setTarget: (id: string, target: number | null) => {
      set({ watch: state.watch.map((w) => (w.id === id ? { ...w, target } : w)) });
      const w = state.watch.find((x) => x.id === id);
      if (w?.serverId && getAuth().user) void serverSetTarget(w.serverId, target).catch(() => undefined);
    },
  };
}
let onSyncError: ((msg: string) => void) | null = null;
export function setSyncErrorHandler(f: ((msg: string) => void) | null) {
  onSyncError = f;
}
async function pushAdd(id: string, target: number | null) {
  if (!getAuth().user) return;
  try {
    const r = await serverAddWatch(id, target);
    set({ watch: state.watch.map((w) => (w.id === id ? { ...w, serverId: r.id } : w)) });
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) {
      set({ watch: state.watch.filter((w) => w.id !== id) });
      onSyncError?.(e.message);
    }
    // Offline or product not on the server yet: stays local, retried on the next sync.
  }
}

/** Two-way merge after sign-in / app start: server items come down, local-only items go up. */
export async function syncWatchlist(): Promise<{ up: number; down: number } | null> {
  if (!getAuth().user) return null;
  let remote: ServerWatch[];
  try {
    remote = await serverWatchlist();
  } catch {
    return null;
  }
  const byProduct = new Map(remote.map((r) => [r.product.id, r]));
  let up = 0;
  let down = 0;
  const merged: WatchItem[] = state.watch.map((w) => {
    const r = byProduct.get(w.id);
    return r ? { ...w, serverId: r.id, target: w.target ?? r.targetPriceEgp } : { ...w, serverId: undefined };
  });
  for (const r of remote) {
    if (!merged.some((w) => w.id === r.product.id)) {
      merged.push({ id: r.product.id, target: r.targetPriceEgp, addedAt: r.createdAt, lastPrice: null, serverId: r.id });
      down += 1;
    }
  }
  set({ watch: merged });
  for (const w of merged.filter((x) => !x.serverId)) {
    await pushAdd(w.id, w.target);
    up += 1;
  }
  return { up, down };
}

export function patchWatch(items: WatchItem[]) {
  set({ watch: items });
}
export function getState() {
  return state;
}
