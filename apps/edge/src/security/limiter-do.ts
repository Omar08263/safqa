// Strict, strongly-consistent rate limiter for the security-critical paths (sign-in,
// refresh, pairing, 2FA codes, request nonces). One Durable Object per limiter shard;
// counters live in memory only (no storage writes, nothing billed beyond the free DO
// request quota). If the object is evicted the window restarts — acceptable for a limiter.
// Why not only the Workers Rate Limiting binding: it is approximate and, on this account,
// was measured returning success:true for every call (cloudflare/workers-sdk#16097).
import { DurableObject } from 'cloudflare:workers';

export class RateLimiterDO extends DurableObject {
  private counts = new Map<string, { n: number; reset: number }>();

  async hit(key: string, limit: number, periodSec: number): Promise<boolean> {
    const now = Date.now();
    if (this.counts.size > 50_000) for (const [k, v] of this.counts) if (v.reset <= now) this.counts.delete(k);
    const e = this.counts.get(key);
    if (!e || e.reset <= now) { this.counts.set(key, { n: 1, reset: now + periodSec * 1000 }); return true; }
    e.n++;
    return e.n <= limit;
  }
}
