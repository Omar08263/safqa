// Small, dependency-free helpers for the Safqa edge Worker.
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  OBS?: AnalyticsEngineDataset;
  HUNTER_TOKEN?: string;
  AI: Ai;
  ALLOWED_ORIGINS: string;
  GOOGLE_CLIENT_ID: string;
  INSTAPAY_ADDRESS: string;
  INSTAPAY_LINK: string;
  SITE_URL: string;
  CHAT_MODEL: string;
  CHAT_FALLBACK_MODEL: string;
  VISION_MODEL: string;
  AI_DAILY_CALL_BUDGET: string;
  JWT_SECRET: string;
  PUSH_SECRET: string;
  ADMIN_EMAILS: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  AMAZON_CREATORS_CLIENT_ID?: string;
  AMAZON_CREATORS_CLIENT_SECRET?: string;
  AMAZON_PARTNER_TAG?: string;
  NOON_FEED_URL?: string;
  GEMINI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  // ---- security (see docs/security.md) ----
  RL_IP?: RateLimiter; RL_AUTH?: RateLimiter; RL_WRITE?: RateLimiter; RL_NONCE?: RateLimiter; RL_OTP?: RateLimiter;
  /** AES-GCM keyring "kid:base64,kid:base64" (first encrypts). Secret. */
  FIELD_KEYS?: string;
  /** App request-signing keys "current,previous". Secret. */
  SIGNING_KEYS?: string;
  SIGNING_MODE?: 'off' | 'monitor' | 'enforce';
  /** Extra Telegram chat id(s) for security alerts (besides the owner's linked account). */
  OWNER_TG_CHAT?: string;
}
interface RateLimiter { limit(o: { key: string }): Promise<{ success: boolean }> }

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string): never => {
  throw new HttpError(status, code, message);
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

export const nowIso = () => new Date().toISOString();
export const cairoDay = (d = new Date()) => new Date(d.getTime() + 2 * 3600_000).toISOString().slice(0, 10);

export function uid(prefix = ''): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const enc = new TextEncoder();
export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

// ---------- Passwords: PBKDF2-SHA256 via WebCrypto ----------
const PBKDF2_ITER = 100_000; // Workers caps PBKDF2 at 100k iterations.
export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64urlDecode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64url(bits), salt: b64url(salt) };
}
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const got = await hashPassword(password, salt);
  return timingSafeEqual(got.hash, hash);
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- HS256 JWT ----------
async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signJwt(payload: Record<string, unknown>, secret: string, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec, iss: 'safqa-edge' })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
export async function verifyJwt<T = Record<string, unknown>>(token: string, secret: string): Promise<T | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  // Only our own HS256 tokens: no "alg":"none", no algorithm confusion.
  try { if (JSON.parse(new TextDecoder().decode(b64urlDecode(h))).alg !== 'HS256') return null; } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(s), enc.encode(`${h}.${p}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
  if (claims.iss !== undefined && claims.iss !== 'safqa-edge') return null;
  return claims as T;
}

export async function readJson<T = Record<string, unknown>>(req: Request, max = 64 * 1024): Promise<T> {
  // Refuse before buffering when the client announces a too-large body.
  if (Number(req.headers.get('content-length') ?? 0) > max * 4 + 1024) fail(413, 'too_large', 'Request body too large');
  const text = await req.text();
  if (text.length > max) fail(413, 'too_large', 'Request body too large');
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fail(400, 'invalid_json', 'Body must be JSON');
  }
}

export const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const parseJ = <T>(s: string | null | undefined, d: T): T => {
  if (!s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

/** Read-only check of a D1 fixed-window counter (true = still under the limit). Never writes. */
export async function underLimit(env: Env, key: string, limit: number): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT count, reset FROM rate WHERE key=?').bind(key).first<{ count: number; reset: number }>();
    return !row || row.reset <= Math.floor(Date.now() / 1000) || row.count < limit;
  } catch { return true; }
}

/** Fixed-window rate limit stored in D1 (cheap, free-tier friendly). */
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  // Fail open when D1 is read-only (e.g. the free tier's daily write limit): the site keeps working, limits resume after reset.
  let row: { count: number; reset: number } | null = null;
  try { row = await env.DB.prepare('SELECT count, reset FROM rate WHERE key=?').bind(key).first<{ count: number; reset: number }>(); } catch (e) { console.log('rate read failed', String(e).slice(0, 120)); return true; }
  try {
    if (!row || row.reset <= now) {
      await env.DB.prepare('INSERT OR REPLACE INTO rate (key,count,reset) VALUES (?,1,?)').bind(key, now + windowSec).run();
      return true;
    }
    if (row.count >= limit) return false;
    await env.DB.prepare('UPDATE rate SET count=count+1 WHERE key=?').bind(key).run();
  } catch (e) { console.log('rate write failed', String(e).slice(0, 120)); return !row || row.reset <= now || row.count < limit; }
  return true;
}
