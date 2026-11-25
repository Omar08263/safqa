-- Owner-only toolkit (Safqa Hub): command agent changes with rollback snapshots, agent documents (intel, growth, campaigns, briefs), per-agent autonomy.
ALTER TABLE ops_agents ADD COLUMN auto INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS owner_changes (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT,
  actions TEXT NOT NULL, before TEXT, status TEXT NOT NULL, baseline_err REAL, applied_at TEXT, rolled_at TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS owner_changes_at ON owner_changes(status, at);
CREATE TABLE IF NOT EXISTS owner_docs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, day TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, data TEXT, ai INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS owner_docs_kind ON owner_docs(kind, at);
INSERT OR IGNORE INTO flags (key, enabled, rollout, value, description, guard, updated_at, updated_by) VALUES
 ('owner_autopilot', 1, 100, NULL, 'الطيار الآلي العام لأدوات المالك: الوكلاء ينفّذوا لوحدهم (بحدود وحماية ورجوع تلقائي)', 0, datetime('now'), 'seed'),
 ('featured_deals', 0, 100, NULL, 'صيد اليوم: عروض متأكد منها يختارها «صيّاد» وتظهر في الرئيسية', 1, datetime('now'), 'seed'),
 ('campaign_telegram', 0, 100, NULL, 'السماح لـ«حملة» تنشر تلقائيًا على تيليجرام صفقة (للمشتركين بس، مرة في اليوم بالكتير)', 0, datetime('now'), 'seed');
