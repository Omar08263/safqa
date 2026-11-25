// One place that owns the sign-in tokens, so a session survives reloads, new tabs,
// flaky mobile networks and the 1-hour access-token expiry.
//
// Root cause of "I sign in, come back, and I'm signed out" (fixed here):
//  1. Any failed /api/auth/me (timeout, offline, backend health-check miss) wiped
//     both tokens, even when the server never said the session was invalid.
//  2. When the backend health check was slow the request bridge sent the real
//     backend token to the in-browser demo API, which answered 401 → refresh → 401 →
//     tokens deleted.
//  3. The refresh token rotates on every use; two parallel 401s (React StrictMode,
//     several queries, two tabs) both spent the same refresh token and the loser
//     logged the user out.
// Now: tokens are only cleared when the backend itself rejects the refresh token;
// refresh is single-flight within the tab and serialised across tabs (Web Locks);
// the access token is refreshed silently before it expires; the refresh token lives
// 60 days and slides forward on every refresh ("remember me" by default).
export const ACCESS = 'safqa.access';
export const REFRESH = 'safqa.refresh';
export const USER = 'safqa.user';
export const EDGE_URL = String(import.meta.env.VITE_EDGE_URL ?? 'https://safqa-api.safqaeg.workers.dev').replace(/\/$/, '');

export const isJwt = (t: string | null | undefined): t is string => Boolean(t && t.split('.').length === 3);
export const getAccess = () => localStorage.getItem(ACCESS);
export const getRefresh = () => localStorage.getItem(REFRESH);

export function saveTokens(access: string | null, refresh: string | null) {
  if (access) localStorage.setItem(ACCESS, access);
  else localStorage.removeItem(ACCESS);
  if (refresh) localStorage.setItem(REFRESH, refresh);
  else localStorage.removeItem(REFRESH);
  if (!access && !refresh) localStorage.removeItem(USER);
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
export function onTokens(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
// Another tab signed in, refreshed or signed out.
window.addEventListener('storage', (e) => {
  if (e.key === ACCESS || e.key === REFRESH) listeners.forEach((l) => l());
});

/** Seconds until the access token expires (negative = expired, null = unknown). */
export function accessTtl(token = getAccess()): number | null {
  if (!isJwt(token)) return null;
  try {
    const b64 = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { exp?: number };
    return typeof exp === 'number' ? exp - Date.now() / 1000 : null;
  } catch {
    return null;
  }
}

let nativeFetch: typeof fetch = window.fetch.bind(window);
/** Called by the request bridge with the un-patched fetch, so refresh never goes to the demo API. */
export function setNativeFetch(f: typeof fetch) {
  nativeFetch = f;
}

let inflight: Promise<string | null> | null = null;

async function doRefresh(seen: string | null): Promise<string | null> {
  const current = getRefresh();
  // Another tab (or call) already rotated it while we waited for the lock.
  if (current && current !== seen && (accessTtl() ?? 0) > 60) return getAccess();
  if (!current) return null;
  // Browser-only demo sessions (non-JWT) never expire and have no server session.
  if (getAccess() && !isJwt(getAccess())) return getAccess();
  let res: Response;
  try {
    res = await nativeFetch(`${EDGE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: current }),
    });
  } catch {
    return null; // offline / blocked: keep the session, try again later
  }
  if (res.status === 401) {
    // The server says the session is gone (expired, revoked, or rotated by another tab).
    if (getRefresh() === current) saveTokens(null, null);
    return getRefresh() ? getAccess() : null;
  }
  if (!res.ok) return null; // 5xx / rate limit: keep the session
  const j = (await res.json().catch(() => null)) as { accessToken?: string; refreshToken?: string; user?: unknown } | null;
  if (!j?.accessToken || !j.refreshToken) return null;
  if (j.user) localStorage.setItem(USER, JSON.stringify(j.user));
  saveTokens(j.accessToken, j.refreshToken);
  return j.accessToken;
}

/** Get a fresh access token. Single-flight per tab, serialised across tabs. */
export function refreshAccess(): Promise<string | null> {
  if (inflight) return inflight;
  const seen = getRefresh();
  const run = () => doRefresh(seen);
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const p: Promise<string | null> = (locks ? (locks.request('safqa-refresh', run) as unknown as Promise<string | null>) : run()).finally(() => {
    inflight = null;
  });
  inflight = p;
  return p;
}

/** Refresh in the background when the access token is about to expire. */
export function startSilentRefresh() {
  const tick = () => {
    if (!isJwt(getAccess()) || !getRefresh()) return;
    const ttl = accessTtl();
    if (ttl !== null && ttl < 300) void refreshAccess();
  };
  tick();
  const id = window.setInterval(tick, 60_000);
  const vis = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('online', tick);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', vis);
    window.removeEventListener('online', tick);
  };
}

export function cachedUser<T>(): T | null {
  try {
    return getAccess() || getRefresh() ? (JSON.parse(localStorage.getItem(USER) ?? 'null') as T | null) : null;
  } catch {
    return null;
  }
}
