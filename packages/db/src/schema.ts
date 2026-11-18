import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** numeric(12,2) surfaced as a number. Whole pounds are exact; piasters round-trip as decimals. */
export const egp = customType<{ data: number; driverData: string }>({
  dataType() {
    return 'numeric(12,2)';
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    return value.toFixed(2);
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  locale: text('locale').notNull().default('ar'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_provider_account').on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sessions_user').on(table.userId)],
);

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  domain: text('domain').notNull(),
  adapterStatus: text('adapter_status').notNull(),
  notes: text('notes'),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    titleAr: text('title_ar').notNull(),
    titleEn: text('title_en').notNull(),
    brand: text('brand'),
    model: text('model'),
    ean: text('ean'),
    categoryId: uuid('category_id').references(() => categories.id),
    imageUrl: text('image_url'),
    normalizedTitle: text('normalized_title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('products_category').on(table.categoryId),
    index('products_ean').on(table.ean),
    index('products_normalized').on(table.normalizedTitle),
  ],
);

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    url: text('url').notNull(),
    title: text('title').notNull(),
    priceEgp: egp('price_egp').notNull(),
    listPriceEgp: egp('list_price_egp'),
    inStock: boolean('in_stock').notNull().default(true),
    condition: text('condition').notNull().default('new'),
    imageUrl: text('image_url'),
    rating: egp('rating'),
    dealScore: integer('deal_score').notNull().default(0),
    dealLabel: text('deal_label').notNull().default('fair'),
    fakeDiscount: boolean('fake_discount').notNull().default(false),
    fakeDiscountReason: text('fake_discount_reason'),
    discountPct: egp('discount_pct'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    contentHash: text('content_hash'),
    /** Compact MarkItDown page text for the debate/assistant. */
    llmMarkdown: text('llm_markdown'),
    /**
     * Whether the last fetch produced a structured JSON-LD (or official API)
     * offer. False means stored catalog prices may be stale; do not label
     * them as JSON-LD in the LLM context.
     */
    lastFetchHadOffer: boolean('last_fetch_had_offer'),
  },
  (table) => [
    uniqueIndex('offers_store_url').on(table.storeId, table.url),
    index('offers_product').on(table.productId),
    index('offers_score').on(table.dealScore),
  ],
);

/**
 * Timescale-ready: the timestamp is part of the primary key, which is what
 * create_hypertable requires of any unique index. No foreign key, because
 * hypertables still reject some outgoing FKs; the app keeps offer_id valid.
 */
export const pricePoints = pgTable(
  'price_points',
  {
    offerId: uuid('offer_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    priceEgp: egp('price_egp').notNull(),
    listPriceEgp: egp('list_price_egp'),
    inStock: boolean('in_stock').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.offerId, table.capturedAt] }),
    index('price_points_captured').on(table.capturedAt),
  ],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    targetPriceEgp: egp('target_price_egp'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('watch_user_product').on(table.userId, table.productId),
  ],
);

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('alerts_user_created').on(table.userId, table.createdAt)],
);

export const alertSettings = pgTable('alert_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  priceDrop: boolean('price_drop').notNull().default(true),
  backInStock: boolean('back_in_stock').notNull().default(true),
  targetHit: boolean('target_hit').notNull().default(true),
  webPush: boolean('web_push').notNull().default(true),
  expoPush: boolean('expo_push').notNull().default(true),
  telegram: boolean('telegram').notNull().default(false),
  minDropPct: egp('min_drop_pct').notNull().default(5),
  telegramChatId: text('telegram_chat_id'),
  expoPushToken: text('expo_push_token'),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const crawlState = pgTable('crawl_state', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  heat: text('heat').notNull().default('cold'),
  watcherCount: integer('watcher_count').notNull().default(0),
  lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
  nextCrawlAt: timestamp('next_crawl_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  intervalMinutes: integer('interval_minutes').notNull().default(2880),
});

export const dealDebates = pgTable(
  'deal_debates',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    recommendation: text('recommendation').notNull(),
    explanationAr: text('explanation_ar').notNull(),
    explanationEn: text('explanation_en').notNull(),
    provider: text('provider').notNull(),
    tokens: integer('tokens').notNull().default(0),
    priceFingerprint: text('price_fingerprint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('debates_product_created').on(table.productId, table.createdAt),
  ],
);

export const debateMessages = pgTable(
  'debate_messages',
  {
    debateId: uuid('debate_id')
      .notNull()
      .references(() => dealDebates.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role').notNull(),
    kind: text('kind').notNull(),
    toolName: text('tool_name'),
    content: text('content').notNull(),
    provider: text('provider'),
  },
  (table) => [primaryKey({ columns: [table.debateId, table.seq] })],
);

export const bankOffers = pgTable('bank_offers', {
  id: uuid('id').primaryKey(),
  bank: text('bank').notNull(),
  code: text('code').notNull(),
  percent: egp('percent').notNull(),
  capEgp: egp('cap_egp'),
  stores: text('stores'),
  categories: text('categories'),
});

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  storeSlug: text('store_slug'),
  percent: egp('percent'),
  amountEgp: egp('amount_egp'),
  capEgp: egp('cap_egp'),
  minSpendEgp: egp('min_spend_egp'),
});
