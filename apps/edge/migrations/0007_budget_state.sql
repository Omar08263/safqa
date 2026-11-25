-- Write-budget telemetry and a tiny D1-backed state store (replaces cron-state writes to KV,
-- whose free tier allows only 1,000 writes/day). WITHOUT ROWID + no secondary index = 1 row written per upsert.
CREATE TABLE IF NOT EXISTS kstate (key TEXT PRIMARY KEY, value TEXT NOT NULL, exp INTEGER) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wbudget (day TEXT NOT NULL, job TEXT NOT NULL, rows INTEGER NOT NULL DEFAULT 0, ops INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, job)) WITHOUT ROWID;
