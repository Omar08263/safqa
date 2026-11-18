import type { Sql } from 'postgres';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text,
    locale text NOT NULL DEFAULT 'ar',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_accounts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS oauth_provider_account ON oauth_accounts (provider, provider_account_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS stores (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    domain text NOT NULL,
    adapter_status text NOT NULL,
    notes text
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name_ar text NOT NULL,
    name_en text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id uuid PRIMARY KEY,
    title_ar text NOT NULL,
    title_en text NOT NULL,
    brand text,
    model text,
    ean text,
    category_id uuid REFERENCES categories(id),
    image_url text,
    normalized_title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS products_category ON products (category_id)`,
  `CREATE INDEX IF NOT EXISTS products_ean ON products (ean)`,
  `CREATE INDEX IF NOT EXISTS products_normalized ON products (normalized_title)`,
  `CREATE TABLE IF NOT EXISTS offers (
    id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES stores(id),
    url text NOT NULL,
    title text NOT NULL,
    price_egp numeric(12,2) NOT NULL,
    list_price_egp numeric(12,2),
    in_stock boolean NOT NULL DEFAULT true,
    condition text NOT NULL DEFAULT 'new',
    image_url text,
    rating numeric(12,2),
    deal_score integer NOT NULL DEFAULT 0,
    deal_label text NOT NULL DEFAULT 'fair',
    fake_discount boolean NOT NULL DEFAULT false,
    fake_discount_reason text,
    discount_pct numeric(12,2),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS offers_store_url ON offers (store_id, url)`,
  `CREATE INDEX IF NOT EXISTS offers_product ON offers (product_id)`,
  `CREATE INDEX IF NOT EXISTS offers_score ON offers (deal_score)`,
  `CREATE TABLE IF NOT EXISTS price_points (
    offer_id uuid NOT NULL,
    captured_at timestamptz NOT NULL,
    price_egp numeric(12,2) NOT NULL,
    list_price_egp numeric(12,2),
    in_stock boolean NOT NULL,
    PRIMARY KEY (offer_id, captured_at)
  )`,
  `CREATE INDEX IF NOT EXISTS price_points_captured ON price_points (captured_at)`,
  `CREATE TABLE IF NOT EXISTS watchlist_items (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_price_egp numeric(12,2),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS watch_user_product ON watchlist_items (user_id, product_id)`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS alerts_user_created ON alerts (user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS alert_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    price_drop boolean NOT NULL DEFAULT true,
    back_in_stock boolean NOT NULL DEFAULT true,
    target_hit boolean NOT NULL DEFAULT true,
    web_push boolean NOT NULL DEFAULT true,
    expo_push boolean NOT NULL DEFAULT true,
    telegram boolean NOT NULL DEFAULT false,
    min_drop_pct numeric(12,2) NOT NULL DEFAULT 5,
    telegram_chat_id text,
    expo_push_token text
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS crawl_state (
    product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    heat text NOT NULL DEFAULT 'cold',
    watcher_count integer NOT NULL DEFAULT 0,
    last_crawled_at timestamptz,
    next_crawl_at timestamptz NOT NULL DEFAULT now(),
    interval_minutes integer NOT NULL DEFAULT 2880
  )`,
  `ALTER TABLE offers ADD COLUMN IF NOT EXISTS content_hash text`,
  `ALTER TABLE offers ADD COLUMN IF NOT EXISTS llm_markdown text`,
  `ALTER TABLE offers ADD COLUMN IF NOT EXISTS last_fetch_had_offer boolean`,
  `CREATE TABLE IF NOT EXISTS deal_debates (
    id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    score integer NOT NULL,
    recommendation text NOT NULL,
    explanation_ar text NOT NULL,
    explanation_en text NOT NULL,
    provider text NOT NULL,
    tokens integer NOT NULL DEFAULT 0,
    price_fingerprint text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS debates_product_created ON deal_debates (product_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS debate_messages (
    debate_id uuid NOT NULL REFERENCES deal_debates(id) ON DELETE CASCADE,
    seq integer NOT NULL,
    role text NOT NULL,
    kind text NOT NULL,
    tool_name text,
    content text NOT NULL,
    provider text,
    PRIMARY KEY (debate_id, seq)
  )`,
  `ALTER TABLE debate_messages ADD COLUMN IF NOT EXISTS provider text`,
  `CREATE TABLE IF NOT EXISTS bank_offers (
    id uuid PRIMARY KEY,
    bank text NOT NULL,
    code text NOT NULL,
    percent numeric(12,2) NOT NULL,
    cap_egp numeric(12,2),
    stores text,
    categories text
  )`,
  `CREATE TABLE IF NOT EXISTS coupons (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    store_slug text,
    percent numeric(12,2),
    amount_egp numeric(12,2),
    cap_egp numeric(12,2),
    min_spend_egp numeric(12,2)
  )`,
];

export async function migrate(sql: Sql): Promise<{ timescale: boolean }> {
  for (const statement of STATEMENTS) {
    await sql.unsafe(statement);
  }
  let timescale = false;
  try {
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await sql.unsafe(
      `SELECT create_hypertable('price_points', 'captured_at', if_not_exists => TRUE, migrate_data => TRUE)`,
    );
    timescale = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Timescale hypertable skipped (${message}). price_points stays a plain table with the same key.`,
    );
  }
  return { timescale };
}
