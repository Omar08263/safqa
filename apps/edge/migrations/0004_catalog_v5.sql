-- Safqa v5 catalog: thousands of products, cross-store offers and real price history.
-- One row per product keeps D1 free-tier writes low (index entries count as writes):
-- offers + their price-change history live in a JSON column.
CREATE TABLE IF NOT EXISTS catalog (
  id TEXT PRIMARY KEY,
  mkey TEXT NOT NULL,
  title TEXT NOT NULL,
  title_ar TEXT,
  brand TEXT,
  category TEXT,
  image TEXT,
  gtin TEXT,
  cond TEXT NOT NULL DEFAULT 'new',
  price REAL,
  list_price REAL,
  store TEXT,
  url TEXT,
  n_offers INTEGER NOT NULL DEFAULT 0,
  in_stock INTEGER NOT NULL DEFAULT 1,
  offers TEXT NOT NULL DEFAULT '[]',
  low REAL,
  med30 REAL,
  drop_pct REAL,
  drop_at TEXT,
  heat REAL NOT NULL DEFAULT 0,
  hot INTEGER NOT NULL DEFAULT 0,
  cold INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  specs TEXT,
  source TEXT,
  first_seen TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS catalog_cat_heat ON catalog (category, heat DESC);
CREATE INDEX IF NOT EXISTS catalog_heat ON catalog (heat DESC);

-- Contentless trigram index (substring + typo-ish Arabic/English search); rowid = catalog.rowid.
CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(text, tokenize = 'trigram', content = '', contentless_delete = 1);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, domain TEXT NOT NULL, kind TEXT NOT NULL,
  products INTEGER NOT NULL DEFAULT 0, last_crawl TEXT, note TEXT
);

CREATE TABLE IF NOT EXISTS votes (user_key TEXT NOT NULL, product_id TEXT NOT NULL, v INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (user_key, product_id));

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY, store TEXT NOT NULL, code TEXT, title TEXT NOT NULL, url TEXT, expires TEXT, source TEXT NOT NULL,
  worked INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, created_by TEXT, status TEXT NOT NULL DEFAULT 'visible', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, url TEXT NOT NULL, user_key TEXT, status TEXT NOT NULL, product_id TEXT, note TEXT, created_at TEXT NOT NULL);

-- Live feed of real price drops (SSE / polling read this by id).
CREATE TABLE IF NOT EXISTS drops (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL, store TEXT, old REAL NOT NULL, new REAL NOT NULL, pct REAL NOT NULL, at TEXT NOT NULL);
