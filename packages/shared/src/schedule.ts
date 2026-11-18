export type Heat = 'hot' | 'warm' | 'cold';

export const HEAT_INTERVAL_MINUTES: Record<Heat, number> = {
  hot: 60,
  warm: 360,
  cold: 60 * 48,
};

/**
 * Watched and volatile products are crawled hourly. Everything else waits.
 * Intervals are floors for the polite fetcher; robots.txt crawl-delay can
 * only make a single request slower, never more aggressive.
 */
export function scheduleFor(input: {
  watcherCount: number;
  dealScore: number;
  volatility: number;
}): { heat: Heat; intervalMinutes: number } {
  if (input.watcherCount >= 3 || input.dealScore >= 80) {
    return { heat: 'hot', intervalMinutes: HEAT_INTERVAL_MINUTES.hot };
  }
  if (input.watcherCount >= 1 || input.volatility >= 0.08 || input.dealScore >= 65) {
    return { heat: 'warm', intervalMinutes: HEAT_INTERVAL_MINUTES.warm };
  }
  return { heat: 'cold', intervalMinutes: HEAT_INTERVAL_MINUTES.cold };
}
