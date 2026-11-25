import { describe, expect, it } from 'vitest';
import { forecast, seasonOn } from './forecast';

describe('forecast', () => {
  it('knows White Friday and Ramadan windows', () => {
    expect(seasonOn(new Date('2026-11-25T12:00:00'))?.id).toBe('white-friday');
    expect(seasonOn(new Date('2027-02-20T12:00:00'))?.id).toBe('ramadan');
    expect(seasonOn(new Date('2026-10-10T12:00:00'))).toBeNull();
  });
  it('says buy now during a big season', () => {
    const f = forecast([], 10000, 'audio', 30, new Date('2026-11-25T12:00:00'));
    expect(f.verdict).toBe('buy_now');
    expect(f.points).toHaveLength(30);
    for (const p of f.points) expect(p.lo).toBeLessThan(p.hi);
  });
  it('waits when a season is coming', () => {
    const f = forecast([], 20000, 'laptops', 45, new Date('2026-08-20T12:00:00'));
    expect(f.verdict).toBe('wait');
    expect(f.low.p).toBeLessThan(20000);
  });
  it('trusts a long rising history', () => {
    const t0 = Date.parse('2026-06-01');
    const h = Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * 3 * 86400_000, p: 1000 * (1 + i * 0.01) }));
    const f = forecast(h, 1300, 'default', 20, new Date('2026-10-01T12:00:00'));
    expect(f.slopeDay).toBeGreaterThan(0);
    expect(f.confidence).toBeGreaterThan(0.6);
  });
});
