import { eq, inArray } from 'drizzle-orm';
import {
  claimedDiscountPct,
  scoreDeal,
  scheduleFor,
  volatility,
  type PriceSample,
} from '@safqa/shared';
import type { Database } from './client';
import { crawlState, offers, pricePoints, watchlistItems } from './schema';

type Executor = Pick<Database, 'db'>;

export async function recomputeProduct(database: Executor, productId: string, now = new Date()): Promise<void> {
  const rows = await database.db.select().from(offers).where(eq(offers.productId, productId));
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  const points = await database.db
    .select()
    .from(pricePoints)
    .where(inArray(pricePoints.offerId, ids));

  const history = new Map<string, PriceSample[]>();
  for (const point of points) {
    const list = history.get(point.offerId) ?? [];
    list.push({ priceEGP: point.priceEgp, capturedAt: point.capturedAt });
    history.set(point.offerId, list);
  }

  const scored = rows.map((row) => {
    const competitors = rows
      .filter((other) => other.id !== row.id && other.condition === 'new' && other.inStock)
      .map((other) => other.priceEgp);
    const deal = scoreDeal({
      priceEGP: row.priceEgp,
      listPriceEGP: row.listPriceEgp,
      inStock: row.inStock,
      history: history.get(row.id) ?? [],
      competitorPrices: competitors,
      now,
    });
    return { row, deal };
  });

  for (const { row, deal } of scored) {
    await database.db
      .update(offers)
      .set({
        dealScore: deal.score,
        dealLabel: deal.label,
        fakeDiscount: deal.fake.flagged,
        fakeDiscountReason: deal.fake.reason ?? null,
        discountPct: claimedDiscountPct(row.priceEgp, row.listPriceEgp),
      })
      .where(eq(offers.id, row.id));
  }

  const watchers = await database.db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.productId, productId));
  const first = scored[0];
  if (!first) return;
  const best = scored.reduce((top, item) => (item.deal.score > top.deal.score ? item : top), first);
  const recent = (history.get(best?.row.id ?? '') ?? [])
    .filter((point) => point.capturedAt.getTime() >= now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .map((point) => point.priceEGP);
  const plan = scheduleFor({
    watcherCount: watchers.length,
    dealScore: best?.deal.score ?? 0,
    volatility: volatility(recent),
  });
  const next = new Date(now.getTime() + plan.intervalMinutes * 60 * 1000);
  await database.db
    .insert(crawlState)
    .values({
      productId,
      heat: plan.heat,
      watcherCount: watchers.length,
      nextCrawlAt: next,
      intervalMinutes: plan.intervalMinutes,
    })
    .onConflictDoUpdate({
      target: crawlState.productId,
      set: {
        heat: plan.heat,
        watcherCount: watchers.length,
        nextCrawlAt: next,
        intervalMinutes: plan.intervalMinutes,
      },
    });
}
