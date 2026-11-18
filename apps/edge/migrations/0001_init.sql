CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  pass_hash TEXT,
  pass_salt TEXT,
  google_sub TEXT,
  locale TEXT NOT NULL DEFAULT 'ar',
  tier TEXT NOT NULL DEFAULT 'free',
  tier_until TEXT,
  tier_status TEXT NOT NULL DEFAULT 'active',
  xp INTEGER NOT NULL DEFAULT 0,
  badges TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  rules_version TEXT,
  handle TEXT,
  bio TEXT,
  city TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE resets (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, exp INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0);
CREATE TABLE user_kv (user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, key));
CREATE TABLE watchlist (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL, target REAL, created_at TEXT NOT NULL, UNIQUE (user_id, product_id));
CREATE TABLE alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, product_id TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX alerts_user ON alerts(user_id, created_at);
CREATE TABLE xp_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL);

CREATE TABLE products (id TEXT PRIMARY KEY, title_ar TEXT, title_en TEXT, brand TEXT, category TEXT, price REAL, store TEXT, deal_score REAL, discount REAL, url TEXT, search TEXT, updated_at TEXT);

CREATE TABLE groups_ (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, descr TEXT, emoji TEXT, color TEXT, host TEXT, created_by TEXT, created_at TEXT NOT NULL);
CREATE TABLE group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (group_id, user_id));
CREATE TABLE posts (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, group_id TEXT NOT NULL, text TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]', product_id TEXT, kind TEXT NOT NULL DEFAULT 'post', reactions TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'visible', warned TEXT, pinned INTEGER NOT NULL DEFAULT 0, agent_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX posts_time ON posts(created_at);
CREATE TABLE comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL, text TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]', reactions TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'visible', warned TEXT, agent_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX comments_post ON comments(post_id, created_at);
CREATE TABLE rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, topic TEXT, emoji TEXT, host TEXT, kind TEXT NOT NULL DEFAULT 'room', created_at TEXT NOT NULL);
CREATE TABLE messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, author_id TEXT NOT NULL, text TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]', reactions TEXT NOT NULL DEFAULT '{}', product_id TEXT, system INTEGER NOT NULL DEFAULT 0, agent_id TEXT, status TEXT NOT NULL DEFAULT 'visible', seq INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX messages_room ON messages(room_id, seq);
CREATE TABLE reviews (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, author_id TEXT NOT NULL, stars INTEGER NOT NULL, title TEXT, text TEXT NOT NULL, pros TEXT, cons TEXT, attachments TEXT NOT NULL DEFAULT '[]', helpful TEXT NOT NULL DEFAULT '[]', verified INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'visible', created_at TEXT NOT NULL, UNIQUE (product_id, author_id));
CREATE TABLE media (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT, type TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE penalties (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, rules TEXT NOT NULL, action TEXT NOT NULL, until TEXT, points INTEGER NOT NULL, reason TEXT NOT NULL, evidence TEXT, agent_id TEXT, where_ TEXT, content_id TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL, appeal_text TEXT, appeal_status TEXT, appeal_reply TEXT, appeal_at TEXT);
CREATE INDEX penalties_user ON penalties(user_id, created_at);

CREATE TABLE payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tier TEXT NOT NULL, months INTEGER NOT NULL DEFAULT 1, list_amount REAL NOT NULL, amount REAL NOT NULL, code TEXT, ref_code TEXT NOT NULL UNIQUE, txn_ref TEXT UNIQUE, receipt_key TEXT, extraction TEXT, checks TEXT, confidence REAL, status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, submitted_at TEXT, decided_at TEXT, decided_by TEXT);
CREATE INDEX payments_status ON payments(status, created_at);
CREATE TABLE codes (code TEXT PRIMARY KEY, kind TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, tiers TEXT NOT NULL DEFAULT '[]', expires_at TEXT, max_uses INTEGER, per_user INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0, upgrade_tier TEXT, upgrade_days INTEGER, active INTEGER NOT NULL DEFAULT 1, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE code_redemptions (id TEXT PRIMARY KEY, code TEXT NOT NULL, user_id TEXT NOT NULL, payment_id TEXT, at TEXT NOT NULL);

CREATE TABLE agent_config (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, mood TEXT, persona TEXT, updated_at TEXT);
CREATE TABLE agent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, kind TEXT NOT NULL, input TEXT, output TEXT, model TEXT, ms INTEGER, fallback INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE INDEX agent_logs_at ON agent_logs(at);
CREATE TABLE ai_usage (day TEXT NOT NULL, kind TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind));
CREATE TABLE ai_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);

CREATE TABLE announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE tg_links (chat_id TEXT PRIMARY KEY, user_id TEXT, subscribed INTEGER NOT NULL DEFAULT 1, link_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, at TEXT NOT NULL);
