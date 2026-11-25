// Small key/value state in D1 (1 row written per put). Workers KV's free tier allows only 1,000 writes/day,
// which 10-minute crons alone would nearly exhaust; D1 has 100k/day. Falls back to KV until migration 0007 runs.
import type { Env } from '../util';

let ready: boolean | null = null;
export async function ensureState(env: Env) {
  if (ready) return true;
  try {
    await env.DB.prepare('SELECT 1 FROM kstate LIMIT 1').first();
    ready = true;
  } catch {
    try {
      await env.DB.batch([
        env.DB.prepare('CREATE TABLE IF NOT EXISTS kstate (key TEXT PRIMARY KEY, value TEXT NOT NULL, exp INTEGER) WITHOUT ROWID'),
        env.DB.prepare('CREATE TABLE IF NOT EXISTS wbudget (day TEXT NOT NULL, job TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 0, ops INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, job)) WITHOUT ROWID'),
      ]);
      ready = true;
    } catch { ready = false; }
  }
  return ready;
}
export async function sget(env: Env, key: string): Promise<string | null> {
  try {
    const r = await env.DB.prepare('SELECT value, exp FROM kstate WHERE key=?').bind(key).first<{ value: string; exp: number | null }>();
    if (r && (!r.exp || r.exp > Date.now())) return r.value;
    if (r) return null;
  } catch { /* not migrated */ }
  return env.KV.get(key);
}
export async function sput(env: Env, key: string, value: string, ttlSec?: number) {
  try {
    await env.DB.prepare('INSERT INTO kstate (key,value,exp) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, exp=excluded.exp').bind(key, value, ttlSec ? Date.now() + ttlSec * 1000 : null).run();
  } catch { await env.KV.put(key, value, ttlSec ? { expirationTtl: Math.max(60, ttlSec) } : undefined).catch(() => undefined); }
}
/** Edge-cache helper (Cache API: free, no write quota) for short-lived derived values that used KV with a 5-min TTL. */
export async function edgeCacheGet<T>(key: string): Promise<T | null> {
  const hit = await caches.default.match(`https://cache.safqa.internal/${encodeURIComponent(key)}`).catch(() => undefined);
  return hit ? ((await hit.json()) as T) : null;
}
export async function edgeCachePut(key: string, value: unknown, ttlSec: number) {
  await caches.default.put(`https://cache.safqa.internal/${encodeURIComponent(key)}`, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSec}` } })).catch(() => undefined);
}
