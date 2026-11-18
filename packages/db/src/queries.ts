import { randomUUID } from 'node:crypto';
import {
  type AlertItem,
  type AlertSettings,
  type Category,
  type DealLabel,
  evaluateAlertTransition,
  median,
  type PriceSample,
  type ProductCard,
  type ProductDetail,
  pricesWithin,
  type Store,
  type User,
  type WatchItem,
} from '@safqa/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client';
import { recomputeProduct } from './recompute';
import {
  alertSettings,
  alerts,
  categories,
  crawlState,
  offers,
  pricePoints,
  products,
  pushSubscriptions,
  sessions,
  stores,
  users,
  watchlistItems,
} from './schema';

type DealLabelValue = DealLabel;
type Condition = 'new' | 'used';
type AdapterStatus = Store['adapterStatus'];

function asLabel(value: string): DealLabelValue {
  if (
    value === 'great' ||
    value === 'good' ||
    value === 'fair' ||
    value === 'weak'
  )
    return value;
  return 'fair';
}

function asCondition(value: string): Condition {
  return value === 'used' ? 'used' : 'new';
}

function asStatus(value: string): AdapterStatus {
  if (value === 'structured' || value === 'best-effort' || value === 'stub')
    return value;
  return 'stub';
}

function asLocale(value: string): User['locale'] {
  return value === 'en' ? 'en' : 'ar';
}

interface Joined {
  offer: typeof offers.$inferSelect;
  product: typeof products.$inferSelect;
  store: typeof stores.$inferSelect;
  category: typeof categories.$inferSelect | null;
}

async function loadJoined(database: Database): Promise<Joined[]> {
  return database.db
    .select({
      offer: offers,
      product: products,
      store: stores,
      category: categories,
    })
    .from(offers)
    .innerJoin(products, eq(offers.productId, products.id))
    .innerJoin(stores, eq(offers.storeId, stores.id))
    .leftJoin(categories, eq(products.categoryId, categories.id));
}

function mapStore(store: typeof stores.$inferSelect): Store {
  return {
    slug: store.slug,
    nameAr: store.nameAr,
    nameEn: store.nameEn,
    domain: store.domain,
    adapterStatus: asStatus(store.adapterStatus),
    notes: store.notes,
  };
}

function mapCategory(
  category: typeof categories.$inferSelect | null,
): Category | null {
  if (!category) return null;
  return {
    slug: category.slug,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
  };
}

function mapOffer(row: Joined): ProductCard['bestOffer'] {
  return {
    id: row.offer.id,
    url: row.offer.url,
    title: row.offer.title,
    priceEgp: row.offer.priceEgp,
    listPriceEgp: row.offer.listPriceEgp,
    inStock: row.offer.inStock,
    condition: asCondition(row.offer.condition),
    rating: row.offer.rating,
    dealScore: row.offer.dealScore,
    dealLabel: asLabel(row.offer.dealLabel),
    fakeDiscount: row.offer.fakeDiscount,
    fakeDiscountReason: row.offer.fakeDiscountReason,
    discountPct: row.offer.discountPct,
    lastSeenAt: row.offer.lastSeenAt.toISOString(),
    store: mapStore(row.store),
  };
}

function rankOffer(row: Joined): number {
  const conditionPenalty = row.offer.condition === 'new' ? 0 : 50;
  const stockPenalty = row.offer.inStock ? 0 : 20;
  return (
    conditionPenalty +
    stockPenalty -
    row.offer.dealScore / 100 +
    row.offer.priceEgp / 1_000_000
  );
}

export function toProductCard(
  rows: Joined[],
  preferred?: Joined,
): ProductCard | null {
  const first = rows[0];
  if (!first) return null;
  const chosen =
    preferred ?? [...rows].sort((a, b) => rankOffer(a) - rankOffer(b))[0];
  if (!chosen) return null;
  const freshNew = rows.filter(
    (row) => row.offer.condition === 'new' && row.offer.inStock,
  );
  const prices = (freshNew.length > 0 ? freshNew : rows).map(
    (row) => row.offer.priceEgp,
  );
  const offer = mapOffer(chosen);
  return {
    id: first.product.id,
    titleAr: first.product.titleAr,
    titleEn: first.product.titleEn,
    brand: first.product.brand,
    model: first.product.model,
    ean: first.product.ean,
    category: mapCategory(first.category),
    offerCount: rows.length,
    lowestPriceEgp: prices.length > 0 ? Math.min(...prices) : null,
    bestOffer: offer,
  };
}

function groupByProduct(rows: Joined[]): Map<string, Joined[]> {
  const groups = new Map<string, Joined[]>();
  for (const row of rows) {
    const list = groups.get(row.product.id) ?? [];
    list.push(row);
    groups.set(row.product.id, list);
  }
  return groups;
}

export async function listStores(database: Database): Promise<Store[]> {
  const rows = await database.db.select().from(stores).orderBy(stores.nameEn);
  return rows.map(mapStore);
}

export async function listCategories(database: Database): Promise<Category[]> {
  const rows = await database.db
    .select()
    .from(categories)
    .orderBy(categories.nameEn);
  return rows.map((row) => ({
    slug: row.slug,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
  }));
}

export async function listDeals(
  database: Database,
): Promise<{ items: ProductCard[]; suspicious: ProductCard[] }> {
  const groups = groupByProduct(await loadJoined(database));
  const items: ProductCard[] = [];
  const suspicious: ProductCard[] = [];
  for (const rows of groups.values()) {
    const card = toProductCard(rows);
    if (!card?.bestOffer) continue;
    if (card.bestOffer.fakeDiscount) suspicious.push(card);
    else if (card.bestOffer.inStock && card.bestOffer.condition === 'new')
      items.push(card);
    const inflated = rows.find((row) => row.offer.fakeDiscount);
    if (inflated && card.bestOffer.id !== inflated.offer.id) {
      const flagged = toProductCard(rows, inflated);
      if (flagged) suspicious.push(flagged);
    }
  }
  items.sort(
    (a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0),
  );
  suspicious.sort(
    (a, b) => (b.bestOffer?.discountPct ?? 0) - (a.bestOffer?.discountPct ?? 0),
  );
  return { items: items.slice(0, 12), suspicious: suspicious.slice(0, 6) };
}

export interface SearchInput {
  q?: string;
  store?: string;
  category?: string;
  minDiscount?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  hideFake?: boolean;
  sort?: 'score' | 'price_asc' | 'discount';
}

export async function searchProducts(
  database: Database,
  input: SearchInput,
): Promise<ProductCard[]> {
  const needle = input.q?.trim().toLowerCase();
  const groups = groupByProduct(await loadJoined(database));
  const cards: ProductCard[] = [];
  for (const rows of groups.values()) {
    const product = rows[0]?.product;
    const category = rows[0]?.category;
    if (!product) continue;
    if (input.category && category?.slug !== input.category) continue;
    if (needle) {
      const hay =
        `${product.titleAr} ${product.titleEn} ${product.brand ?? ''} ${product.model ?? ''} ${product.normalizedTitle}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    const matching = rows.filter((row) => {
      if (input.store && row.store.slug !== input.store) return false;
      if (input.inStock && !row.offer.inStock) return false;
      if (input.hideFake && row.offer.fakeDiscount) return false;
      if (input.minPrice != null && row.offer.priceEgp < input.minPrice)
        return false;
      if (input.maxPrice != null && row.offer.priceEgp > input.maxPrice)
        return false;
      if (
        input.minDiscount != null &&
        (row.offer.discountPct ?? 0) < input.minDiscount
      )
        return false;
      return true;
    });
    if (matching.length === 0) continue;
    const card = toProductCard(matching);
    if (card) cards.push(card);
  }
  const sort = input.sort ?? 'score';
  cards.sort((a, b) => {
    if (sort === 'price_asc')
      return (a.bestOffer?.priceEgp ?? 0) - (b.bestOffer?.priceEgp ?? 0);
    if (sort === 'discount')
      return (b.bestOffer?.discountPct ?? 0) - (a.bestOffer?.discountPct ?? 0);
    return (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0);
  });
  return cards;
}

async function productStats(
  database: Database,
  productId: string,
  now = new Date(),
) {
  const rows = await database.db
    .select({
      price: pricePoints.priceEgp,
      capturedAt: pricePoints.capturedAt,
      condition: offers.condition,
    })
    .from(pricePoints)
    .innerJoin(offers, eq(offers.id, pricePoints.offerId))
    .where(eq(offers.productId, productId));
  const samples: PriceSample[] = rows
    .filter((row) => row.condition === 'new')
    .map((row) => ({ priceEGP: row.price, capturedAt: row.capturedAt }));
  const last90 = pricesWithin(samples, 90, now);
  return {
    median30: median(pricesWithin(samples, 30, now)),
    min90: last90.length > 0 ? Math.min(...last90) : null,
  };
}

export async function getProduct(
  database: Database,
  id: string,
): Promise<ProductDetail | null> {
  const rows = (await loadJoined(database)).filter(
    (row) => row.product.id === id,
  );
  const card = toProductCard(rows);
  if (!card) return null;
  const stats = await productStats(database, id);
  const offersOut = rows
    .map((row) => mapOffer(row))
    .filter((offer): offer is NonNullable<typeof offer> => offer != null)
    .sort((a, b) => a.priceEgp - b.priceEgp);
  return { ...card, offers: offersOut, ...stats };
}

export async function getHistory(database: Database, productId: string) {
  const rows = await database.db
    .select({
      price: pricePoints.priceEgp,
      capturedAt: pricePoints.capturedAt,
      storeSlug: stores.slug,
      storeNameAr: stores.nameAr,
      storeNameEn: stores.nameEn,
      condition: offers.condition,
    })
    .from(pricePoints)
    .innerJoin(offers, eq(offers.id, pricePoints.offerId))
    .innerJoin(stores, eq(stores.id, offers.storeId))
    .where(eq(offers.productId, productId))
    .orderBy(pricePoints.capturedAt);
  const series = new Map<
    string,
    {
      storeSlug: string;
      storeNameAr: string;
      storeNameEn: string;
      points: { t: string; priceEgp: number }[];
    }
  >();
  const samples: PriceSample[] = [];
  for (const row of rows) {
    if (row.condition !== 'new') continue;
    const current = series.get(row.storeSlug) ?? {
      storeSlug: row.storeSlug,
      storeNameAr: row.storeNameAr,
      storeNameEn: row.storeNameEn,
      points: [],
    };
    current.points.push({
      t: row.capturedAt.toISOString(),
      priceEgp: row.price,
    });
    series.set(row.storeSlug, current);
    samples.push({ priceEGP: row.price, capturedAt: row.capturedAt });
  }
  const now = new Date();
  const last90 = pricesWithin(samples, 90, now);
  return {
    productId,
    median30: median(pricesWithin(samples, 30, now)),
    min90: last90.length > 0 ? Math.min(...last90) : null,
    series: [...series.values()],
  };
}

export async function findUserByEmail(database: Database, email: string) {
  const [user] = await database.db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

export async function findUserById(
  database: Database,
  id: string,
): Promise<User | null> {
  const [user] = await database.db.select().from(users).where(eq(users.id, id));
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: asLocale(user.locale),
  };
}

export async function insertUser(
  database: Database,
  input: {
    id?: string;
    email: string;
    name: string;
    passwordHash: string | null;
    locale?: 'ar' | 'en';
  },
) {
  const id = input.id ?? randomUUID();
  await database.db.insert(users).values({
    id,
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    locale: input.locale ?? 'ar',
  });
  await database.db.insert(alertSettings).values({ userId: id });
  return findUserById(database, id);
}

export async function createSession(
  database: Database,
  userId: string,
  refreshTokenHash: string,
  expiresAt: Date,
) {
  const id = randomUUID();
  await database.db
    .insert(sessions)
    .values({ id, userId, refreshTokenHash, expiresAt });
  return id;
}

export async function findSession(
  database: Database,
  refreshTokenHash: string,
) {
  const [session] = await database.db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshTokenHash, refreshTokenHash));
  return session ?? null;
}

export async function replaceSession(
  database: Database,
  sessionId: string,
  refreshTokenHash: string,
  expiresAt: Date,
) {
  await database.db
    .update(sessions)
    .set({ refreshTokenHash, expiresAt })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSession(
  database: Database,
  refreshTokenHash: string,
) {
  await database.db
    .delete(sessions)
    .where(eq(sessions.refreshTokenHash, refreshTokenHash));
}

export async function findOrCreateOAuthUser(
  database: Database,
  input: {
    provider: string;
    providerAccountId: string;
    email: string;
    name: string;
  },
): Promise<User | null> {
  const existing = await database.sql<{ user_id: string }[]>`
    SELECT user_id FROM oauth_accounts
    WHERE provider = ${input.provider} AND provider_account_id = ${input.providerAccountId}
    LIMIT 1
  `;
  const linked = existing[0];
  if (linked) return findUserById(database, linked.user_id);
  let user = await findUserByEmail(database, input.email);
  if (!user) {
    const created = await insertUser(database, {
      email: input.email,
      name: input.name,
      passwordHash: null,
    });
    user = created
      ? await database.db
          .select()
          .from(users)
          .where(eq(users.id, created.id))
          .then((rows) => rows[0] ?? null)
      : null;
  }
  if (!user) return null;
  await database.sql`
    INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id)
    VALUES (${randomUUID()}, ${user.id}, ${input.provider}, ${input.providerAccountId})
    ON CONFLICT (provider, provider_account_id) DO NOTHING
  `;
  return findUserById(database, user.id);
}

async function cardsFor(
  database: Database,
  productIds: string[],
): Promise<Map<string, ProductCard>> {
  if (productIds.length === 0) return new Map();
  const groups = groupByProduct(
    (await loadJoined(database)).filter((row) =>
      productIds.includes(row.product.id),
    ),
  );
  const map = new Map<string, ProductCard>();
  for (const [id, rows] of groups) {
    const card = toProductCard(rows);
    if (card) map.set(id, card);
  }
  return map;
}

export async function listWatchlist(
  database: Database,
  userId: string,
): Promise<WatchItem[]> {
  const rows = await database.db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, userId))
    .orderBy(desc(watchlistItems.createdAt));
  const cards = await cardsFor(
    database,
    rows.map((row) => row.productId),
  );
  return rows.flatMap((row) => {
    const product = cards.get(row.productId);
    if (!product) return [];
    return [
      {
        id: row.id,
        targetPriceEgp: row.targetPriceEgp,
        createdAt: row.createdAt.toISOString(),
        product,
      },
    ];
  });
}

export async function addWatch(
  database: Database,
  userId: string,
  productId: string,
  targetPriceEgp?: number | null,
): Promise<WatchItem | null> {
  const [product] = await database.db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId));
  if (!product) return null;
  const id = randomUUID();
  await database.db
    .insert(watchlistItems)
    .values({ id, userId, productId, targetPriceEgp: targetPriceEgp ?? null })
    .onConflictDoUpdate({
      target: [watchlistItems.userId, watchlistItems.productId],
      set: { targetPriceEgp: targetPriceEgp ?? null },
    });
  await recomputeProduct(database, productId);
  const items = await listWatchlist(database, userId);
  return items.find((item) => item.product.id === productId) ?? null;
}

export async function updateWatch(
  database: Database,
  userId: string,
  id: string,
  targetPriceEgp: number | null,
) {
  const [row] = await database.db
    .update(watchlistItems)
    .set({ targetPriceEgp })
    .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)))
    .returning();
  return row ?? null;
}

export async function removeWatch(
  database: Database,
  userId: string,
  id: string,
) {
  const [row] = await database.db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)))
    .returning();
  if (row) await recomputeProduct(database, row.productId);
  return row ?? null;
}

function mapAlert(row: typeof alerts.$inferSelect): AlertItem {
  const type =
    row.type === 'back_in_stock' || row.type === 'target_hit'
      ? row.type
      : 'price_drop';
  return {
    id: row.id,
    type,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    productId: row.productId,
  };
}

export async function listAlerts(
  database: Database,
  userId: string,
): Promise<AlertItem[]> {
  const rows = await database.db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, userId))
    .orderBy(desc(alerts.createdAt))
    .limit(50);
  return rows.map(mapAlert);
}

export async function markAlertRead(
  database: Database,
  userId: string,
  id: string,
) {
  await database.db
    .update(alerts)
    .set({ read: true })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function getAlertSettings(
  database: Database,
  userId: string,
): Promise<AlertSettings> {
  const [settings] = await database.db
    .select()
    .from(alertSettings)
    .where(eq(alertSettings.userId, userId));
  const [push] = await database.db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return {
    priceDrop: settings?.priceDrop ?? true,
    backInStock: settings?.backInStock ?? true,
    targetHit: settings?.targetHit ?? true,
    webPush: settings?.webPush ?? true,
    expoPush: settings?.expoPush ?? true,
    telegram: settings?.telegram ?? false,
    minDropPct: settings?.minDropPct ?? 5,
    telegramChatId: settings?.telegramChatId ?? null,
    expoPushToken: settings?.expoPushToken ?? null,
    hasWebPush: Boolean(push),
  };
}

export async function updateAlertSettings(
  database: Database,
  userId: string,
  patch: Partial<Omit<AlertSettings, 'hasWebPush'>>,
): Promise<AlertSettings> {
  const current = await getAlertSettings(database, userId);
  const next = { ...current, ...patch };
  await database.db
    .insert(alertSettings)
    .values({
      userId,
      priceDrop: next.priceDrop,
      backInStock: next.backInStock,
      targetHit: next.targetHit,
      webPush: next.webPush,
      expoPush: next.expoPush,
      telegram: next.telegram,
      minDropPct: next.minDropPct,
      telegramChatId: next.telegramChatId,
      expoPushToken: next.expoPushToken,
    })
    .onConflictDoUpdate({
      target: alertSettings.userId,
      set: {
        priceDrop: next.priceDrop,
        backInStock: next.backInStock,
        targetHit: next.targetHit,
        webPush: next.webPush,
        expoPush: next.expoPush,
        telegram: next.telegram,
        minDropPct: next.minDropPct,
        telegramChatId: next.telegramChatId,
        expoPushToken: next.expoPushToken,
      },
    });
  return getAlertSettings(database, userId);
}

export async function saveWebPush(
  database: Database,
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
) {
  await database.db
    .insert(pushSubscriptions)
    .values({ id: randomUUID(), userId, ...subscription })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: subscription.p256dh, auth: subscription.auth },
    });
}

export async function listWebPushes(database: Database, userId: string) {
  return database.db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

export interface RaisedAlert {
  userId: string;
  alert: AlertItem;
}

function alertCopy(
  type: AlertItem['type'],
  titleAr: string,
  titleEn: string,
  price: number,
  dropPct?: number,
): { title: string; body: string } {
  const name = `${titleAr} · ${titleEn}`;
  if (type === 'back_in_stock') {
    return {
      title: 'رجع للمخزون · Back in stock',
      body: `${name} بقى متوفر تاني.`,
    };
  }
  if (type === 'target_hit') {
    return {
      title: 'وصل للسعر المستهدف · Target hit',
      body: `${name} وصل إلى ${price} ج.م.`,
    };
  }
  return {
    title: 'انخفاض السعر · Price drop',
    body: `${name} نزل إلى ${price} ج.م${dropPct != null ? ` (${dropPct}%)` : ''}.`,
  };
}

export async function recordObservation(
  database: Database,
  input: {
    offerId: string;
    priceEGP: number;
    listPriceEGP: number | null;
    inStock: boolean;
    capturedAt?: Date;
  },
): Promise<RaisedAlert[]> {
  const capturedAt = input.capturedAt ?? new Date();
  const [offer] = await database.db
    .select()
    .from(offers)
    .where(eq(offers.id, input.offerId));
  if (!offer) return [];
  const [product] = await database.db
    .select()
    .from(products)
    .where(eq(products.id, offer.productId));
  if (!product) return [];

  await database.db
    .insert(pricePoints)
    .values({
      offerId: offer.id,
      capturedAt,
      priceEgp: input.priceEGP,
      listPriceEgp: input.listPriceEGP,
      inStock: input.inStock,
    })
    .onConflictDoNothing();
  await database.db
    .update(offers)
    .set({
      priceEgp: input.priceEGP,
      listPriceEgp: input.listPriceEGP,
      inStock: input.inStock,
      lastSeenAt: capturedAt,
    })
    .where(eq(offers.id, offer.id));

  const watchers = await database.db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.productId, offer.productId));
  const raised: RaisedAlert[] = [];
  for (const watcher of watchers) {
    const settings = await getAlertSettings(database, watcher.userId);
    const events = evaluateAlertTransition({
      previousPrice: offer.priceEgp,
      currentPrice: input.priceEGP,
      wasInStock: offer.inStock,
      inStock: input.inStock,
      targetPrice: watcher.targetPriceEgp,
      minDropPct: settings.minDropPct,
      enabled: {
        priceDrop: settings.priceDrop,
        backInStock: settings.backInStock,
        targetHit: settings.targetHit,
      },
    });
    for (const event of events) {
      const copy = alertCopy(
        event.type,
        product.titleAr,
        product.titleEn,
        input.priceEGP,
        event.dropPct,
      );
      const id = randomUUID();
      const [row] = await database.db
        .insert(alerts)
        .values({
          id,
          userId: watcher.userId,
          productId: product.id,
          type: event.type,
          title: copy.title,
          body: copy.body,
        })
        .returning();
      if (row) raised.push({ userId: watcher.userId, alert: mapAlert(row) });
    }
  }
  await recomputeProduct(database, product.id, capturedAt);
  return raised;
}

export async function createManualAlert(
  database: Database,
  userId: string,
  input: {
    type: AlertItem['type'];
    title: string;
    body: string;
    productId?: string | null;
  },
): Promise<AlertItem> {
  const [row] = await database.db
    .insert(alerts)
    .values({
      id: randomUUID(),
      userId,
      productId: input.productId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
    })
    .returning();
  if (!row) throw new Error('alert was not stored');
  return mapAlert(row);
}

export async function dueProducts(database: Database, now = new Date()) {
  return database.db
    .select()
    .from(crawlState)
    .where(sql`${crawlState.nextCrawlAt} <= ${now}`);
}

export async function offersForProduct(database: Database, productId: string) {
  return database.db
    .select({ offer: offers, store: stores })
    .from(offers)
    .innerJoin(stores, eq(stores.id, offers.storeId))
    .where(eq(offers.productId, productId));
}

export async function postponeCrawl(
  database: Database,
  productId: string,
  minutes: number,
) {
  const next = new Date(Date.now() + minutes * 60 * 1000);
  await database.db
    .update(crawlState)
    .set({ lastCrawledAt: new Date(), nextCrawlAt: next })
    .where(eq(crawlState.productId, productId));
}
