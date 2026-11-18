import { describe, expect, it } from 'vitest';
import { evaluateAlertTransition } from './alerts';
import { scheduleFor } from './schedule';

const enabled = { priceDrop: true, backInStock: true, targetHit: true };

describe('evaluateAlertTransition', () => {
  it('emits a price drop only after the configured percent', () => {
    expect(
      evaluateAlertTransition({
        previousPrice: 1000,
        currentPrice: 900,
        wasInStock: true,
        inStock: true,
        targetPrice: null,
        minDropPct: 5,
        enabled,
      }).map((event) => event.type),
    ).toEqual(['price_drop']);

    expect(
      evaluateAlertTransition({
        previousPrice: 1000,
        currentPrice: 970,
        wasInStock: true,
        inStock: true,
        targetPrice: null,
        minDropPct: 5,
        enabled,
      }),
    ).toEqual([]);
  });

  it('emits back in stock and a freshly crossed target', () => {
    const events = evaluateAlertTransition({
      previousPrice: 1200,
      currentPrice: 800,
      wasInStock: false,
      inStock: true,
      targetPrice: 900,
      minDropPct: 5,
      enabled,
    });
    expect(events.map((event) => event.type)).toEqual([
      'price_drop',
      'back_in_stock',
      'target_hit',
    ]);
  });

  it('does not re-fire a target that was already met', () => {
    expect(
      evaluateAlertTransition({
        previousPrice: 800,
        currentPrice: 790,
        wasInStock: true,
        inStock: true,
        targetPrice: 900,
        minDropPct: 5,
        enabled: { ...enabled, priceDrop: false },
      }),
    ).toEqual([]);
  });
});

describe('scheduleFor', () => {
  it('checks watched and strong deals more often than the long tail', () => {
    expect(scheduleFor({ watcherCount: 0, dealScore: 40, volatility: 0 }).heat).toBe('cold');
    expect(scheduleFor({ watcherCount: 1, dealScore: 40, volatility: 0 }).intervalMinutes).toBe(360);
    expect(scheduleFor({ watcherCount: 5, dealScore: 50, volatility: 0 })).toMatchObject({
      heat: 'hot',
      intervalMinutes: 60,
    });
    expect(scheduleFor({ watcherCount: 0, dealScore: 88, volatility: 0 }).heat).toBe('hot');
  });
});
