// D1 write-budget meter + guard.
// Facts (verified Nov 2026, developers.cloudflare.com/d1/platform/pricing): the Workers Free plan allows
// 100,000 rows written per day PER ACCOUNT (all databases together), resetting 00:00 UTC (02:00 Cairo);
// index entries count as extra written rows. When exceeded, every write on the account fails until reset.
// So: meter every write (D1 returns meta.rows_written), keep background jobs far below the cap, and never
// block user actions with the guard.
import type { Env } from '../util';

export const CAP = 100_000;
/** Background jobs (feeds, recrawl, hunter batches) stop at this many metered rows/day. */
export const BG_CAP = 40_000;
/** Everything non-essential (smart digests, AI headlines, telemetry) stops here; user actions are never blocked. */
export const SOFT_CAP = 70_000;

const acc = new Map<string, { rows: number; ops: number }>();
let current = 'api';
let lastFlush = Date.now();
export const setJob = (j: string) => { current = j; };
export const day = (d = new Date()) => d.toISOString().slice(0, 10); // UTC day = D1's reset boundary

export function meter(job: string, res: unknown) {
  const m = (res as { meta?: { rows_written?: number; changes?: number } } | null)?.meta;
  const rows = Number(m?.rows_written ?? 0);
  if (!rows) return;
  const a = acc.get(job) ?? { rows: 0, ops: 0 };
  a.rows += rows; a.ops += 1; acc.set(job, a);
}
export const pending = () => [...acc.values()].reduce((s, a) => s + a.rows, 0);

const RAW = Symbol('raw');
type Stmt = D1PreparedStatement & { [RAW]?: D1PreparedStatement };
function wrapStmt(s: D1PreparedStatement): D1PreparedStatement {
  return new Proxy(s, {
    get(t, k) {
      if (k === RAW) return t;
      if (k === 'bind') return (...a: unknown[]) => wrapStmt(t.bind(...a));
      if (k === 'run' || k === 'all') return async (...a: unknown[]) => { const job = current; try { const r = await (t[k] as (...x: unknown[]) => Promise<unknown>).apply(t, a); meter(job, r); return r; } catch (e) { noteLimit(e); throw e; } };
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  });
}
/** Wrap a D1 binding so every run()/all()/batch() result is metered under the current job. */
export function metered(db: D1Database): D1Database {
  if ((db as unknown as { [RAW]?: unknown })[RAW]) return db;
  return new Proxy(db, {
    get(t, k) {
      if (k === RAW) return t;
      if (k === 'prepare') return (q: string) => wrapStmt(t.prepare(q));
      if (k === 'batch') return async (stmts: Stmt[]) => { const job = current; try { const r = await t.batch(stmts.map((s) => s[RAW] ?? s)); r.forEach((x) => meter(job, x)); return r; } catch (e) { noteLimit(e); throw e; } };
      const v = (t as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  });
}

/** Set when D1 itself says the account's daily write limit is exhausted: everything background stops until 00:00 UTC. */
let exhaustedDay: string | null = null;
function noteLimit(e: unknown) { if (/row write limit|exceeded D1's free tier/i.test(String(e))) exhaustedDay = day(); }
export const exhausted = () => exhaustedDay === day();

let usedCache: { at: number; day: string; rows: number } | null = null;
/** Metered rows written today (Worker + box/hunter pushes that report in). Cached 60 s per isolate. */
export async function usedToday(env: Env): Promise<number> {
  const d = day();
  if (usedCache && usedCache.day === d && Date.now() - usedCache.at < 60_000) return usedCache.rows + pending();
  try {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(rows),0) AS n FROM wbudget WHERE day=?').bind(d).first<{ n: number }>();
    usedCache = { at: Date.now(), day: d, rows: Number(r?.n ?? 0) };
  } catch { usedCache = { at: Date.now(), day: d, rows: 0 }; }
  return usedCache.rows + pending();
}
/** May a background job spend `need` more rows today? */
export async function allow(env: Env, need = 50, cap = BG_CAP): Promise<boolean> {
  if (exhausted()) return false;
  return (await usedToday(env)) + need <= cap;
}

/** Persist metered counts (one upsert per job) and mirror them to Analytics Engine (free, separate quota). */
export async function flush(env: Env, force = false) {
  if (!acc.size) return;
  if (!force && pending() < 25 && Date.now() - lastFlush < 120_000) return; // batch HTTP-side counts
  const d = day(); const items = [...acc.entries()]; acc.clear(); lastFlush = Date.now();
  try {
    const raw = (env.DB as unknown as { [RAW]?: D1Database })[RAW] ?? env.DB;
    await raw.batch(items.map(([job, a]) => raw.prepare('INSERT INTO wbudget (day,job,rows,ops) VALUES (?,?,?,?) ON CONFLICT(day,job) DO UPDATE SET rows=rows+excluded.rows, ops=ops+excluded.ops').bind(d, job, a.rows + 1, a.ops)));
    if (usedCache?.day === d) usedCache.rows += items.reduce((s, [, a]) => s + a.rows + 1, 0);
  } catch { /* table not created yet or limit hit: telemetry is best-effort */ }
  for (const [job, a] of items) aePoint(env, 'writes', [job], [a.rows, a.ops]);
}

/** Workers Analytics Engine data point (free: 100k points/day, 3-month retention). No-op without the binding. */
export function aePoint(env: Env, kind: string, blobs: string[], doubles: number[], index?: string) {
  try { env.OBS?.writeDataPoint({ indexes: [index ?? kind], blobs: [kind, ...blobs].slice(0, 20), doubles: doubles.slice(0, 20) }); } catch { /* best effort */ }
}

export async function report(env: Env) {
  const d = day();
  let jobs: { job: string; rows: number; ops: number }[] = [];
  let week: { day: string; rows: number }[] = [];
  try {
    jobs = (await env.DB.prepare('SELECT job, rows, ops FROM wbudget WHERE day=? ORDER BY rows DESC').bind(d).all<{ job: string; rows: number; ops: number }>()).results;
    week = (await env.DB.prepare('SELECT day, SUM(rows) AS rows FROM wbudget GROUP BY day ORDER BY day DESC LIMIT 7').all<{ day: string; rows: number }>()).results;
  } catch { /* not migrated yet */ }
  const used = jobs.reduce((s, j) => s + j.rows, 0);
  const resetsAt = new Date(`${d}T00:00:00Z`); resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
  return {
    day: d, cap: CAP, bgCap: BG_CAP, softCap: SOFT_CAP, used, pct: Math.round((used / CAP) * 1000) / 10,
    exhausted: exhausted(),
    state: exhausted() || used >= SOFT_CAP ? 'red' : used >= BG_CAP ? 'amber' : 'green',
    jobs, week, resetsAt: resetsAt.toISOString(),
    note: 'Metered by the Worker from D1 meta.rows_written plus pushes that report in; the account-wide truth is in Cloudflare analytics (cli.ts budget).',
  };
}
