import { adapters } from '@safqa/adapters';
import { createProvider, debateLimits, runDebate } from '@safqa/agents';
import { normalizeTitle } from '@safqa/shared';
import bcrypt from 'bcryptjs';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  categorySeeds,
  historyFor,
  offerSeeds,
  offerUrl,
  productSeeds,
} from './catalog';
import type { Database } from './client';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID, sid } from './ids';
import {
  catalogTools,
  pageContextsForProduct,
  priceFingerprint,
  saveDebate,
  seedCommercial,
} from './intelligence';
import { getProduct } from './queries';
import { recomputeProduct } from './recompute';
import {
  alertSettings,
  alerts,
  categories,
  offers,
  pricePoints,
  products,
  stores,
  users,
  watchlistItems,
} from './schema';

export async function seed(
  database: Database,
  now = new Date(),
): Promise<void> {
  await database.db
    .insert(stores)
    .values(
      adapters.map((adapter, index) => ({
        id: sid(index + 1),
        slug: adapter.slug,
        nameAr: adapter.displayName.ar,
        nameEn: adapter.displayName.en,
        domain: adapter.domains[0] ?? adapter.slug,
        adapterStatus: adapter.status,
        notes: adapter.notes,
      })),
    )
    .onConflictDoUpdate({
      target: stores.slug,
      set: {
        nameAr: sql`excluded.name_ar`,
        nameEn: sql`excluded.name_en`,
        domain: sql`excluded.domain`,
        adapterStatus: sql`excluded.adapter_status`,
        notes: sql`excluded.notes`,
      },
    });

  await database.db
    .insert(categories)
    .values(
      categorySeeds.map((category) => ({
        id: sid(category.id),
        slug: category.slug,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
      })),
    )
    .onConflictDoUpdate({
      target: categories.slug,
      set: {
        nameAr: sql`excluded.name_ar`,
        nameEn: sql`excluded.name_en`,
      },
    });

  const categoryId = new Map(
    categorySeeds.map((category) => [category.slug, sid(category.id)]),
  );
  await database.db
    .insert(products)
    .values(
      productSeeds.map((product) => ({
        id: sid(product.id),
        titleAr: product.titleAr,
        titleEn: product.titleEn,
        brand: product.brand,
        model: product.model,
        ean: product.ean ?? null,
        categoryId: categoryId.get(product.category) ?? null,
        normalizedTitle: normalizeTitle(
          `${product.titleEn} ${product.titleAr} ${product.brand} ${product.model}`,
        ),
      })),
    )
    .onConflictDoUpdate({
      target: products.id,
      set: {
        titleAr: sql`excluded.title_ar`,
        titleEn: sql`excluded.title_en`,
        brand: sql`excluded.brand`,
        model: sql`excluded.model`,
        ean: sql`excluded.ean`,
        categoryId: sql`excluded.category_id`,
        normalizedTitle: sql`excluded.normalized_title`,
      },
    });

  const storeId = new Map(
    adapters.map((adapter, index) => [adapter.slug, sid(index + 1)]),
  );
  const productBySeed = new Map(
    productSeeds.map((product) => [product.id, product]),
  );
  await database.db
    .insert(offers)
    .values(
      offerSeeds.map((offer) => {
        const product = productBySeed.get(offer.productId);
        return {
          id: sid(offer.id),
          productId: sid(offer.productId),
          storeId: storeId.get(offer.store) ?? sid(1),
          url: offerUrl(offer.store, offer.productId),
          title: offer.title ?? product?.titleEn ?? 'Offer',
          priceEgp: offer.price,
          listPriceEgp: offer.list ?? null,
          inStock: offer.inStock,
          condition: offer.condition ?? 'new',
          rating: offer.rating ?? null,
          lastSeenAt: now,
        };
      }),
    )
    .onConflictDoUpdate({
      target: offers.id,
      set: {
        priceEgp: sql`excluded.price_egp`,
        listPriceEgp: sql`excluded.list_price_egp`,
        inStock: sql`excluded.in_stock`,
        condition: sql`excluded.condition`,
        rating: sql`excluded.rating`,
        title: sql`excluded.title`,
        url: sql`excluded.url`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
    });

  const offerIds = offerSeeds.map((offer) => sid(offer.id));
  await database.db
    .delete(pricePoints)
    .where(inArray(pricePoints.offerId, offerIds));
  const points = offerSeeds.flatMap((offer) =>
    historyFor(offer, now).map((point) => ({
      offerId: sid(offer.id),
      capturedAt: point.capturedAt,
      priceEgp: point.price,
      listPriceEgp: offer.list ?? null,
      inStock:
        offer.inStock ||
        point.capturedAt.getTime() < now.getTime() - 6 * 24 * 60 * 60 * 1000,
    })),
  );
  for (let offset = 0; offset < points.length; offset += 400) {
    await database.db
      .insert(pricePoints)
      .values(points.slice(offset, offset + 400));
  }

  for (const product of productSeeds) {
    await recomputeProduct(database, sid(product.id), now);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await database.db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      name: 'نور',
      passwordHash,
      locale: 'ar',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: 'نور', passwordHash, locale: 'ar' },
    });

  await database.db
    .insert(alertSettings)
    .values({ userId: DEMO_USER_ID, telegram: false, minDropPct: 5 })
    .onConflictDoNothing();

  const watches = [
    { id: sid(0x9101), productId: sid(201), targetPriceEgp: 52000 },
    { id: sid(0x9102), productId: sid(203), targetPriceEgp: 17000 },
  ];
  for (const watch of watches) {
    await database.db
      .insert(watchlistItems)
      .values({ ...watch, userId: DEMO_USER_ID })
      .onConflictDoUpdate({
        target: [watchlistItems.userId, watchlistItems.productId],
        set: { targetPriceEgp: watch.targetPriceEgp },
      });
  }

  await database.db
    .insert(alerts)
    .values({
      id: sid(0x9201),
      userId: DEMO_USER_ID,
      productId: sid(209),
      type: 'price_drop',
      title: 'انخفاض السعر · Price drop',
      body: 'سوني سماعات WH-1000XM5 أسود · Sony WH-1000XM5 headphones black نزل على نون.',
      read: false,
    })
    .onConflictDoNothing();

  await database.db
    .update(users)
    .set({ name: 'نور' })
    .where(eq(users.id, DEMO_USER_ID));

  await seedCommercial(database);
  const tools = await catalogTools(database, now);
  const provider = createProvider();
  for (const product of productSeeds) {
    const productId = sid(product.id);
    const detail = await getProduct(database, productId);
    if (!detail?.offers.length) continue;
    const debate = await runDebate({
      provider,
      productId,
      tools,
      pageContext: await pageContextsForProduct(database, productId),
      ...debateLimits(),
    });
    await saveDebate(
      database,
      productId,
      priceFingerprint(detail.offers),
      debate,
    );
  }
}
