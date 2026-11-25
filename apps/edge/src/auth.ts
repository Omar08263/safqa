import { verifyGoogleIdToken } from './google';
import { tierById } from './tiers';
import { type Env, fail, hashPassword, nowIso, parseJ, sha256, signJwt, str, uid, verifyJwt, verifyPassword } from './util';

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

export async function issue(env: Env, u: UserRow, extra: Record<string, unknown> = {}) {
  const accessToken = await signJwt({ sub: u.id, tv: u.token_version }, env.JWT_SECRET, 3600);
  const refresh = uid('r_') + uid();
  await env.DB.prepare('INSERT INTO sessions (id,user_id,exp,created_at) VALUES (?,?,?,?)').bind(await sha256(refresh), u.id, Date.now() + 60 * 86400_000, nowIso()).run();
  await env.DB.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(nowIso(), u.id).run();
  return { accessToken, refreshToken: refresh, user: publicUser(u, env), ...extra };
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

export async function login(env: Env, body: Record<string, unknown>) {
  const u = await getUserByEmail(env, str(body.email, 200));
  if (!u?.pass_hash || !u.pass_salt || !(await verifyPassword(String(body.password ?? ''), u.pass_hash, u.pass_salt)))
    fail(401, 'invalid_credentials', 'الإيميل أو الباسورد غلط');
  return issue(env, u as UserRow);
}

export async function google(env: Env, body: Record<string, unknown>) {
  const credential = str(body.credential, 4096);
  let c;
  try {
    c = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return fail(401, 'invalid_google_token', `Google token rejected: ${(e as Error).message}`);
  }
  let u = await getUserByEmail(env, c.email);
  if (!u) u = await createUser(env, c.email, c.name || c.email, { google_sub: c.sub, picture: c.picture ?? null });
  else await env.DB.prepare('UPDATE users SET google_sub=?, picture=COALESCE(?,picture) WHERE id=?').bind(c.sub, c.picture ?? null, u.id).run();
  u = (await getUser(env, u.id)) as UserRow;
  return issue(env, u, { picture: c.picture ?? null });
}

export async function refresh(env: Env, body: Record<string, unknown>) {
  const id = await sha256(str(body.refreshToken, 200));
  const s = await env.DB.prepare('SELECT user_id, exp FROM sessions WHERE id=?').bind(id).first<{ user_id: string; exp: number }>();
  if (!s || s.exp < Date.now()) fail(401, 'invalid_refresh', 'Session expired');
  await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run(); // rotate
  const u = await getUser(env, (s as { user_id: string }).user_id);
  if (!u) return fail(401, 'invalid_refresh', 'Session expired');
  return issue(env, u);
}
export async function logout(env: Env, body: Record<string, unknown>) {
  await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await sha256(str(body.refreshToken, 200))).run();
  return { ok: true };
}

export async function authenticate(env: Env, req: Request): Promise<Authed | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return null;
  const claims = await verifyJwt<{ sub: string; tv: number }>(token, env.JWT_SECRET);
  if (!claims) return null;
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
