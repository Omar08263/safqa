// Optional TOTP 2FA for the owner (Safqa Hub). Off until the owner enables it from
// Hub → الأمان. Once on, every admin API call needs an "admin pass" (short JWT,
// typ adm2fa) obtained by entering a 6-digit code after Google sign-in.
// Secret storage: KV, AES-GCM sealed with FIELD_KEYS (refuses to enable without a key).
// Lockout: 5 wrong codes/minute (edge counter) and 8 wrong codes/30 min (KV) → 30 min lock.
import type { Authed } from '../auth';
import { type Env, fail, signJwt, verifyJwt } from '../util';
import { secEvent } from './audit';
import { open, seal } from './crypto';
import { allow } from './ratelimit';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp';

interface Rec { secret: string; enabledAt: string; lastStep: number }
const memo = new Map<string, { at: number; rec: Rec | null }>();
const key = (uid: string) => `sec:totp:${uid}`;

export async function totpRecord(env: Env, uid: string): Promise<Rec | null> {
  const m = memo.get(uid);
  if (m && Date.now() - m.at < 60_000) return m.rec;
  const rec = (await env.KV.get(key(uid), 'json').catch(() => null)) as Rec | null;
  memo.set(uid, { at: Date.now(), rec });
  return rec;
}
const PASS_TTL = 12 * 3600;
export const DEVICE_PASS_TTL = 30 * 86400;
export const issuePass = (env: Env, a: Authed, ttl = PASS_TTL) => signJwt({ sub: a.user.id, tv: a.user.token_version, typ: 'adm2fa' }, env.JWT_SECRET, ttl);

/** Called by needAdmin after the email/Google checks. Throws 403 otp_required when a valid pass is missing. */
export async function requireSecondFactor(env: Env, req: Request, a: Authed) {
  const rec = await totpRecord(env, a.user.id);
  if (!rec) return;
  const pass = req.headers.get('x-safqa-2fa') ?? '';
  const c = pass ? await verifyJwt<{ sub: string; tv: number; typ: string }>(pass, env.JWT_SECRET) : null;
  if (c && c.typ === 'adm2fa' && c.sub === a.user.id && c.tv === a.user.token_version) return;
  fail(403, 'otp_required', 'اكتب كود التحقق بخطوتين (2FA)');
}

async function lockState(env: Env, uid: string) {
  return ((await env.KV.get(`sec:otpfail:${uid}`, 'json').catch(() => null)) as { n: number; until: number; since: number } | null) ?? { n: 0, until: 0, since: Date.now() };
}
async function checkCode(env: Env, ip: string | null, a: Authed, secret: string, code: string, lastStep = 0): Promise<number> {
  const st = await lockState(env, a.user.id);
  if (st.until > Date.now()) fail(423, 'otp_locked', `2FA مقفول لحد ${new Date(st.until).toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo' })} بسبب أكواد غلط`);
  if (!(await allow(env, 'RL_OTP', a.user.id))) { secEvent('otp_locked', ip, { who: a.user.email }); fail(429, 'otp_rate', 'استنى دقيقة'); }
  const step = await verifyTotp(secret, code);
  if (step == null || step <= lastStep) {
    const fresh = Date.now() - st.since > 30 * 60_000;
    const n = fresh ? 1 : st.n + 1;
    const locked = n >= 8;
    await env.KV.put(`sec:otpfail:${a.user.id}`, JSON.stringify({ n, since: fresh ? Date.now() : st.since, until: locked ? Date.now() + 30 * 60_000 : 0 }), { expirationTtl: 3600 }).catch(() => undefined);
    secEvent(locked ? 'otp_locked' : 'otp_fail', ip, { who: a.user.email, detail: step != null ? 'reused code' : null });
    fail(401, 'otp_wrong', step != null ? 'الكود ده اتستخدم قبل كده — استنى الكود الجاي' : 'الكود غلط');
  }
  return step!;
}

export async function status(env: Env, a: Authed) {
  const rec = await totpRecord(env, a.user.id);
  return { enabled: Boolean(rec), enabledAt: rec?.enabledAt ?? null, encryption: Boolean(env.FIELD_KEYS) };
}

export async function setup(env: Env, a: Authed) {
  if (!env.FIELD_KEYS) fail(503, 'no_field_key', 'مفتاح التشفير FIELD_KEYS مش متظبط على السيرفر');
  if (await totpRecord(env, a.user.id)) fail(409, 'already_enabled', '2FA شغال بالفعل');
  const secret = newTotpSecret();
  await env.KV.put(`sec:totp-pending:${a.user.id}`, await seal(env.FIELD_KEYS, 'totp', secret), { expirationTtl: 900 });
  return { secret, uri: otpauthUri(secret, a.user.email), expiresIn: 900 };
}

export async function enable(env: Env, ip: string | null, a: Authed, code: string) {
  const sealed = await env.KV.get(`sec:totp-pending:${a.user.id}`);
  if (!sealed) fail(400, 'no_pending', 'ابدأ التفعيل من الأول');
  const secret = await open(env.FIELD_KEYS, 'totp', sealed!);
  const step = await checkCode(env, ip, a, secret, code);
  const rec: Rec = { secret: sealed!, enabledAt: new Date().toISOString(), lastStep: step };
  await env.KV.put(key(a.user.id), JSON.stringify(rec));
  await env.KV.delete(`sec:totp-pending:${a.user.id}`);
  memo.set(a.user.id, { at: Date.now(), rec });
  return { ok: true, pass: await issuePass(env, a) };
}

export async function verify(env: Env, ip: string | null, a: Authed, code: string) {
  const rec = await totpRecord(env, a.user.id);
  if (!rec) return { ok: true, pass: null, enabled: false };
  const step = await checkCode(env, ip, a, await open(env.FIELD_KEYS, 'totp', rec.secret), code, rec.lastStep);
  const next = { ...rec, lastStep: step };
  await env.KV.put(key(a.user.id), JSON.stringify(next)).catch(() => undefined); // one-time use of each code
  memo.set(a.user.id, { at: Date.now(), rec: next });
  await env.KV.delete(`sec:otpfail:${a.user.id}`).catch(() => undefined);
  return { ok: true, pass: await issuePass(env, a), enabled: true };
}

export async function disable(env: Env, ip: string | null, a: Authed, code: string) {
  const rec = await totpRecord(env, a.user.id);
  if (!rec) return { ok: true };
  await checkCode(env, ip, a, await open(env.FIELD_KEYS, 'totp', rec.secret), code, rec.lastStep);
  await env.KV.delete(key(a.user.id));
  memo.set(a.user.id, { at: Date.now(), rec: null });
  return { ok: true };
}
