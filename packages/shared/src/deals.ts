export interface PriceSample {
  priceEGP: number;
  capturedAt: Date;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

export function pricesWithin(history: PriceSample[], days: number, now: Date): number[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return history
    .filter((point) => point.capturedAt.getTime() >= cutoff)
    .map((point) => point.priceEGP);
}

export interface FakeDiscountResult {
  flagged: boolean;
  reason?: 'inflated_was' | 'illusory_discount';
  claimedDiscountPct?: number;
  realDiscountVsMedianPct?: number;
  median30?: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A struck-through "was" price is treated as fake when it sits well above the
 * recent selling median while the current price does not. This is the common
 * inflated-list pattern on Egyptian storefronts, not a comment on whether the
 * current price itself is good.
 */
export function detectFakeDiscount(input: {
  priceEGP: number;
  listPriceEGP?: number | null;
  history: PriceSample[];
  now?: Date;
}): FakeDiscountResult {
  const now = input.now ?? new Date();
  const median30 = median(pricesWithin(input.history, 30, now));
  const list = input.listPriceEGP;
  if (list == null || list <= input.priceEGP || median30 == null || median30 <= 0) {
    return { flagged: false, median30: median30 ?? undefined };
  }

  const claimed = ((list - input.priceEGP) / list) * 100;
  const real = ((median30 - input.priceEGP) / median30) * 100;
  const base = {
    claimedDiscountPct: round1(claimed),
    realDiscountVsMedianPct: round1(real),
    median30,
  };

  if (list > median30 * 1.15 && input.priceEGP >= median30 * 0.92) {
    return { flagged: true, reason: 'inflated_was', ...base };
  }
  if (claimed - Math.max(real, 0) >= 20 && real < 5) {
    return { flagged: true, reason: 'illusory_discount', ...base };
  }
  return { flagged: false, ...base };
}

export type DealLabel = 'great' | 'good' | 'fair' | 'weak';

export function labelForScore(score: number): DealLabel {
  if (score >= 80) return 'great';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  return 'weak';
}

export interface DealScore {
  score: number;
  label: DealLabel;
  factors: string[];
  fake: FakeDiscountResult;
  median30: number | null;
  min90: number | null;
}

export function scoreDeal(input: {
  priceEGP: number;
  listPriceEGP?: number | null;
  inStock: boolean;
  history: PriceSample[];
  competitorPrices?: number[];
  now?: Date;
}): DealScore {
  const now = input.now ?? new Date();
  const fake = detectFakeDiscount({ ...input, now });
  const last30 = pricesWithin(input.history, 30, now);
  const last90 = pricesWithin(input.history, 90, now);
  const median30 = median(last30);
  const min90 = last90.length > 0 ? Math.min(...last90) : null;
  let score = 45;
  const factors: string[] = [];

  if (median30 != null && median30 > 0) {
    const drop = (median30 - input.priceEGP) / median30;
    const boost = Math.round(Math.max(-20, Math.min(35, drop * 100)));
    score += boost;
    factors.push(`vs-median-30:${boost}`);
  }
  if (min90 != null && input.priceEGP <= min90 * 1.02) {
    score += 12;
    factors.push('near-min-90');
  }
  if (input.inStock) {
    score += 5;
    factors.push('in-stock');
  } else {
    score -= 15;
    factors.push('out-of-stock');
  }
  if (fake.flagged) {
    score -= 30;
    factors.push(`fake:${fake.reason ?? 'unknown'}`);
  }
  const others = (input.competitorPrices ?? []).filter((price) => Number.isFinite(price));
  if (others.length > 0 && input.priceEGP <= Math.min(...others)) {
    score += 8;
    factors.push('cheapest-store');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, label: labelForScore(score), factors, fake, median30, min90 };
}

export function claimedDiscountPct(price: number, list?: number | null): number | null {
  if (list == null || list <= price) return null;
  return round1(((list - price) / list) * 100);
}

/** Coefficient of variation. Used by the scheduler to crawl jumpy prices more often. */
export function volatility(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) / avg;
}
