import type { PriceSample } from './deals';
import { median, pricesWithin } from './deals';

export type BuyRecommendation = 'buy_now' | 'wait';

export interface TimingForecast {
  recommendation: BuyRecommendation;
  confidence: number;
  slopePerDay: number;
  percentile: number;
  expectedLowEgp: number;
  reasonAr: string;
  reasonEn: string;
}

/**
 * A small statistical read of the series, not a neural net.
 * Slope is ordinary least squares on the last 30 days. The percentile is
 * where today's price sits in the 90-day range (0 = the low).
 * An imminent retail event only argues for waiting when the price is not
 * already sitting on that low.
 */
export function predictBuyTiming(input: {
  history: PriceSample[];
  current: number;
  now?: Date;
  daysUntilEvent?: number | null;
}): TimingForecast {
  const now = input.now ?? new Date();
  const recent = input.history
    .filter(
      (point) => point.capturedAt.getTime() >= now.getTime() - 30 * 86400000,
    )
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const window = pricesWithin(input.history, 90, now);
  const med = median(window);
  const low = window.length > 0 ? Math.min(...window) : input.current;
  const high = window.length > 0 ? Math.max(...window) : input.current;
  const span = Math.max(1, high - low);
  const percentile = Math.round(((input.current - low) / span) * 100);
  const slope = slopePerDay(recent);
  const nearLow = input.current <= low * 1.02;
  const eventSoon =
    input.daysUntilEvent != null &&
    input.daysUntilEvent >= 0 &&
    input.daysUntilEvent <= 14;
  const stillFalling = slope < -input.current * 0.003;

  let recommendation: BuyRecommendation = 'buy_now';
  let reasonAr = 'السعر قريب من قاع ٩٠ يوم ومش بينزل بسرعة. الشراء دلوقتي منطقي.';
  let reasonEn =
    'The price is near the 90-day low and is not falling fast. Buying now is reasonable.';
  if (eventSoon && !nearLow) {
    recommendation = 'wait';
    reasonAr = `في موسم تخفيضات خلال ${input.daysUntilEvent} يوم والسعر لسه فوق القاع. الاستنى أرجح.`;
    reasonEn = `A sale window is ${input.daysUntilEvent} days away and the price is still above the low. Waiting is the better read.`;
  } else if (stillFalling && !nearLow) {
    recommendation = 'wait';
    reasonAr =
      'السلسلة لسه نازلة. لو مش مستعجل، الاستنى أيام ممكن يلاقي سعر أقل.';
    reasonEn =
      'The series is still falling. Waiting a few days can meet a lower price if you are not in a hurry.';
  } else if (med != null && input.current > med * 1.05 && !nearLow) {
    recommendation = 'wait';
    reasonAr = 'السعر أعلى من وسيط ٩٠ يوم. مفيش سبب للاستعجال.';
    reasonEn =
      'The price is above the 90-day median. There is no reason to rush.';
  }

  const confidence = Math.max(
    0.35,
    Math.min(0.9, nearLow ? 0.8 : 0.55 + Math.abs(percentile - 50) / 200),
  );
  return {
    recommendation,
    confidence: Math.round(confidence * 100) / 100,
    slopePerDay: Math.round(slope * 100) / 100,
    percentile,
    expectedLowEgp: Math.round(low),
    reasonAr,
    reasonEn,
  };
}

function slopePerDay(points: PriceSample[]): number {
  if (points.length < 2) return 0;
  const t0 = points[0]?.capturedAt.getTime() ?? 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of points) {
    const x = (point.capturedAt.getTime() - t0) / 86400000;
    const y = point.priceEGP;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const n = points.length;
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
