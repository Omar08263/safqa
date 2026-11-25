// Also the threat-strike ledger (score per client, escalating bans, top offenders).
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

  // ---------- threat strikes (see threat.ts): score per client, escalating bans, top offenders ----------
  private threats = new Map<string, { score: number; since: number; hits: number; last: number; reasons: string[]; bans: number; until: number; ua: string; paths: string[] }>();

  async strike(client: string, points: number, reason: string, meta: { path?: string; ua?: string } = {}) {
    const now = Date.now();
    if (this.threats.size > 20_000) for (const [k, v] of this.threats) if (v.last < now - 86400_000 && v.until < now) this.threats.delete(k);
    let t = this.threats.get(client);
    if (!t) { t = { score: 0, since: now, hits: 0, last: now, reasons: [], bans: 0, until: 0, ua: '', paths: [] }; this.threats.set(client, t); }
    if (now - t.since > 3600_000) { t.score = 0; t.since = now; } // 1-hour scoring window
    t.score += points; t.hits++; t.last = now;
    if (!t.reasons.includes(reason)) t.reasons = [...t.reasons, reason].slice(-8);
    if (meta.path) t.paths = [...t.paths.filter((p) => p !== meta.path), meta.path].slice(-6);
    if (meta.ua) t.ua = meta.ua.slice(0, 120);
    this.feed.unshift({ at: now, client, points, reason, path: meta.path ?? null, ua: meta.ua?.slice(0, 80) ?? null });
    if (this.feed.length > 150) this.feed.length = 150;
    let banned: { until: number; level: number } | null = null;
    if (t.score >= 30 && t.until < now) {
      t.bans++;
      const steps = [60, 360, 1440, 10080];
      t.until = now + steps[Math.min(steps.length, t.bans) - 1]! * 60_000;
      t.score = 0; t.since = now;
      banned = { until: t.until, level: t.bans };
    }
    return { score: t.score, until: t.until, newBan: banned };
  }
  private feed: { at: number; client: string; points: number; reason: string; path: string | null; ua: string | null }[] = [];
  async recent(n = 50) { return this.feed.slice(0, n); }
  async status(client: string) {
    const t = this.threats.get(client);
    return t && t.until > Date.now() ? t.until : 0;
  }
  async top(n = 20) {
    return [...this.threats.entries()].map(([client, t]) => ({ client, ...t })).sort((a, b) => b.bans * 1000 + b.hits - (a.bans * 1000 + a.hits)).slice(0, n);
  }
  async release(client: string) {
    const t = this.threats.get(client);
    if (t) { t.until = 0; t.score = 0; }
    return true;
  }
}
