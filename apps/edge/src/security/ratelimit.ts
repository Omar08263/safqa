// Request rate limiting with Cloudflare's Workers Rate Limiting bindings: counters
// live in Cloudflare's edge memory, so they cost zero D1/KV writes (free on every plan).
// Each binding is per Cloudflare location — good enough against floods and brute force;
// the slower, global per-account limits (login lockout, uploads per day) stay in D1.
export interface RateLimiter { limit(o: { key: string }): Promise<{ success: boolean }> }
export type LimiterName = 'RL_IP' | 'RL_AUTH' | 'RL_WRITE' | 'RL_NONCE' | 'RL_OTP';

/** Fallback when a binding is missing (local dev, tests): same limits, in isolate memory. */
const LOCAL: Record<LimiterName, [number, number]> = { RL_IP: [240, 60], RL_AUTH: [20, 60], RL_WRITE: [60, 60], RL_NONCE: [1, 60], RL_OTP: [5, 60] };
const mem = new Map<string, { n: number; reset: number }>();
function localLimit(name: LimiterName, key: string, now = Date.now()) {
  const [limit, period] = LOCAL[name];
  const k = `${name}|${key}`;
  const e = mem.get(k);
  if (!e || e.reset <= now) {
    if (mem.size > 20_000) mem.clear();
    mem.set(k, { n: 1, reset: now + period * 1000 });
    return true;
  }
  e.n++;
  return e.n <= limit;
}
export const _resetLocalLimits = () => mem.clear();

/** Limiters that go through the strict Durable Object counter (low-volume, security-critical). */
const STRICT: Partial<Record<LimiterName, true>> = { RL_AUTH: true, RL_NONCE: true, RL_OTP: true };
interface LimiterNs { idFromName(n: string): unknown; get(id: unknown): { hit(key: string, limit: number, period: number): Promise<boolean> } }

/**
 * Layered: isolate memory (always) + Workers Rate Limiting binding (approximate, per location)
 * + for STRICT limiters a Durable Object counter (exact). Any layer saying "no" blocks.
 */
export async function allow(env: Partial<Record<LimiterName, RateLimiter>> & { RL_DO?: unknown }, name: LimiterName, key: string): Promise<boolean> {
  if (!localLimit(name, key)) return false;
  const b = env[name];
  if (b) {
    try { if (!(await b.limit({ key })).success) return false; } catch { /* binding hiccup: other layers still apply */ }
  }
  const ns = env.RL_DO as LimiterNs | undefined;
  if (STRICT[name] && ns) {
    const [limit, period] = LOCAL[name];
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    try { return await ns.get(ns.idFromName(`${name}:${h % 8}`)).hit(key, limit, period); } catch (e) { console.log("rl_do error", String(e).slice(0, 160)); return true; } // DO quota/outage: memory + binding already checked
  }
  return true;
}
