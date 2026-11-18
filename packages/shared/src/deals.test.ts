import { describe, expect, it } from 'vitest';
import { claimedDiscountPct, detectFakeDiscount, median, scoreDeal } from './deals';

const now = new Date('2026-11-10T00:00:00Z');

function days(count: number, price: number) {
  return Array.from({ length: count }, (_, index) => ({
    priceEGP: price,
    capturedAt: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000),
  }));
}

describe('detectFakeDiscount', () => {
  it('flags a struck-through price that sits far above the 30-day median', () => {
    const result = detectFakeDiscount({
      priceEGP: 14900,
      listPriceEGP: 24999,
      history: days(12, 15000),
      now,
    });
    expect(result.flagged).toBe(true);
    expect(result.reason).toBe('inflated_was');
    expect(result.realDiscountVsMedianPct ?? 0).toBeLessThan(5);
  });

  it('does not flag a real drop below the recent median', () => {
    const result = detectFakeDiscount({
      priceEGP: 15000,
      listPriceEGP: 19999,
      history: days(12, 20000),
      now,
    });
    expect(result.flagged).toBe(false);
    expect(result.realDiscountVsMedianPct ?? 0).toBeGreaterThan(20);
  });

  it('stays quiet when there is no list price', () => {
    expect(
      detectFakeDiscount({ priceEGP: 100, history: days(5, 100), now }).flagged,
    ).toBe(false);
  });
});

describe('scoreDeal', () => {
  it('scores a genuine drop higher than an inflated was-price', () => {
    const real = scoreDeal({
      priceEGP: 15000,
      listPriceEGP: 19999,
      inStock: true,
      history: days(20, 20000),
      now,
    });
    const fake = scoreDeal({
      priceEGP: 14900,
      listPriceEGP: 24999,
      inStock: true,
      history: days(20, 15000),
      now,
    });
    expect(real.score).toBeGreaterThan(fake.score);
    expect(real.label === 'great' || real.label === 'good').toBe(true);
    expect(fake.fake.flagged).toBe(true);
    expect(fake.factors.some((factor) => factor.startsWith('fake:'))).toBe(true);
  });

  it('rewards the cheapest in-stock offer', () => {
    const cheapest = scoreDeal({
      priceEGP: 1000,
      inStock: true,
      history: days(8, 1000),
      competitorPrices: [1200, 1300],
      now,
    });
    const pricier = scoreDeal({
      priceEGP: 1300,
      inStock: true,
      history: days(8, 1000),
      competitorPrices: [1000, 1200],
      now,
    });
    expect(cheapest.factors).toContain('cheapest-store');
    expect(cheapest.score).toBeGreaterThan(pricier.score);
  });
});

describe('median', () => {
  it('averages the two middle values for an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('claimedDiscountPct', () => {
  it('returns null when the list price is not above the current price', () => {
    expect(claimedDiscountPct(100, 90)).toBeNull();
    expect(claimedDiscountPct(80, 100)).toBe(20);
  });
});
