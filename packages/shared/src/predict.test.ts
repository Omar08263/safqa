import { describe, expect, it } from 'vitest';
import { nextRetailEvent } from './calendar';
import { predictBuyTiming } from './predict';
import { stackPrice } from './stack';
import { affiliateUrl, cdnImage } from './cdn';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('predictBuyTiming', () => {
  it('says buy when the price is sitting on the 90-day low', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      priceEGP: 20000 - index * 100,
      capturedAt: day(`2026-05-${String(index + 1).padStart(2, '0')}`),
    }));
    const forecast = predictBuyTiming({
      history,
      current: 14999,
      now: day('2026-06-01'),
      daysUntilEvent: 40,
    });
    expect(forecast.recommendation).toBe('buy_now');
  });

  it('says wait when a sale is close and the price is not the low', () => {
    const history = [
      { priceEGP: 14000, capturedAt: day('2026-09-01') },
      { priceEGP: 18000, capturedAt: day('2026-10-01') },
      { priceEGP: 18000, capturedAt: day('2026-10-15') },
      { priceEGP: 18000, capturedAt: day('2026-11-01') },
    ];
    const forecast = predictBuyTiming({
      history,
      current: 18000,
      now: day('2026-11-10'),
      daysUntilEvent: 1,
    });
    expect(forecast.recommendation).toBe('wait');
    expect(forecast.reasonAr).toContain('يوم');
  });
});

describe('stackPrice', () => {
  it('applies a capped bank percent and then a coupon', () => {
    const stacked = stackPrice(10000, [
      { id: 'cib', label: 'CIB', kind: 'bank', percent: 10, capEgp: 400 },
      { id: 'code', label: 'SAFQA', kind: 'coupon', amountEgp: 50 },
    ]);
    expect(stacked.savedEgp).toBe(450);
    expect(stacked.finalEgp).toBe(9550);
  });

  it('skips a coupon under the minimum spend', () => {
    const stacked = stackPrice(100, [
      { id: 'code', label: 'SAFQA', kind: 'coupon', amountEgp: 50, minSpendEgp: 500 },
    ]);
    expect(stacked.finalEgp).toBe(100);
    expect(stacked.skipped).toEqual([{ id: 'code', reason: 'min_spend' }]);
  });
});

describe('retail calendar', () => {
  it('names 11.11 as the next event on 10 Nov 2026', () => {
    expect(nextRetailEvent(day('2026-11-10'))?.id).toBe('11.11');
  });
});

describe('affiliate and cdn', () => {
  it('adds a partner tag only for the configured store', () => {
    expect(
      affiliateUrl('https://www.amazon.eg/dp/1', 'amazon-eg', 'amazon-eg:tag=safqa-21'),
    ).toBe('https://www.amazon.eg/dp/1?tag=safqa-21');
    expect(affiliateUrl('https://btech.com/p', 'btech', 'amazon-eg:tag=safqa-21')).toBe(
      'https://btech.com/p',
    );
  });

  it('prefixes images when a CDN base is set', () => {
    expect(cdnImage('https://cdn.example/a.jpg', 'https://images.safqa.example')).toBe(
      'https://images.safqa.example/https%3A%2F%2Fcdn.example%2Fa.jpg',
    );
    expect(cdnImage(null, 'https://images.safqa.example')).toBeNull();
  });
});
