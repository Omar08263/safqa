import type { DomainRateLimiter } from './types';

/**
 * One in-flight gap per hostname. The wait is injected so tests can observe
 * the delay without sleeping.
 */
export class MemoryRateLimiter implements DomainRateLimiter {
  private nextAt = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  ) {}

  async take(hostname: string, minIntervalMs: number): Promise<void> {
    const now = this.now();
    const earliest = this.nextAt.get(hostname) ?? now;
    const start = Math.max(now, earliest);
    this.nextAt.set(hostname, start + minIntervalMs);
    const delay = start - now;
    if (delay > 0) await this.wait(delay);
  }
}
