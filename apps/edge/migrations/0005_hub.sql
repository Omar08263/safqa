-- Safqa Hub + autonomous co-management (autopilot) — v5.
CREATE TABLE IF NOT EXISTS flags (
  key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, rollout INTEGER NOT NULL DEFAULT 100,
  value TEXT, description TEXT, platforms TEXT NOT NULL DEFAULT '["web","app"]', guard INTEGER NOT NULL DEFAULT 1,
  rolled_back_at TEXT, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS ops_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, severity TEXT NOT NULL DEFAULT 'info');
CREATE INDEX IF NOT EXISTS ops_audit_at ON ops_audit(at);
CREATE TABLE IF NOT EXISTS ops_agents (id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, runs INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, overridden INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, rank_override TEXT, last_run TEXT, last_note TEXT);
CREATE TABLE IF NOT EXISTS escalations (id TEXT PRIMARY KEY, at TEXT NOT NULL, agent_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, ref TEXT, options TEXT NOT NULL DEFAULT '[]', suggestion TEXT, status TEXT NOT NULL DEFAULT 'open', decision TEXT, decided_at TEXT, decided_by TEXT, UNIQUE (kind, ref));
CREATE INDEX IF NOT EXISTS escalations_status ON escalations(status, at);
CREATE TABLE IF NOT EXISTS client_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, sid TEXT, platform TEXT, kind TEXT NOT NULL, flag TEXT, msg TEXT, version TEXT);
CREATE INDEX IF NOT EXISTS client_events_at ON client_events(at);
CREATE TABLE IF NOT EXISTS ops_reports (day TEXT PRIMARY KEY, body TEXT NOT NULL, stats TEXT NOT NULL, ai INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_pairs (code TEXT PRIMARY KEY, admin_user TEXT NOT NULL, exp INTEGER NOT NULL);

INSERT OR IGNORE INTO flags (key, enabled, rollout, value, description, guard, updated_at, updated_by) VALUES
 ('whats_new', 1, 100, NULL, 'شاشة «الجديد» المتحركة بعد كل تحديث', 1, datetime('now'), 'seed'),
 ('ui_sounds', 1, 100, NULL, 'أصوات الواجهة الفخمة (ASMR) — المستخدم يقدر يقفلها', 1, datetime('now'), 'seed'),
 ('premium_motion', 1, 100, NULL, 'حركة زنبركية وزجاج وجسيمات', 1, datetime('now'), 'seed'),
 ('offline_ai', 1, 100, NULL, 'بحث دلالي وملخصات بالذكاء الاصطناعي جوه المتصفح', 1, datetime('now'), 'seed'),
 ('webllm', 1, 100, NULL, 'نموذج لغة صغير أوفلاين (تحميل اختياري)', 1, datetime('now'), 'seed'),
 ('price_lens', 1, 100, NULL, 'عدسة الأسعار بالكاميرا + الباركود', 1, datetime('now'), 'seed'),
 ('voice_assistant', 1, 100, NULL, 'مساعد التسوّق بالصوت بالمصري', 1, datetime('now'), 'seed'),
 ('time_machine', 1, 100, NULL, 'آلة زمن الأسعار (توقع)', 1, datetime('now'), 'seed'),
 ('deal_globe', 1, 100, NULL, 'كرة العروض ثلاثية الأبعاد', 1, datetime('now'), 'seed'),
 ('live_community', 1, 100, NULL, 'صفقة لايف: المجتمع والدردشة', 1, datetime('now'), 'seed'),
 ('banner', 0, 100, '{"ar":"","level":"info"}', 'شريط إعلان أعلى الموقع والتطبيق', 0, datetime('now'), 'seed');
