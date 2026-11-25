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

export async function allow(env: Partial<Record<LimiterName, RateLimiter>>, name: LimiterName, key: string): Promise<boolean> {
  const b = env[name];
  if (!b) return localLimit(name, key);
  try {
    return (await b.limit({ key })).success;
  } catch {
    return localLimit(name, key); // binding hiccup: never fail open entirely
  }
}
