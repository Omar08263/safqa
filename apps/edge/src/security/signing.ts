// App → API request signing (HMAC-SHA256 + timestamp + nonce).
//
// Honest threat model: the signing key ships inside the Android app, so a determined
// reverse-engineer can extract it — this is NOT authentication. It raises the cost of
// scripted abuse (bots must unpack the APK), blocks replays of captured requests
// (nonce + 60-second window) and tampering in transit (body hash). Authorization stays
// server-side: JWT, per-user limits, tier checks, owner-only admin.
// Modes (SIGNING_MODE): "off" | "monitor" (default: unsigned requests pass, bad
// signatures are rejected) | "enforce" (signed requests required from the app).
import { b64url, timingSafeEqual } from '../util';

const te = new TextEncoder();
export const SKEW_MS = 60_000; // matches the 60 s nonce window; the app corrects its clock from the server Date header

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const canonical = (method: string, pathAndQuery: string, ts: string, nonce: string, bodyHash: string) =>
  `${method.toUpperCase()}\n${pathAndQuery}\n${ts}\n${nonce}\n${bodyHash}`;

export async function signRequest(key: string, method: string, pathAndQuery: string, ts: string, nonce: string, body: ArrayBuffer | Uint8Array | string) {
  const k = await crypto.subtle.importKey('raw', te.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, te.encode(canonical(method, pathAndQuery, ts, nonce, await sha256Hex(body)))));
}

export type SigResult = { status: 'absent' } | { status: 'ok'; nonce: string } | { status: 'bad'; reason: 'stale' | 'format' | 'mismatch' | 'nokey' };

export async function verifySignature(keys: string | undefined, req: Request, body: ArrayBuffer, now = Date.now()): Promise<SigResult> {
  const sig = req.headers.get('x-safqa-sig');
  const ts = req.headers.get('x-safqa-ts');
  const nonce = req.headers.get('x-safqa-nonce');
  if (!sig && !ts && !nonce) return { status: 'absent' };
  if (!sig || !ts || !nonce || !/^\d{13}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { status: 'bad', reason: 'format' };
  if (Math.abs(now - Number(ts)) > SKEW_MS) return { status: 'bad', reason: 'stale' };
  const list = (keys ?? '').split(',').map((s) => s.trim()).filter(Boolean); // current,previous (rotation)
  if (!list.length) return { status: 'bad', reason: 'nokey' };
  const u = new URL(req.url);
  for (const k of list) if (timingSafeEqual(await signRequest(k, req.method, u.pathname + u.search, ts, nonce, body), sig)) return { status: 'ok', nonce };
  return { status: 'bad', reason: 'mismatch' };
}
