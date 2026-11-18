/**
 * One-shot live price refresh for the curated catalog in deploy/live/catalog.json.
 *
 * For every product page in the catalog it does one polite fetch with the
 * normal site adapter (robots.txt, per-host gap, honest SafqaBot user agent,
 * stop on any bot check). JSON-LD is the only price source. A page that is
 * blocked or has no structured offer keeps its last good price and is marked
 * stale (offers.last_fetch_had_offer = false). Each success appends a
 * price_points row, so history grows one point per run.
 *
 * Usage: pnpm --filter @safqa/db exec tsx src/refresh-live.ts [status.json]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterBySlug, BlockedBySite, RobotsDisallowed, SAFQA_USER_AGENT } from '@safqa/adapters';
import { createProvider, debateLimits, runDebate } from '@safqa/agents';
import { createDatabase } from './client';
import { DEMO_USER_ID } from './ids';
import {
  catalogTools,
  latestDebate,
  pageContextsForProduct,
  priceFingerprint,
  saveDebate,
  setOfferCrawlMeta,
} from './intelligence';
import { getProduct, recordObservation } from './queries';
import { recomputeProduct } from './recompute';
import { alerts, categories, offers, pricePoints, products, stores, watchlistItems } from './schema';
import { normalizeTitle } from '@safqa/shared';
import { config } from 'dotenv';
import { eq, inArray, like, sql } from 'drizzle-orm';
import Redis from 'ioredis';

const root = resolve(import.meta.dirname, '../../..');
config({ path: resolve(root, '.env') });
// The refresh never spends LLM tokens: prices come from JSON-LD and the
// debate uses the deterministic mock provider unless explicitly overridden.
process.env.LLM_PROVIDER = process.env.REFRESH_LLM_PROVIDER || 'mock';

interface CatalogOffer {
  store: string;
  url: string;
}
interface CatalogProduct {
  key: string;
  category: string;
  brand: string;
  model: string;
  titleAr: string;
  titleEn: string;
  offers: CatalogOffer[];
}
interface Catalog {
  categories: { slug: string; nameAr: string; nameEn: string }[];
  products: CatalogProduct[];
}

const catalogPath = process.env.SAFQA_LIVE_CATALOG || resolve(root, 'deploy/live/catalog.json');
const statusPath = process.argv[2] || resolve(root, '../safqa-refresh-status.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;

/** Stable UUID (v5 layout) from a string, so reruns update the same rows. */
function stableId(name: string): string {
  const h = createHash('sha1').update(`safqa-live:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((Number.parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

function reasonOf(error: unknown): string {
  if (error instanceof BlockedBySite) return 'blocked (bot check / 403 / 429)';
  if (error instanceof RobotsDisallowed) return 'robots.txt disallows';
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted/i.test(message)) return 'timeout (site did not answer the SafqaBot user agent)';
  if (/fetch failed|ECONNRESET|socket|HTTP\/2|terminated/i.test(message)) return 'connection refused by site';
  return message.slice(0, 160);
}

const database = createDatabase();
const startedAt = new Date();
const runAt = new Date();

// 1. Stores and categories.
const storeRows = await database.db.select().from(stores);
const storeId = new Map(storeRows.map((row) => [row.slug, row.id]));
for (const category of catalog.categories) {
  await database.db
    .insert(categories)
    .values({ id: stableId(`category:${category.slug}`), ...category })
    .onConflictDoUpdate({
      target: categories.slug,
      set: { nameAr: category.nameAr, nameEn: category.nameEn },
    });
}
const categoryId = new Map(
  (await database.db.select().from(categories)).map((row) => [row.slug, row.id]),
);

// 2. Remove the fake demo catalog (seed offers live under /safqa-seed/ URLs).
const seeded = await database.db
  .select({ id: offers.id, productId: offers.productId })
  .from(offers)
  .where(like(offers.url, '%/safqa-seed/%'));
if (seeded.length > 0) {
  const seededProducts = [...new Set(seeded.map((row) => row.productId))];
  await database.db.delete(pricePoints).where(inArray(pricePoints.offerId, seeded.map((row) => row.id)));
  await database.db.delete(alerts).where(inArray(alerts.productId, seededProducts));
  await database.db.delete(products).where(inArray(products.id, seededProducts));
  console.log(`removed ${seededProducts.length} demo products (${seeded.length} fake offers)`);
}

// 3. Crawl.
interface Failure {
  product: string;
  store: string;
  url: string;
  reason: string;
  stale: boolean;
}
const failures: Failure[] = [];
const offerStatus: Record<string, { ok: boolean; lastOkAt: string | null; reason?: string }> = {};
const perStore: Record<string, { ok: number; failed: number }> = {};
let ok = 0;
const changed = new Set<string>();
const live = new Set<string>();

// Stores are crawled in parallel (one queue per store); inside a store the
// adapter's per-host gap keeps requests polite. This keeps a 200+ product
// catalog well under the 15 minute budget.
async function crawlOffer(item: CatalogProduct, entry: CatalogOffer): Promise<void> {
  const productId = stableId(`product:${item.key}`);
    const stat = (perStore[entry.store] ??= { ok: 0, failed: 0 });
    const adapter = adapterBySlug(entry.store);
    const store = storeId.get(entry.store);
    const offerId = stableId(`offer:${entry.url}`);
    const [existing] = await database.db.select().from(offers).where(eq(offers.id, offerId));
    if (!adapter || !store) {
      failures.push({ product: item.key, store: entry.store, url: entry.url, reason: 'no adapter for store', stale: Boolean(existing) });
      stat.failed += 1;
      return;
    }
    let reason = '';
    try {
      const fetched = await adapter.fetchAndParse(entry.url, {
        userAgent: SAFQA_USER_AGENT,
        includeLlmMarkdown: false,
      });
      const parsed = fetched.offer;
      if (!parsed || !(parsed.priceEGP > 0)) {
        reason = 'page loaded but has no JSON-LD price (store hides it from bots)';
      } else {
        // Product row appears the first time any store gives a real price.
        await database.db
          .insert(products)
          .values({
            id: productId,
            titleAr: item.titleAr,
            titleEn: item.titleEn,
            brand: item.brand,
            model: item.model,
            categoryId: categoryId.get(item.category) ?? null,
            imageUrl: parsed.image ?? null,
            normalizedTitle: normalizeTitle(`${item.titleEn} ${item.titleAr} ${item.brand} ${item.model}`),
          })
          .onConflictDoUpdate({
            target: products.id,
            set: {
              titleAr: item.titleAr,
              titleEn: item.titleEn,
              brand: item.brand,
              model: item.model,
              categoryId: categoryId.get(item.category) ?? null,
              imageUrl: sql`coalesce(${products.imageUrl}, ${parsed.image ?? null})`,
            },
          });
        await database.db
          .insert(offers)
          .values({
            id: offerId,
            productId,
            storeId: store,
            url: entry.url,
            title: parsed.title || item.titleEn,
            priceEgp: parsed.priceEGP,
            listPriceEgp: parsed.listPriceEGP ?? null,
            inStock: parsed.inStock,
            condition: parsed.condition ?? 'new',
            imageUrl: parsed.image ?? null,
            rating: parsed.rating ?? null,
            lastSeenAt: runAt,
          })
          .onConflictDoUpdate({
            target: offers.id,
            set: { title: parsed.title || item.titleEn, imageUrl: parsed.image ?? null, rating: parsed.rating ?? null },
          });
        await recordObservation(database, {
          offerId,
          priceEGP: parsed.priceEGP,
          listPriceEGP: parsed.listPriceEGP ?? null,
          inStock: parsed.inStock,
          capturedAt: runAt,
        });
        await setOfferCrawlMeta(database, offerId, { contentHash: fetched.contentHash, lastFetchHadOffer: true });
        if (!existing || existing.priceEgp !== parsed.priceEGP || existing.inStock !== parsed.inStock) changed.add(productId);
        live.add(productId);
        offerStatus[offerId] = { ok: true, lastOkAt: runAt.toISOString() };
        stat.ok += 1;
        ok += 1;
        console.log(`ok   ${entry.store.padEnd(9)} ${String(parsed.priceEGP).padStart(7)} EGP ${parsed.inStock ? 'in stock ' : 'out      '} ${item.key}`);
        return;
      }
    } catch (error) {
      reason = reasonOf(error);
    }
    if (existing) {
      await setOfferCrawlMeta(database, offerId, { lastFetchHadOffer: false });
      live.add(productId);
    }
    offerStatus[offerId] = { ok: false, lastOkAt: existing ? existing.lastSeenAt.toISOString() : null, reason };
    failures.push({ product: item.key, store: entry.store, url: entry.url, reason, stale: Boolean(existing) });
    stat.failed += 1;
    console.log(`FAIL ${entry.store.padEnd(9)} ${item.key}: ${reason}${existing ? ` (kept last price ${existing.priceEgp} EGP, stale)` : ''}`);
  }

const queues = new Map<string, { item: CatalogProduct; entry: CatalogOffer }[]>();
for (const item of catalog.products) {
  for (const entry of item.offers) {
    const list = queues.get(entry.store) ?? [];
    list.push({ item, entry });
    queues.set(entry.store, list);
  }
}
await Promise.all(
  [...queues.values()].map(async (list) => {
    for (const { item, entry } of list) await crawlOffer(item, entry);
  }),
);

// 4. Products that are no longer in the catalog stay in the DB but are recomputed.
for (const productId of live) await recomputeProduct(database, productId, runAt);

// 5. Demo account watches two real products.
const watches = [
  { key: 'iphone-17-pro-max-256-deep-blue', target: 95_000 },
  { key: 'airpods-4-anc', target: 9_500 },
];
for (const watch of watches) {
  const productId = stableId(`product:${watch.key}`);
  if (!live.has(productId)) continue;
  await database.db
    .insert(watchlistItems)
    .values({ id: stableId(`watch:${watch.key}`), userId: DEMO_USER_ID, productId, targetPriceEgp: watch.target })
    .onConflictDoNothing();
}

// 6. Deal debate (mock provider, no LLM cost) when a product's prices changed.
const tools = await catalogTools(database, runAt);
const provider = createProvider();
for (const productId of live) {
  const detail = await getProduct(database, productId);
  if (!detail?.offers.length) continue;
  const fingerprint = priceFingerprint(detail.offers);
  const last = await latestDebate(database, productId);
  if (last?.priceFingerprint === fingerprint) continue;
  const debate = await runDebate({
    provider,
    productId,
    tools,
    pageContext: await pageContextsForProduct(database, productId),
    ...debateLimits(),
  });
  await saveDebate(database, productId, fingerprint, debate);
}

// 7. Drop cached API lists so the snapshot reads fresh rows.
if (process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys('safqa:*:v*');
    if (keys.length) await redis.del(...keys);
  } catch {
    // The API cache TTL is 30 s; a missed flush only delays freshness.
  } finally {
    redis.disconnect();
  }
}

const finishedAt = new Date();
const status = {
  updatedAt: runAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  timeZone: 'Africa/Cairo',
  source: 'schema.org JSON-LD on each store product page',
  userAgent: SAFQA_USER_AGENT,
  productsInCatalog: catalog.products.length,
  productsWithPrice: live.size,
  productsChanged: changed.size,
  offersTried: catalog.products.reduce((n, p) => n + p.offers.length, 0),
  offersUpdated: ok,
  offersFailed: failures.length,
  perStore,
  failures,
  offers: offerStatus,
};
writeFileSync(statusPath, JSON.stringify(status, null, 2));
console.log(
  `summary: ${live.size}/${catalog.products.length} products priced, ${ok} offers updated, ${failures.length} failed, ${changed.size} products changed; status -> ${statusPath}`,
);
await database.sql.end();
