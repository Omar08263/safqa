-- Security hardening (docs/security.md). Apply AFTER the D1 daily write quota resets
-- (00:00 UTC = 02:00 Cairo); code works before and after this migration.
-- Refresh-token families for rotation + reuse detection.
ALTER TABLE sessions ADD COLUMN family TEXT;
ALTER TABLE sessions ADD COLUMN rotated_at INTEGER;
CREATE INDEX IF NOT EXISTS sessions_family ON sessions(family);
-- Intrusion-detection log: one aggregated row per (kind, ip) per flush window.
CREATE TABLE IF NOT EXISTS sec_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  first_at INTEGER,
  kind TEXT NOT NULL,
  ip TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  who TEXT,
  path TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS sec_events_at ON sec_events(at);
CREATE INDEX IF NOT EXISTS sec_events_kind ON sec_events(kind, at);
