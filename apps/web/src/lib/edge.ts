// Safqa real backend (Cloudflare Worker + D1 + Workers AI). One data client with a
// base URL. The static site keeps working from its snapshot when the API is down.
//
// installEdgeBridge() wraps window.fetch (after the static demo API is installed):
// account, watchlist, alerts and assistant calls go to the real backend so they
// sync across web, app, admin and Telegram; product reads stay on the bundled
// snapshot (instant). If the backend is unreachable the call falls back to the
// in-browser demo engine.
import { EDGE_URL, refreshAccess, setNativeFetch } from './auth-tokens';
export { EDGE_URL };
export const TELEGRAM_BOT_URL = `https://t.me/${import.meta.env.VITE_TELEGRAM_BOT || 'SafqaDealsBot'}`;

const ACCESS = 'safqa.access';
const REFRESH = 'safqa.refresh';
const FORWARD = /^\/api\/(auth\/|watchlist|alerts|chat$|push\/)/;
let healthy: boolean | null = null;
let checkedAt = 0;

export async function edgeUp(force = false): Promise<boolean> {
  if (!force && healthy !== null && Date.now() - checkedAt < 60_000) return healthy;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await (realFetch ?? fetch)(`${EDGE_URL}/api/health`, { signal: ctl.signal });
    clearTimeout(t);
    healthy = r.ok;
  } catch {
    healthy = false;
  }
  checkedAt = Date.now();
  return healthy;
}
export const isEdgeToken = (t: string | null) => Boolean(t && t.split('.').length === 3);

let realFetch: typeof fetch | null = null;

const refreshTokens = () => (localStorage.getItem(REFRESH) ? refreshAccess() : Promise.resolve(null));

export class EdgeError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

/** Authenticated JSON call to the real backend. */
export async function edge<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> } = {}, retried = false): Promise<T> {
  const f = realFetch ?? fetch;
  const token = localStorage.getItem(ACCESS);
  const res = await f(EDGE_URL + path, {
    method: opts.method ?? (opts.body !== undefined || opts.raw ? 'POST' : 'GET'),
    headers: { ...(opts.raw ? {} : { 'content-type': 'application/json' }), ...(isEdgeToken(token) ? { authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) },
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && !retried && (await refreshTokens())) return edge(path, opts, true);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new EdgeError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? data?.penalty?.messageAr ?? res.statusText, data);
  return data as T;
}

/** Moves a browser-only demo account to the real backend the first time it signs in. */
async function migrateDemoAccount(email: string, password: string): Promise<Response | null> {
  try {
    const state = JSON.parse(localStorage.getItem('safqa.demo.state.v1') ?? 'null');
    const u = state?.users?.find((x: { email: string; password: string }) => x.email === email.toLowerCase() && x.password === password);
    if (!u || !realFetch || email === 'demo@safqa.app') return null;
    const reg = await realFetch(`${EDGE_URL}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, name: u.user?.name ?? email }) });
    if (!reg.ok) return null;
    const j = await reg.clone().json();
    for (const w of state.watch?.[u.email] ?? []) {
      await realFetch(`${EDGE_URL}/api/watchlist`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${j.accessToken}` }, body: JSON.stringify({ productId: w.product?.id, targetPriceEgp: w.targetPriceEgp ?? null }) }).catch(() => 0);
    }
    return reg;
  } catch {
    return null;
  }
}

export function installEdgeBridge() {
  if (realFetch) return;
  const demoFetch = window.fetch.bind(window);
  // The un-patched network fetch (the demo API keeps it for non-/api calls).
  realFetch = (input, init) => demoFetch(input instanceof Request || String(input).startsWith('http') ? input : new URL(String(input), EDGE_URL).toString(), init);
  setNativeFetch(realFetch);
  void edgeUp();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !FORWARD.test(url.pathname)) return demoFetch(input, init);
    const headers = new Headers(init?.headers || req?.headers);
    const bearer = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    // A real backend session must never be answered by the in-browser demo: the demo
    // would say 401 and the session would be thrown away. Offline → a retryable 503.
    const edgeSession = isEdgeToken(bearer) || (url.pathname.startsWith('/api/auth/') && isEdgeToken(localStorage.getItem(ACCESS)));
    if (!(await edgeUp(edgeSession && healthy === false))) {
      if (!edgeSession) return demoFetch(input, init);
      return new Response(JSON.stringify({ error: { code: 'offline', message: 'السيرفر مش متاح دلوقتي — جرّب تاني بعد شوية' } }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    const method = (init?.method || req?.method || 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : req ? await req.text() : undefined;
    const auth = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    // A token from the old in-browser demo can't talk to the backend: keep that session local.
    if (auth && !isEdgeToken(auth)) return demoFetch(input, init);
    try {
      let res = await demoFetch(`${EDGE_URL}${url.pathname}${url.search}`, { method, headers, body: method === 'GET' ? undefined : body });
      if (res.status === 401 && url.pathname === '/api/auth/login' && body) {
        const b = JSON.parse(body);
        res = (await migrateDemoAccount(String(b.email ?? ''), String(b.password ?? ''))) ?? res;
      }
      return res;
    } catch {
      healthy = false;
      if (edgeSession) return new Response(JSON.stringify({ error: { code: 'offline', message: 'offline' } }), { status: 503, headers: { 'content-type': 'application/json' } });
      return demoFetch(input, init);
    }
  };
}

// ---------- typed helpers used by the pages ----------
export interface EdgeTier { id: 'free' | 'silver' | 'gold' | 'diamond'; ar: string; en: string; emoji: string; price: number; color: string; rank: number; perks: string[]; support: string; limits: Record<string, number> }
export interface PayInfo { address: string; link: string; qr: string; currency: string }
export interface Payment { id: string; tier: string; tierInfo: EdgeTier; months: number; listAmount: number; amount: number; code: string | null; refCode: string; status: 'awaiting' | 'pending' | 'provisional' | 'approved' | 'rejected' | 'revoked'; confidence: number | null; checks: { checks: { id: string; ok: boolean | null; ar: string }[]; reasons: string[] } | null; createdAt: string; note?: string; pay: PayInfo; messageAr?: string }
export const signedInToBackend = () => isEdgeToken(localStorage.getItem(ACCESS));

/** Resize + JPEG-compress an image in the browser before upload (privacy + free quota). */
export async function compressImage(file: File, max = 1400, quality = 0.82): Promise<{ b64: string; mime: string; blob: Blob }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', quality));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), mime: 'image/jpeg', blob };
}

/** Upload a file (image/video/pdf) to the backend; returns an attachment usable in posts/chat. */
export async function uploadMedia(file: File) {
  const isImg = file.type.startsWith('image/') && file.type !== 'image/gif';
  const body = isImg ? (await compressImage(file, 1600, 0.85)).blob : file;
  return edge<{ id: string; name: string; type: string; size: number; url: string }>(`/api/v2/media?name=${encodeURIComponent(file.name)}`, { method: 'POST', raw: body, headers: { 'content-type': isImg ? 'image/jpeg' : file.type } });
}
export const mediaUrl = (u: string) => (u.startsWith('/api/') ? EDGE_URL + u : u);
