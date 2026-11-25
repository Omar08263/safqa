-- v5 smart notifications: per-user prefs + interest model (opt-in), and a dedupe log.
CREATE TABLE IF NOT EXISTS notif_prefs (
  user_id TEXT PRIMARY KEY,
  opted_in INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'digest',          -- instant | digest | off
  quiet_start INTEGER NOT NULL DEFAULT 23,      -- Cairo hour, inclusive
  quiet_end INTEGER NOT NULL DEFAULT 9,         -- Cairo hour, exclusive
  digest_hour INTEGER NOT NULL DEFAULT 10,
  min_drop REAL NOT NULL DEFAULT 5,
  max_per_day INTEGER NOT NULL DEFAULT 3,
  auto_track INTEGER NOT NULL DEFAULT 1,        -- products you view are tracked automatically
  interests TEXT NOT NULL DEFAULT '{}',         -- {cats:{}, brands:{}, viewed:[[id,price,at]], searches:[]}
  last_digest TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notif_sent (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id, kind)
);
CREATE INDEX IF NOT EXISTS notif_sent_at ON notif_sent(user_id, at);
