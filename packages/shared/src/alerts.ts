export type AlertType = 'price_drop' | 'back_in_stock' | 'target_hit';

export interface AlertTransition {
  type: AlertType;
  dropPct?: number;
}

export function evaluateAlertTransition(input: {
  previousPrice: number | null;
  currentPrice: number;
  wasInStock: boolean | null;
  inStock: boolean;
  targetPrice: number | null;
  minDropPct: number;
  enabled: { priceDrop: boolean; backInStock: boolean; targetHit: boolean };
}): AlertTransition[] {
  const events: AlertTransition[] = [];
  if (
    input.enabled.priceDrop &&
    input.previousPrice != null &&
    input.previousPrice > 0 &&
    input.currentPrice < input.previousPrice
  ) {
    const dropPct = ((input.previousPrice - input.currentPrice) / input.previousPrice) * 100;
    if (dropPct >= input.minDropPct - 1e-9) {
      events.push({ type: 'price_drop', dropPct: Math.round(dropPct * 10) / 10 });
    }
  }
  if (input.enabled.backInStock && input.wasInStock === false && input.inStock) {
    events.push({ type: 'back_in_stock' });
  }
  if (
    input.enabled.targetHit &&
    input.targetPrice != null &&
    input.currentPrice <= input.targetPrice &&
    (input.previousPrice == null || input.previousPrice > input.targetPrice)
  ) {
    events.push({ type: 'target_hit' });
  }
  return events;
}
