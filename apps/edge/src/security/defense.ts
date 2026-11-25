// Active defense (I/O side of threat.ts): strikes → escalating bans, the live attack
// feed and the Hub's top offenders. All state is in the RL_DO shards (memory only) and
// the existing KV ban list; a new ban costs one KV write, nothing else touches storage.
import { verifyJwt, type Env } from '../util';
import { banMemory, secEvent } from './audit';
import { ipBucket } from './guard';

const SHARDS = 8;
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
type Strike = { score: number; until: number; newBan: { until: number; level: number } | null };
type DOStub = { strike(c: string, p: number, r: string, m: object): Promise<Strike>; top(n: number): Promise<Offender[]>; recent(n: number): Promise<FeedItem[]>; release(c: string): Promise<boolean> };
export interface Offender { client: string; score: number; hits: number; last: number; reasons: string[]; bans: number; until: number; ua: string; paths: string[] }
export interface FeedItem { at: number; client: string; points: number; reason: string; path: string | null; ua: string | null }
const stub = (env: Env, name: string) => env.RL_DO!.get(env.RL_DO!.idFromName(name)) as unknown as DOStub;
const shardOf = (client: string) => `threat:${hash(client) % SHARDS}`;

// Local fallback when the DO is unreachable (tests / outage): same rules, this isolate only.
const local = new Map<string, { score: number; since: number; bans: number; until: number }>();
function localStrike(client: string, points: number): Strike {
  const now = Date.now();
  const t = local.get(client) ?? { score: 0, since: now, bans: 0, until: 0 };
  if (now - t.since > 3600_000) { t.score = 0; t.since = now; }
  t.score += points;
  let newBan = null;
  if (t.score >= 30 && t.until < now) { t.bans++; const steps = [60, 360, 1440, 10080]; t.until = now + steps[Math.min(4, t.bans) - 1]! * 60_000; t.score = 0; newBan = { until: t.until, level: t.bans }; }
  local.set(client, t);
  return { score: t.score, until: t.until, newBan };
}

let kvBansToday = { day: '', n: 0 };
const KV_BAN_CAP = 300; // KV free tier is 1,000 writes/day; leave room for everything else

/** Add threat points for a client (IP bucket). Returns the ban expiry if the client is (now) banned. */
export async function strike(env: Env, ip: string | null, points: number, reason: string, meta: { path?: string; ua?: string } = {}): Promise<number> {
  const client = ipBucket(ip);
  if (!client || points <= 0) return 0;
  let r: Strike;
  try { r = env.RL_DO ? await stub(env, shardOf(client)).strike(client, points, reason, meta) : localStrike(client, points); }
  catch (e) { console.log('threat do error', String(e).slice(0, 80)); r = localStrike(client, points); }
  if (r.newBan) {
    banMemory(client, r.newBan.until);
    const day = new Date().toISOString().slice(0, 10);
    if (kvBansToday.day !== day) kvBansToday = { day, n: 0 };
    if (kvBansToday.n++ < KV_BAN_CAP) await persistBan(env, client, r.newBan.until).catch(() => undefined);
    secEvent('auto_ban', ip, { path: meta.path ?? null, detail: `level ${r.newBan.level} · ${Math.round((r.newBan.until - Date.now()) / 60_000)} min · ${reason}` });
  }
  return r.until > Date.now() ? r.until : 0;
}
async function persistBan(env: Env, client: string, until: number) {
  const cur = ((await env.KV.get('sec:bans', 'json').catch(() => null)) as Record<string, number> | null) ?? {};
  const now = Date.now();
  for (const [k, v] of Object.entries(cur)) if (v < now) delete cur[k];
  cur[client] = until;
  await env.KV.put('sec:bans', JSON.stringify(cur));
}

/** Release a client in every layer (owner action from the Hub). */
export async function release(env: Env, client: string) {
  try { if (env.RL_DO) await stub(env, shardOf(client)).release(client); } catch { /* */ }
  local.delete(client);
}

/** A request carrying a genuinely signed access token belongs to a real account: CGNAT means
 *  many Egyptian mobile users share one IP, so an IP ban must not lock them out. */
export async function hasValidSession(env: Env, req: Request): Promise<boolean> {
  const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!tok || tok.length > 4096 || !env.JWT_SECRET) return false;
  const p = await verifyJwt<{ typ?: string; exp?: number }>(tok, env.JWT_SECRET).catch(() => null);
  return Boolean(p && (p.typ === undefined || p.typ === 'access'));
}

// ---------- rapid-404 and credential-stuffing detectors (pre-aggregated in memory) ----------
const nf = new Map<string, { n: number; reset: number }>();
/** Count a 404; every 8th within a minute costs 10 points (a scanner walks paths, a user doesn't). */
export function note404(ip: string | null): number {
  const k = ipBucket(ip); if (!k) return 0;
  const now = Date.now();
  if (nf.size > 20_000) nf.clear();
  const e = nf.get(k);
  if (!e || e.reset < now) { nf.set(k, { n: 1, reset: now + 60_000 }); return 0; }
  e.n++;
  return e.n % 8 === 0 ? 10 : 0;
}
const stuff = new Map<string, { emails: Set<string>; reset: number }>();
/** Failed logins for many DIFFERENT emails from one client = credential stuffing (20 points from the 10th email in 15 min).
 *  Typos on one account cost nothing here (the per-account lockout handles those; CGNAT IPs are shared). */
export function noteLoginFail(ip: string | null, email: string): number {
  const k = ipBucket(ip); if (!k) return 0;
  const now = Date.now();
  if (stuff.size > 20_000) stuff.clear();
  let e = stuff.get(k);
  if (!e || e.reset < now) { e = { emails: new Set(), reset: now + 15 * 60_000 }; stuff.set(k, e); }
  e.emails.add(email.slice(0, 120));
  return e.emails.size >= 10 ? 20 : 0;
}

// ---------- Hub: live feed + top offenders across all shards ----------
export async function liveView(env: Env) {
  if (!env.RL_DO) return { feed: [] as FeedItem[], offenders: [] as Offender[] };
  const shards = Array.from({ length: SHARDS }, (_, i) => stub(env, `threat:${i}`));
  const [feeds, tops] = await Promise.all([
    Promise.all(shards.map((s) => s.recent(40).catch(() => [] as FeedItem[]))),
    Promise.all(shards.map((s) => s.top(10).catch(() => [] as Offender[]))),
  ]);
  return {
    feed: feeds.flat().sort((a, b) => b.at - a.at).slice(0, 120),
    offenders: tops.flat().sort((a, b) => b.bans * 1000 + b.hits - (a.bans * 1000 + a.hits)).slice(0, 25),
  };
}
export const _defState = () => ({ local, nf, stuff });
