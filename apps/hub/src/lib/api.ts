// Safqa Hub API client. Tokens come from a one-time pairing code issued by the Google-authed owner on the web Hub,
// and live only in the Android keystore (SecureStore). Refresh rotates them; a rejected refresh logs out.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const API: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'https://safqa-api.safqaeg.workers.dev';
export const HUB_WEB: string = (Constants.expoConfig?.extra?.hubWeb as string) ?? 'https://safqa-admin.pages.dev';
const KA = 'hub.access', KR = 'hub.refresh';
let access: string | null = null, refresh: string | null = null;
let adminPass: string | null = null; // owner 2FA pass for this paired device (30 days), see docs/security.md
const listeners = new Set<(on: boolean) => void>();
export const onAuth = (f: (on: boolean) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const emit = () => listeners.forEach((f) => f(Boolean(access)));

export async function hydrate() {
  access = await SecureStore.getItemAsync(KA); refresh = await SecureStore.getItemAsync(KR);
  adminPass = await SecureStore.getItemAsync('hub.2fa');
  return Boolean(access);
}
async function save(a: string | null, r: string | null) {
  access = a; refresh = r;
  if (a) await SecureStore.setItemAsync(KA, a); else await SecureStore.deleteItemAsync(KA);
  if (r) await SecureStore.setItemAsync(KR, r); else await SecureStore.deleteItemAsync(KR);
  emit();
}
export const signedIn = () => Boolean(access);
export async function logout() { try { if (refresh) await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) }); } catch {} await save(null, null); }

let refreshing: Promise<boolean> | null = null;
async function doRefresh() {
  if (!refresh) return false;
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
      if (r.ok) { const j = await r.json(); await save(j.accessToken, j.refreshToken); return true; }
      if (r.status === 400 || r.status === 401) await save(null, null);
      return false;
    } catch { return false; } finally { setTimeout(() => (refreshing = null), 0); }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const res = await fetch(API + path, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}), ...(adminPass ? { 'x-safqa-2fa': adminPass } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  if (res.status === 401 && retry && (await doRefresh())) return api(path, init, false);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data as T;
}
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });

export async function claim(code: string) {
  const r = await fetch(`${API}/api/v2/hub/pair/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, device: 'Safqa Hub Android' }) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message || 'الكود مش شغال');
  if (j.adminPass) { adminPass = j.adminPass; await SecureStore.setItemAsync('hub.2fa', j.adminPass); }
  await save(j.accessToken, j.refreshToken);
}

export const ago = (iso?: string | null) => {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'دلوقتي'; if (s < 3600) return `من ${Math.round(s / 60)} د`; if (s < 86400) return `من ${Math.round(s / 3600)} س`;
  return `من ${Math.round(s / 86400)} يوم`;
};
export const fmt = (n?: number | null) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
