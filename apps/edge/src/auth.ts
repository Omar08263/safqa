import { verifyGoogleIdToken } from './google';
import { tierById } from './tiers';
import { secEvent } from './security/audit';
import { noteLoginFail, strike } from './security/defense';
import { type Env, fail, hashPassword, nowIso, parseJ, rateLimit, sha256, signJwt, str, uid, underLimit, verifyJwt, verifyPassword } from './util';

export interface UserRow {
  id: string; email: string; name: string; picture: string | null; pass_hash: string | null; pass_salt: string | null; google_sub: string | null;
  locale: string; tier: string; tier_until: string | null; tier_status: string; xp: number; badges: string; settings: string; rules_version: string | null;
  handle: string | null; bio: string | null; city: string | null; token_version: number; created_at: string; last_seen: string | null;
}
export interface Authed { user: UserRow; admin: boolean }

export const isAdminEmail = (env: Env, email: string) =>
  (env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean).includes(email.toLowerCase());

export function effectiveTier(u: Pick<UserRow, 'tier' | 'tier_until'>): string {
  if (u.tier !== 'free' && u.tier_until && Date.parse(u.tier_until) < Date.now()) return 'free';
  return u.tier;
}

/** Public-safe user shape (matches @safqa/shared User + extras). */
export function publicUser(u: UserRow, env?: Env) {
  const tier = effectiveTier(u);
  return {
    id: u.id, email: u.email, name: u.name, locale: u.locale === 'en' ? 'en' : 'ar', picture: u.picture, handle: u.handle,
    tier, tierUntil: u.tier_until, tierStatus: u.tier_status, tierInfo: tierById(tier) ?? null,
    xp: u.xp, badges: parseJ<string[]>(u.badges, []), rulesVersion: u.rules_version, bio: u.bio, city: u.city,
    createdAt: u.created_at, admin: env ? isAdminEmail(env, u.email) : undefined,
  };
}
/** What other members can see. Never includes email. */
export function memberCard(u: Pick<UserRow, 'id' | 'name' | 'picture' | 'handle' | 'tier' | 'tier_until' | 'xp' | 'badges' | 'created_at'>) {
  return { id: u.id, name: u.name, picture: u.picture, handle: u.handle, tier: effectiveTier(u), xp: u.xp, badges: parseJ<string[]>(u.badges, []), joinedAt: u.created_at };
}

const REFRESH_DAYS = 60;
/** Access tokens are short-lived (15 min); clients refresh silently / on 401. */
export const ACCESS_TTL = 900;
/** Two tabs (or an app retry after a lost response) may spend the same refresh token within this window. */
export const REUSE_GRACE_MS = 120_000;
let familyColumn: boolean | undefined; // sessions.family exists (migration 0009)?

async function insertSession(env: Env, sid: string, userId: string, family: string) {
  const exp = Date.now() + REFRESH_DAYS * 86400_000;
  if (familyColumn !== false) {
    try {
      await env.DB.prepare('INSERT INTO sessions (id,user_id,exp,created_at,family) VALUES (?,?,?,?,?)').bind(sid, userId, exp, nowIso(), family).run();
      familyColumn = true;
      return;
    } catch (e) {
      if (!/no column|no such column/i.test(String(e))) throw e;
      familyColumn = false;
    }
  }
  await env.DB.prepare('INSERT INTO sessions (id,user_id,exp,created_at) VALUES (?,?,?,?)').bind(sid, userId, exp, nowIso()).run();
}

/**
 * Access token (15 min) + refresh token (60 days, sliding, rotated on every use).
 * The refresh token is a random id stored hashed in D1, in a "family" (one per sign-in):
 * presenting an already-rotated token after the grace window means it was stolen and
 * replayed, so the whole family is revoked (reuse detection).
 * If D1 refuses writes (free-tier daily write cap), sign-in must still work: we fall back
 * to a signed, stateless refresh JWT (typ "refresh", bound to token_version so "sign out
 * everywhere" still revokes it), or keep the caller's current refresh token when rotating fails.
 */
export async function issue(env: Env, u: UserRow, extra: Record<string, unknown> = {}, keep?: string, family?: string) {
  const accessToken = await signJwt({ sub: u.id, tv: u.token_version, typ: 'access' }, env.JWT_SECRET, ACCESS_TTL);
  let refresh = uid('r_') + uid();
  try {
    await insertSession(env, await sha256(refresh), u.id, family ?? uid('f_'));
  } catch {
    refresh = keep ?? (await signJwt({ sub: u.id, tv: u.token_version, typ: 'refresh' }, env.JWT_SECRET, REFRESH_DAYS * 86400));
  }
  // last_seen at most every 30 min (saves D1 writes on every silent refresh).
  if (!u.last_seen || Date.now() - Date.parse(u.last_seen) > 30 * 60_000) {
    try {
      await env.DB.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(nowIso(), u.id).run();
    } catch {
      /* read-only D1: last_seen can wait */
    }
  }
  return { accessToken, refreshToken: refresh, expiresIn: ACCESS_TTL, user: publicUser(u, env), ...extra };
}

export const getUserByEmail = (env: Env, email: string) => env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email.toLowerCase()).first<UserRow>();
export const getUser = (env: Env, id: string) => env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<UserRow>();

function handleFrom(name: string, email: string) {
  const base = (name || email.split('@')[0] || 'member').toLowerCase().replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 16);
  return `${base || 'member'}_${Math.floor(Math.random() * 900 + 100)}`;
}

async function createUser(env: Env, email: string, name: string, extra: Partial<UserRow>): Promise<UserRow> {
  const id = uid('u_');
  await env.DB.prepare('INSERT INTO users (id,email,name,picture,pass_hash,pass_salt,google_sub,handle,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, email.toLowerCase(), name.slice(0, 60), extra.picture ?? null, extra.pass_hash ?? null, extra.pass_salt ?? null, extra.google_sub ?? null, handleFrom(name, email), nowIso())
    .run();
  await env.DB.prepare('INSERT INTO xp_log (user_id,amount,reason,at) VALUES (?,?,?,?)').bind(id, 5, 'join', nowIso()).run();
  await env.DB.prepare('UPDATE users SET xp=xp+5 WHERE id=?').bind(id).run();
  return (await getUser(env, id)) as UserRow;
}

export async function register(env: Env, body: Record<string, unknown>) {
  const email = str(body.email, 200).toLowerCase();
  const password = String(body.password ?? '');
  const name = str(body.name, 60) || email.split('@')[0] || 'عضو';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'invalid_body', 'الإيميل مش صحيح');
  if (password.length < 8) fail(400, 'invalid_body', 'الباسورد لازم 8 حروف على الأقل');
  if (await getUserByEmail(env, email)) fail(409, 'email_taken', 'الإيميل ده متسجل قبل كده');
  const { hash, salt } = await hashPassword(password);
  return issue(env, await createUser(env, email, name, { pass_hash: hash, pass_salt: salt }));
}

/** Per-account lockout: 8 wrong passwords in 15 min lock password sign-in for that email (Google sign-in still works). */
export const LOGIN_FAILS = 8;
export async function login(env: Env, body: Record<string, unknown>, ip: string | null = null) {
  const email = str(body.email, 200).toLowerCase();
  if (!(await underLimit(env, `lf:${email}`, LOGIN_FAILS))) {
    secEvent('login_locked', ip, { who: email });
    fail(423, 'account_locked', 'الدخول بالباسورد اتقفل 15 دقيقة بسبب محاولات غلط كتير — جرّب بعدين أو ادخل بجوجل');
  }
  const u = await getUserByEmail(env, email);
  if (!u?.pass_hash || !u.pass_salt || !(await verifyPassword(String(body.password ?? ''), u.pass_hash, u.pass_salt))) {
    secEvent('auth_fail', ip, { who: email, path: '/api/auth/login' });
    const pts = noteLoginFail(ip, email); // many different emails from one client = credential stuffing
    if (pts >= 20) secEvent('cred_stuffing', ip, { who: email, path: '/api/auth/login' });
    if (pts) await strike(env, ip, pts, 'credential-stuffing', { path: '/api/auth/login' }).catch(() => 0);
    await rateLimit(env, `lf:${email}`, LOGIN_FAILS, 900).catch(() => true);
    fail(401, 'invalid_credentials', 'الإيميل أو الباسورد غلط');
  }
  return issue(env, u as UserRow);
}

export async function google(env: Env, body: Record<string, unknown>) {
  const credential = str(body.credential, 4096);
  let c;
  try {
    c = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return fail(401, 'invalid_google_token', `Google token rejected: ${String((e as Error).message).slice(0, 80)}`);
  }
  let u = await getUserByEmail(env, c.email);
  if (!u) u = await createUser(env, c.email, c.name || c.email, { google_sub: c.sub, picture: c.picture ?? null });
  else await env.DB.prepare('UPDATE users SET google_sub=?, picture=COALESCE(?,picture) WHERE id=?').bind(c.sub, c.picture ?? null, u.id).run().catch(() => undefined); // read-only D1: sign in anyway
  u = (await getUser(env, u.id)) as UserRow;
  return issue(env, u, { picture: c.picture ?? null });
}

export async function refresh(env: Env, body: Record<string, unknown>, ip: string | null = null) {
  const token = str(body.refreshToken, 2000);
  // Stateless refresh JWT (issued while D1 was read-only).
  if (token.split('.').length === 3) {
    const c = await verifyJwt<{ sub: string; tv: number; typ?: string }>(token, env.JWT_SECRET);
    if (!c || c.typ !== 'refresh') return fail(401, 'invalid_refresh', 'Session expired');
    const u = await getUser(env, c.sub);
    if (!u || u.token_version !== c.tv) return fail(401, 'invalid_refresh', 'Session expired');
    return issue(env, u, {}, token); // upgrades to a D1 session when writes work again
  }
  const id = await sha256(token);
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<{ user_id: string; exp: number; family?: string | null; rotated_at?: number | null }>();
  if (!s || s.exp < Date.now()) return fail(401, 'invalid_refresh', 'Session expired');
  const u = await getUser(env, s.user_id);
  if (!u) return fail(401, 'invalid_refresh', 'Session expired');
  if (!('family' in s)) {
    // Before migration 0009: rotate by deleting.
    let rotated = true;
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();
    } catch {
      rotated = false; // read-only D1: keep using the same refresh token
    }
    return issue(env, u, {}, rotated ? undefined : token);
  }
  const family = s.family || uid('f_');
  if (s.rotated_at) {
    if (Date.now() - s.rotated_at <= REUSE_GRACE_MS) return issue(env, u, {}, undefined, family); // parallel refresh race
    // An old, already-rotated token came back: someone else holds a copy. Kill the whole family.
    await env.DB.prepare('DELETE FROM sessions WHERE family=?').bind(family).run().catch(() => undefined);
    secEvent('refresh_reuse', ip, { who: u.email, detail: `family ${family.slice(0, 8)}` });
    return fail(401, 'invalid_refresh', 'Session expired');
  }
  let rotated = true;
  try {
    await env.DB.prepare('UPDATE sessions SET rotated_at=? WHERE id=?').bind(Date.now(), id).run();
  } catch {
    rotated = false; // read-only D1: keep using the same refresh token
  }
  return issue(env, u, {}, rotated ? undefined : token, family);
}
export async function logout(env: Env, body: Record<string, unknown>) {
  const id = await sha256(str(body.refreshToken, 2000));
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first<{ family?: string | null }>().catch(() => null);
  if (s?.family) await env.DB.prepare('DELETE FROM sessions WHERE family=?').bind(s.family).run().catch(() => undefined);
  else await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run().catch(() => undefined);
  return { ok: true };
}

export async function authenticate(env: Env, req: Request): Promise<Authed | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return null;
  const claims = await verifyJwt<{ sub: string; tv: number; typ?: string }>(token, env.JWT_SECRET);
  // Refresh JWTs and admin 2FA passes are not access tokens (tokens from before typ existed have none).
  if (!claims || (claims.typ !== undefined && claims.typ !== 'access')) return null;
  const user = await getUser(env, claims.sub);
  if (!user || user.token_version !== claims.tv) return null;
  return { user, admin: isAdminEmail(env, user.email) };
}

export async function changePassword(env: Env, u: UserRow, body: Record<string, unknown>) {
  if (u.pass_hash && !(await verifyPassword(String(body.current ?? ''), u.pass_hash, u.pass_salt ?? ''))) fail(400, 'wrong_password', 'الباسورد الحالي غلط');
  if (String(body.next ?? '').length < 8) fail(400, 'invalid_body', 'الباسورد قصير');
  const { hash, salt } = await hashPassword(String(body.next));
  await env.DB.prepare('UPDATE users SET pass_hash=?, pass_salt=? WHERE id=?').bind(hash, salt, u.id).run();
  return { ok: true };
}
