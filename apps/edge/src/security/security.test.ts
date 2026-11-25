import { beforeEach, describe, expect, it } from 'vitest';
import * as auth from '../auth';
import { b64url, hashPassword, signJwt, verifyJwt } from '../util';
import { _secState, flushSec, secEvent, shouldFlush } from './audit';
import { blindIndex, isSealed, open, parseKeyring, seal, sealedKid } from './crypto';
import { guard, originAllowed, securityHeaders } from './guard';
import { _resetLocalLimits, allow } from './ratelimit';
import { signRequest, verifySignature } from './signing';
import { base32Decode, base32Encode, totpAt, verifyTotp } from './totp';

const key32 = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

// ---------- minimal fake D1 for the session/user queries ----------
function fakeDb(users: Record<string, any>[]) {
  const sessions = new Map<string, any>();
  const rate = new Map<string, any>();
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async first() {
      if (sql.startsWith('SELECT * FROM users WHERE id=')) return users.find((u) => u.id === args[0]) ?? null;
      if (sql.startsWith('SELECT * FROM users WHERE email=')) return users.find((u) => u.email === args[0]) ?? null;
      if (sql.startsWith('SELECT * FROM sessions WHERE id=')) return sessions.get(args[0] as string) ?? null;
      if (sql.startsWith('SELECT count, reset FROM rate')) return rate.get(args[0] as string) ?? null;
      throw new Error(`unexpected ${sql}`);
    },
    async run() {
      if (sql.startsWith('INSERT INTO sessions (id,user_id,exp,created_at,family)')) sessions.set(args[0] as string, { id: args[0], user_id: args[1], exp: args[2], family: args[4], rotated_at: null });
      else if (sql.startsWith('UPDATE sessions SET rotated_at')) sessions.get(args[1] as string).rotated_at = args[0];
      else if (sql.startsWith('DELETE FROM sessions WHERE family=')) for (const [k, v] of sessions) { if (v.family === args[0]) sessions.delete(k); }
      else if (sql.startsWith('INSERT OR REPLACE INTO rate')) rate.set(args[0] as string, { count: 1, reset: args[1] });
      else if (sql.startsWith('UPDATE rate SET count')) rate.get(args[0] as string).count++;
      return { meta: { changes: 1 } };
    },
    async all() { return { results: [] }; },
  });
  return { prepare: (sql: string) => stmt(sql), batch: async () => [], sessions, rate };
}
const user = { id: 'u_1', email: 'a@b.co', name: 'A', token_version: 0, tier: 'free', tier_until: null, badges: '[]', last_seen: new Date().toISOString(), pass_hash: null, pass_salt: null };
const kv = () => { const m = new Map<string, string>(); return { m, get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null), put: async (k: string, v: string) => void m.set(k, v), delete: async (k: string) => void m.delete(k) }; };

describe('field encryption (AES-GCM)', () => {
  it('round-trips, is randomized and binds the purpose', async () => {
    const ring = `k1:${key32()}`;
    const a = await seal(ring, 'receipt', 'secret data ✓ عربي');
    const b = await seal(ring, 'receipt', 'secret data ✓ عربي');
    expect(isSealed(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(await open(ring, 'receipt', a)).toBe('secret data ✓ عربي');
    await expect(open(ring, 'email', a)).rejects.toThrow();
  });
  it('rejects tampering and supports rotation (old key still decrypts)', async () => {
    const k1 = `k1:${key32()}`; const k2 = `k2:${key32()}`;
    const old = await seal(k1, 'x', 'hello');
    const t = old.slice(0, -3) + (old.endsWith('A') ? 'B' : 'A') + old.slice(-2);
    await expect(open(k1, 'x', t)).rejects.toThrow();
    const ring = `${k2},${k1}`;
    expect(await open(ring, 'x', old)).toBe('hello');
    expect(sealedKid(await seal(ring, 'x', 'new'))).toBe('k2');
  });
  it('passes legacy plaintext through and validates keys', async () => {
    expect(await open(`k1:${key32()}`, 'x', 'plain')).toBe('plain');
    expect(() => parseKeyring('k1:short')).toThrow();
    expect(await blindIndex('s', 'email', ' A@B.co ')).toBe(await blindIndex('s', 'email', 'a@b.co'));
  });
});

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 vector', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(await totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(await totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(await verifyTotp(secret, '287082', 59_000)).toBe(1);
    expect(await verifyTotp(secret, '000000', 59_000)).toBeNull();
    expect(Array.from(base32Decode(secret))).toEqual(Array.from(new TextEncoder().encode('12345678901234567890')));
  });
});

describe('JWT hardening', () => {
  it('rejects alg none and foreign issuers', async () => {
    const t = await signJwt({ sub: 'u' }, 'k', 60);
    expect(await verifyJwt(t, 'k')).toBeTruthy();
    const [, p] = t.split('.');
    const none = `${b64url(new TextEncoder().encode('{"alg":"none"}'))}.${p}.`;
    expect(await verifyJwt(none, 'k')).toBeNull();
    expect(await verifyJwt(t, 'other')).toBeNull();
  });
  it('a refresh JWT or admin pass is never accepted as an access token', async () => {
    const env: any = { JWT_SECRET: 'k', ADMIN_EMAILS: '', DB: fakeDb([user]) };
    const req = (tok: string) => new Request('https://x/api/auth/me', { headers: { authorization: `Bearer ${tok}` } });
    expect(await auth.authenticate(env, req(await signJwt({ sub: 'u_1', tv: 0, typ: 'access' }, 'k', 60)))).toBeTruthy();
    expect(await auth.authenticate(env, req(await signJwt({ sub: 'u_1', tv: 0 }, 'k', 60)))).toBeTruthy(); // tokens issued before typ existed
    expect(await auth.authenticate(env, req(await signJwt({ sub: 'u_1', tv: 0, typ: 'refresh' }, 'k', 60)))).toBeNull();
    expect(await auth.authenticate(env, req(await signJwt({ sub: 'u_1', tv: 0, typ: 'adm2fa' }, 'k', 60)))).toBeNull();
  });
});

describe('refresh rotation + reuse detection', () => {
  it('rotates, tolerates a parallel race, and revokes the family on late reuse', async () => {
    const db = fakeDb([user]);
    const env: any = { JWT_SECRET: 'k', ADMIN_EMAILS: '', DB: db };
    const first = await auth.issue(env, user as any);
    expect(first.expiresIn).toBe(900);
    const second = await auth.refresh(env, { refreshToken: first.refreshToken });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // Same old token again within the grace window (two tabs): allowed.
    const race = await auth.refresh(env, { refreshToken: first.refreshToken });
    expect(race.accessToken).toBeTruthy();
    // Much later the old token comes back: stolen copy → whole family revoked.
    for (const s of db.sessions.values()) if (s.rotated_at) s.rotated_at -= 10 * 60_000;
    await expect(auth.refresh(env, { refreshToken: first.refreshToken })).rejects.toMatchObject({ status: 401 });
    await expect(auth.refresh(env, { refreshToken: second.refreshToken })).rejects.toMatchObject({ status: 401 });
    expect(_secState().buf.size + _secState().recent.length).toBeGreaterThan(0);
  });
  it('keeps sign-in working when D1 is read-only (T-2 persistence fix)', async () => {
    const db: any = fakeDb([user]);
    const ro = { ...db, prepare: (sql: string) => { const s = db.prepare(sql); return { ...s, bind: (...a: unknown[]) => { const b = s.bind(...a); return { ...b, run: async () => { throw new Error('D1_ERROR: write limit'); } }; } }; } };
    const env: any = { JWT_SECRET: 'k', ADMIN_EMAILS: '', DB: ro };
    const t = await auth.issue(env, user as any);
    expect(t.refreshToken.split('.').length).toBe(3); // stateless refresh JWT
    const again = await auth.refresh(env, { refreshToken: t.refreshToken });
    expect(again.refreshToken).toBe(t.refreshToken);
  });
  it('locks password sign-in after repeated failures', async () => {
    const { hash, salt } = await hashPassword('right-password');
    const db = fakeDb([{ ...user, email: 'p@x.co', pass_hash: hash, pass_salt: salt }]);
    const env: any = { JWT_SECRET: 'k', ADMIN_EMAILS: '', DB: db };
    for (let i = 0; i < auth.LOGIN_FAILS; i++) await expect(auth.login(env, { email: 'p@x.co', password: 'wrongwrong' })).rejects.toMatchObject({ status: 401 });
    await expect(auth.login(env, { email: 'p@x.co', password: 'wrongwrong' })).rejects.toMatchObject({ status: 423 });
    await expect(auth.login(env, { email: 'p@x.co', password: 'right-password' })).rejects.toMatchObject({ status: 423 }); // locked even with the right one
  });
});

describe('request signing', () => {
  it('accepts a valid signature and rejects tamper, stale and wrong key', async () => {
    const body = JSON.stringify({ a: 1 });
    const ts = String(Date.now()); const nonce = 'n0nce-abcdefghijkl';
    const sig = await signRequest('key1', 'POST', '/api/watchlist?x=1', ts, nonce, body);
    const mk = (b: string, h: Record<string, string>) => new Request('https://x/api/watchlist?x=1', { method: 'POST', body: b, headers: h });
    const h = { 'x-safqa-ts': ts, 'x-safqa-nonce': nonce, 'x-safqa-sig': sig };
    const ab = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    expect((await verifySignature('key1', mk(body, h), ab(body))).status).toBe('ok');
    expect((await verifySignature('key2,key1', mk(body, h), ab(body))).status).toBe('ok'); // rotation
    expect(await verifySignature('key1', mk('{"a":2}', h), ab('{"a":2}'))).toMatchObject({ status: 'bad', reason: 'mismatch' });
    expect(await verifySignature('key1', mk(body, h), ab(body), Date.now() + 10 * 60_000)).toMatchObject({ status: 'bad', reason: 'stale' });
    expect((await verifySignature('key1', mk(body, {}), ab(body))).status).toBe('absent');
  });
});

describe('guard', () => {
  beforeEach(() => _resetLocalLimits());
  const env: any = { ALLOWED_ORIGINS: 'https://safqaeg.pages.dev,https://safqa-admin.pages.dev', KV: kv(), SIGNING_KEYS: 'key1', SIGNING_MODE: 'monitor' };
  const req = (method: string, path: string, h: Record<string, string> = {}, body?: string) => new Request(`https://api${path}`, { method, headers: { 'cf-connecting-ip': '1.2.3.4', ...h }, body });
  it('blocks foreign origins on writes, not on reads or native apps', async () => {
    expect(originAllowed(env, 'https://evil.example')).toBe(false);
    expect(originAllowed(env, 'https://abc123.safqa-admin.pages.dev')).toBe(true);
    expect((await guard(env, req('POST', '/api/watchlist', { origin: 'https://evil.example' }, '{}'), new URL('https://api/api/watchlist'), {}))?.status).toBe(403);
    expect(await guard(env, req('GET', '/api/health', { origin: 'https://evil.example' }), new URL('https://api/api/health'), {})).toBeNull();
    expect(await guard(env, req('POST', '/api/watchlist', {}, '{}'), new URL('https://api/api/watchlist'), {})).toBeNull();
  });
  it('rate-limits auth endpoints per IP and caps body size', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) last = await guard(env, req('POST', '/api/auth/login', { 'cf-connecting-ip': '9.9.9.9' }, '{}'), new URL('https://api/api/auth/login'), {});
    expect(last?.status).toBe(429);
    expect((await guard(env, req('POST', '/api/v2/media', { 'content-length': '99000000' }, 'x'), new URL('https://api/api/v2/media'), {}))?.status).toBe(413);
  });
  it('rejects bad signatures and replays', async () => {
    const body = '{}'; const ts = String(Date.now()); const nonce = 'replay-nonce-12345';
    const sig = await signRequest('key1', 'POST', '/api/watchlist', ts, nonce, body);
    const h = { 'x-safqa-ts': ts, 'x-safqa-nonce': nonce, 'x-safqa-sig': sig };
    expect(await guard(env, req('POST', '/api/watchlist', h, body), new URL('https://api/api/watchlist'), {})).toBeNull();
    expect((await guard(env, req('POST', '/api/watchlist', h, body), new URL('https://api/api/watchlist'), {}))?.status).toBe(409);
    expect((await guard(env, req('POST', '/api/watchlist', { ...h, 'x-safqa-nonce': 'other-nonce-123456' }, body), new URL('https://api/api/watchlist'), {}))?.status).toBe(401);
  });
  it('sets security headers', () => {
    const h = securityHeaders('/api/auth/me');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['cache-control']).toBe('no-store');
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

describe('intrusion log', () => {
  it('aggregates events per kind+ip and auto-bans severe patterns', async () => {
    const store = kv();
    const env: any = { KV: store, DB: { batch: async () => { throw new Error('read-only'); }, prepare: () => ({ bind: () => ({}) }) }, ADMIN_EMAILS: '' };
    for (let i = 0; i < 70; i++) secEvent('auth_fail', '5.5.5.5', { path: '/api/auth/login' });
    expect(shouldFlush(Date.now() + 61_000)).toBe(true);
    await flushSec(env);
    const bans = JSON.parse(store.m.get('sec:bans')!);
    expect(bans['5.5.5.5']).toBeGreaterThan(Date.now());
    expect(_secState().recent.find((r) => r.ip === '5.5.5.5')?.count).toBe(70);
    expect(await allow({}, 'RL_NONCE', 'n1')).toBe(true);
    expect(await allow({}, 'RL_NONCE', 'n1')).toBe(false);
  });
});

describe('mobile signer ↔ server verifier', () => {
  it('signatures made by the app (pure-JS HMAC) verify on the Worker', async () => {
    // apps/mobile is outside the pnpm workspace (own tsconfig/deps): test a copy of the file.
    const { copyFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'sign-'));
    copyFileSync(new URL('../../../mobile/src/lib/sign.ts', import.meta.url), join(dir, 'sign.ts'));
    const { signHeaders } = await import(/* @vite-ignore */ join(dir, 'sign.ts'));
    const body = JSON.stringify({ productId: 'p1', note: 'عربي' });
    const h = signHeaders('POST', '/api/watchlist?x=1', body, 'k-app');
    const req = new Request('https://x/api/watchlist?x=1', { method: 'POST', headers: h, body });
    expect((await verifySignature('k-app', req, await req.clone().arrayBuffer())).status).toBe('ok');
    expect(signHeaders('GET', '/api/x', '', 'k-app')).toEqual({});
  });
});
