// Front door for every API request: IP bans, per-IP flood limit, CSRF-style Origin
// check, body size cap, per-client write limit and app request signatures.
import { json, type Env } from '../util';
import { bannedUntil, secEvent } from './audit';
import { allow } from './ratelimit';
import { verifySignature } from './signing';

export const MAX_BODY = 13_000_000; // largest legit body: 12 MB video upload
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Server-to-server endpoints with their own secret; no browser Origin, no app signature. */
const MACHINE = [/^\/api\/v2\/telegram\/webhook$/];
const seenNonces = new Map<string, number>();

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? null;
/** Rate-limit key for an IP: IPv6 users get a whole /64 (one subscriber), so rotating addresses inside it doesn't reset limits. */
export function ipBucket(ip: string | null): string | null {
  if (!ip || !ip.includes(':')) return ip;
  const full = ip.includes('::') ? (() => { const [a, b] = ip.split('::'); const l = a ? a.split(':') : []; const r = b ? b.split(':') : []; return [...l, ...Array(8 - l.length - r.length).fill('0'), ...r]; })() : ip.split(':');
  return `${full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function originAllowed(env: Env, origin: string): boolean {
  if (!origin) return true; // native app, curl, server-to-server: no Origin header → JWT decides
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.safqa-admin\.pages\.dev$/.test(origin) || /^https:\/\/[a-z0-9-]+\.safqaeg\.pages\.dev$/.test(origin);
}

/** Headers added to every API response (JSON API: nothing may frame, sniff or cache it by accident). */
export function securityHeaders(path: string): Record<string, string> {
  const h: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'cross-origin-resource-policy': path.startsWith('/api/v2/media/') ? 'cross-origin' : 'same-site',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  };
  if (/^\/api\/(auth|v2\/admin|v2\/hub|v2\/owner|v2\/payments)/.test(path)) h['cache-control'] = 'no-store';
  return h;
}

const reject = (status: number, code: string, message: string, ch: Record<string, string>, extra: Record<string, string> = {}) =>
  json({ error: { code, message } }, status, { ...ch, ...securityHeaders('/'), ...extra });

export async function guard(env: Env, req: Request, url: URL, ch: Record<string, string>): Promise<Response | null> {
  const ip = clientIp(req);
  const path = url.pathname;
  const until = await bannedUntil(env, ip);
  if (until) {
    secEvent('banned_hit', ip, { path });
    return reject(403, 'banned', 'الوصول اتمنع مؤقتًا بسبب نشاط مريب', ch, { 'retry-after': String(Math.ceil((until - Date.now()) / 1000)) });
  }
  const bucket = ipBucket(ip);
  if (bucket && !(await allow(env, 'RL_IP', bucket))) {
    secEvent('rate_limited', ip, { path, detail: 'ip' });
    return reject(429, 'rate_limited', 'طلبات كتير — استنى دقيقة', ch, { 'retry-after': '60' });
  }
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) {
    secEvent('too_large', ip, { path, detail: String(len) });
    return reject(413, 'too_large', 'Request body too large', ch);
  }
  if (!MUTATING.has(req.method) || MACHINE.some((r) => r.test(path))) return null;

  const origin = req.headers.get('origin') ?? '';
  if (!originAllowed(env, origin)) {
    secEvent('origin_blocked', ip, { path, detail: origin.slice(0, 100) });
    return reject(403, 'origin_not_allowed', 'Origin not allowed', ch);
  }
  if (/^\/api\/(auth\/(login|register|google|refresh|forgot)|v2\/hub\/pair\/claim|v2\/admin\/2fa\/verify)$/.test(path) && bucket && !(await allow(env, 'RL_AUTH', bucket))) {
    secEvent('rate_limited', ip, { path, detail: 'auth' });
    return reject(429, 'rate_limited', 'محاولات كتير — استنى دقيقة', ch, { 'retry-after': '60' });
  }
  const writer = (req.headers.get('authorization') ?? '').slice(-24) || bucket || 'anon';
  if (!(await allow(env, 'RL_WRITE', writer))) {
    secEvent('rate_limited', ip, { path, detail: 'write' });
    return reject(429, 'rate_limited', 'براحة شوية — طلبات كتير ورا بعض', ch, { 'retry-after': '60' });
  }

  const mode = env.SIGNING_MODE ?? 'monitor';
  if (mode === 'off') return null;
  const hasSig = req.headers.has('x-safqa-sig') || req.headers.has('x-safqa-ts');
  if (!hasSig) {
    if (mode === 'enforce' && /^(android|ios|app)/i.test(req.headers.get('x-safqa-client') ?? '')) {
      secEvent('sig_fail', ip, { path, detail: 'missing' });
      return reject(401, 'signature_required', 'حدّث التطبيق لآخر نسخة', ch);
    }
    return null;
  }
  const r = await verifySignature(env.SIGNING_KEYS, req, await req.clone().arrayBuffer());
  if (r.status === 'bad') {
    secEvent('sig_fail', ip, { path, detail: r.reason });
    return reject(401, 'bad_signature', r.reason === 'stale' ? 'ساعة الجهاز مش مظبوطة — ظبط الوقت وجرّب تاني' : 'Request signature rejected', ch);
  }
  if (r.status === 'ok') {
    const now = Date.now();
    if (seenNonces.size > 50_000) for (const [k, t] of seenNonces) if (t < now) seenNonces.delete(k);
    const replay = seenNonces.has(r.nonce) || !(await allow(env, 'RL_NONCE', r.nonce));
    if (replay) {
      secEvent('sig_replay', ip, { path });
      return reject(409, 'replayed', 'Duplicate request', ch);
    }
    seenNonces.set(r.nonce, now + 6 * 60_000);
  }
  return null;
}
