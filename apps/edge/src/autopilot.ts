// Safqa Autopilot — management agents that co-run the site on the Worker cron,
// without the owner. Each agent has a track record (XP → rank), and its rank
// decides how much it may do on its own; anything risky becomes an escalation
// the owner answers in Safqa Hub. Every action lands in ops_audit.
// AI use is tiny (≈2–4 calls/day): curation headline + daily report, cached,
// with template fallbacks when the free Workers AI quota is gone.
import { aiBudgetLeft, llm } from './ai';
import { analyze } from '../../web/src/lib/moderation';
import { decidePayment } from './payments';
import { enqueue, tgEnabled } from './telegram';
import { cairoDay, type Env, nowIso, parseJ, uid } from './util';

export interface OpsAgent { id: string; name: string; emoji: string; role: string; color: string; every: number; crew?: 'ops' | 'owner' }
/** every = minutes between runs (cron ticks every 10 min). */
export const OPS_AGENTS: OpsAgent[] = [
  { id: 'haris', name: 'حارس', emoji: '🛡️', role: 'رصد الأعطال وإرجاع المزايا اللي بتعمل مشاكل تلقائيًا', color: '#ef4444', every: 10 },
  { id: 'mizan', name: 'ميزان', emoji: '⚖️', role: 'الإشراف التلقائي على المجتمع والدردشة', color: '#8b5cf6', every: 30 },
  { id: 'kashaf', name: 'كشّاف', emoji: '🔭', role: 'صحة الكتالوج وطلب إعادة السحب', color: '#0ea5e9', every: 60 },
  { id: 'radar', name: 'رادار', emoji: '📡', role: 'رصد الأسعار الغريبة والخصومات المضروبة', color: '#f59e0b', every: 60 },
  { id: 'khazna', name: 'أمين الخزنة', emoji: '🏦', role: 'مراجعة إيصالات إنستاباي واعتمادها', color: '#10b981', every: 10 },
  { id: 'monasseq', name: 'منسّق', emoji: '🎨', role: 'اختيار عروض اليوم وصياغة الإشعارات', color: '#ec4899', every: 360 },
  { id: 'rawi', name: 'راوي', emoji: '📜', role: 'التقرير اليومي للمالك', color: '#64748b', every: 1440 },
];

export const OPS_RANKS = [
  { id: 'trainee', ar: 'متدرّب', emoji: '🌱', min: 0, autonomy: 'يقترح بس' },
  { id: 'assistant', ar: 'مساعد', emoji: '🔧', min: 50, autonomy: 'ينفّذ المهام البسيطة' },
  { id: 'pro', ar: 'محترف', emoji: '⭐', min: 200, autonomy: 'ينفّذ أغلب القرارات ويبلّغ' },
  { id: 'expert', ar: 'خبير', emoji: '💎', min: 600, autonomy: 'يعتمد قرارات حساسة بثقة عالية' },
  { id: 'legend', ar: 'أسطورة', emoji: '👑', min: 1500, autonomy: 'إدارة كاملة، يرجع للمالك في الاستثنائي بس' },
] as const;
export type RankId = (typeof OPS_RANKS)[number]['id'];
export const rankIndex = (id: string) => Math.max(0, OPS_RANKS.findIndex((r) => r.id === id));
export function rankFor(xp: number, override?: string | null) {
  if (override && OPS_RANKS.some((r) => r.id === override)) return OPS_RANKS[rankIndex(override)]!;
  let r: (typeof OPS_RANKS)[number] = OPS_RANKS[0];
  for (const x of OPS_RANKS) if (xp >= x.min) r = x;
  return r;
}
export function nextRank(xp: number) {
  return OPS_RANKS.find((r) => r.min > xp) ?? null;
}

type Row = { id: string; xp: number; runs: number; ok: number; failed: number; overridden: number; enabled: number; rank_override: string | null; last_run: string | null; last_note: string | null; auto?: number };

export async function opsLog(env: Env, actor: string, kind: string, title: string, detail?: unknown, severity: 'info' | 'warn' | 'crit' | 'ok' = 'info') {
  try {
    await env.DB.prepare('INSERT INTO ops_audit (at,actor,kind,title,detail,severity) VALUES (?,?,?,?,?,?)')
      .bind(nowIso(), actor, kind, title.slice(0, 300), detail === undefined ? null : JSON.stringify(detail).slice(0, 4000), severity).run();
  } catch (e) { console.log('ops audit write failed', actor, kind, title.slice(0, 80), String(e).slice(0, 120)); }
}

async function agentRow(env: Env, id: string): Promise<Row> {
  await env.DB.prepare('INSERT OR IGNORE INTO ops_agents (id) VALUES (?)').bind(id).run();
  return (await env.DB.prepare('SELECT * FROM ops_agents WHERE id=?').bind(id).first<Row>())!;
}
export async function grantOpsXp(env: Env, id: string, xp: number, note?: string) {
  const before = await agentRow(env, id);
  const xpAfter = Math.max(0, before.xp + xp);
  await env.DB.prepare('UPDATE ops_agents SET xp=?, overridden=overridden+? WHERE id=?').bind(xpAfter, xp < 0 ? 1 : 0, id).run();
  const r0 = rankFor(before.xp, before.rank_override), r1 = rankFor(xpAfter, before.rank_override);
  if (r0.id !== r1.id) {
    const a = OPS_AGENTS.find((x) => x.id === id);
    await opsLog(env, id, 'rank', `${a?.emoji ?? ''} ${a?.name ?? id} ${rankIndex(r1.id) > rankIndex(r0.id) ? 'اترقّى' : 'نزل'} لرتبة ${r1.emoji} ${r1.ar}`, { from: r0.id, to: r1.id, xp: xpAfter, note }, rankIndex(r1.id) > rankIndex(r0.id) ? 'ok' : 'warn');
  }
}
export async function agentRank(env: Env, id: string) {
  const r = await agentRow(env, id);
  return rankFor(r.xp, r.rank_override);
}

export async function escalate(env: Env, agentId: string, kind: string, ref: string | null, title: string, body: string, options: { id: string; ar: string }[], suggestion?: string) {
  const id = uid('esc_');
  const r = await env.DB.prepare('INSERT OR IGNORE INTO escalations (id,at,agent_id,kind,title,body,ref,options,suggestion) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, nowIso(), agentId, kind, title.slice(0, 200), body.slice(0, 2000), ref, JSON.stringify(options), suggestion ?? null).run();
  if (!r.meta.changes) return null;
  await opsLog(env, agentId, 'escalation', `محتاج قرارك: ${title}`, { id, kind, ref, suggestion }, 'warn');
  await notifyOwner(env, `🔔 <b>صفقة محتاجة قرارك</b>\n${title}\n\n${body.slice(0, 500)}\n\nافتح Safqa Hub علشان تقرّر.`);
  return id;
}

/** Telegram DM to every linked owner account (ADMIN_EMAILS). */
export async function notifyOwner(env: Env, html: string) {
  if (!tgEnabled(env)) return 0;
  const emails = (env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (!emails.length) return 0;
  const rows = (await env.DB.prepare(`SELECT t.chat_id FROM tg_links t JOIN users u ON u.id=t.user_id WHERE lower(u.email) IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<{ chat_id: string }>()).results;
  for (const r of rows) await enqueue(env, r.chat_id, html);
  return rows.length;
}

// ---------------------------------------------------------------- flags / remote config
export interface FlagRow { key: string; enabled: number; rollout: number; value: string | null; description: string | null; platforms: string; guard: number; rolled_back_at: string | null; updated_at: string | null; updated_by: string | null }
export async function publicConfig(env: Env) {
  const cached = await env.KV.get('config:public', 'json');
  if (cached) return cached;
  const flags = (await env.DB.prepare('SELECT * FROM flags').all<FlagRow>()).results;
  const curated = parseJ((await env.DB.prepare("SELECT value FROM settings WHERE key='curated'").first<{ value: string }>())?.value, null);
  const suspect = parseJ<string[]>((await env.DB.prepare("SELECT value FROM settings WHERE key='price_suspects'").first<{ value: string }>())?.value, []);
  const out = {
    version: Date.now(),
    flags: Object.fromEntries(flags.map((f) => [f.key, { on: Boolean(f.enabled), rollout: f.rollout, value: parseJ(f.value, f.value), platforms: parseJ<string[]>(f.platforms, ['web', 'app']) }])),
    curated, suspectPrices: suspect.slice(0, 200),
  };
  await env.KV.put('config:public', JSON.stringify(out), { expirationTtl: 300 });
  return out;
}
export const bustConfig = (env: Env) => env.KV.delete('config:public');

export async function setFlag(env: Env, actor: string, key: string, patch: Partial<{ enabled: boolean; rollout: number; value: unknown; description: string; guard: boolean; platforms: string[] }>) {
  if (!/^[a-z0-9_]{2,40}$/.test(key)) throw new Error('bad key');
  await env.DB.prepare('INSERT OR IGNORE INTO flags (key, updated_at, updated_by) VALUES (?,?,?)').bind(key, nowIso(), actor).run();
  const sets: string[] = [], b: unknown[] = [];
  if (patch.enabled !== undefined) { sets.push('enabled=?'); b.push(patch.enabled ? 1 : 0); if (patch.enabled) sets.push('rolled_back_at=NULL'); }
  if (patch.rollout !== undefined) { sets.push('rollout=?'); b.push(Math.max(0, Math.min(100, Math.round(Number(patch.rollout))))); }
  if (patch.value !== undefined) { sets.push('value=?'); b.push(patch.value === null ? null : JSON.stringify(patch.value)); }
  if (patch.description !== undefined) { sets.push('description=?'); b.push(String(patch.description).slice(0, 200)); }
  if (patch.guard !== undefined) { sets.push('guard=?'); b.push(patch.guard ? 1 : 0); }
  if (patch.platforms !== undefined) { sets.push('platforms=?'); b.push(JSON.stringify(patch.platforms)); }
  sets.push('updated_at=?', 'updated_by=?'); b.push(nowIso(), actor);
  await env.DB.prepare(`UPDATE flags SET ${sets.join(',')} WHERE key=?`).bind(...b, key).run();
  await bustConfig(env);
  await opsLog(env, actor, 'flag', `الميزة «${key}» اتعدّلت`, patch, 'info');
}

// ---------------------------------------------------------------- agents
export type Result = { ok: boolean; note: string; xp?: number };

/** 🛡️ Incident detection: client error spikes per flag → auto-rollback guarded flags. */
async function haris(env: Env): Promise<Result> {
  const since = Date.now() - 15 * 60_000;
  const byFlag = (await env.DB.prepare('SELECT flag, COUNT(*) AS n, COUNT(DISTINCT sid) AS users FROM client_events WHERE at>? AND flag IS NOT NULL GROUP BY flag').bind(since).all<{ flag: string; n: number; users: number }>()).results;
  const rolled: string[] = [];
  for (const f of byFlag) {
    if (f.n < 8 || f.users < 3) continue;
    const row = await env.DB.prepare('SELECT enabled, guard FROM flags WHERE key=?').bind(f.flag).first<{ enabled: number; guard: number }>();
    if (!row?.enabled || !row.guard) continue;
    await env.DB.prepare('UPDATE flags SET enabled=0, rolled_back_at=?, updated_at=?, updated_by=? WHERE key=?').bind(nowIso(), nowIso(), 'agent:haris', f.flag).run();
    rolled.push(f.flag);
    await opsLog(env, 'haris', 'incident', `🚨 رجّعت الميزة «${f.flag}» — ${f.n} خطأ من ${f.users} مستخدم في ربع ساعة`, f, 'crit');
    await escalate(env, 'haris', 'rollback', `${f.flag}:${cairoDay()}`, `الميزة «${f.flag}» اتقفلت تلقائيًا`, `${f.n} خطأ عند ${f.users} مستخدم في آخر 15 دقيقة. قفلتها علشان محدش يتضايق. ترجّعها؟`, [{ id: 'enable', ar: 'رجّعها' }, { id: 'keep_off', ar: 'خليها مقفولة' }], 'keep_off');
  }
  if (rolled.length) await bustConfig(env);
  const total = Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM client_events WHERE at>?').bind(since).first<{ n: number }>())?.n ?? 0);
  if (total > 120) await escalate(env, 'haris', 'error_spike', `spike:${cairoDay()}:${new Date().getUTCHours()}`, 'أخطاء كتير عند المستخدمين', `${total} خطأ في ربع ساعة من غير ميزة معيّنة. ممكن يكون نشر جديد فيه مشكلة.`, [{ id: 'ack', ar: 'شفتها' }]);
  // API self-check: AI budget and snapshot freshness.
  const left = await aiBudgetLeft(env);
  if (left < 20) await opsLog(env, 'haris', 'quota', `حصة الذكاء الاصطناعي قربت تخلص (${left} باقي) — الوكلاء بيشتغلوا بالمحرك الأوفلاين`, { left }, 'warn');
  await env.DB.prepare('DELETE FROM client_events WHERE at<?').bind(Date.now() - 3 * 86400_000).run();
  return { ok: true, note: rolled.length ? `رجّعت ${rolled.join('، ')}` : `كله تمام (${total} حدث)`, xp: rolled.length ? 15 : 1 };
}

/** ⚖️ Auto-moderation sweep of the last hour (heuristics; AI judge already runs on appeals). */
async function mizan(env: Env): Promise<Result> {
  const since = new Date(Date.now() - 65 * 60_000).toISOString();
  let hidden = 0, scanned = 0;
  for (const [table, type] of [['posts', 'post'], ['comments', 'comment'], ['messages', 'message']] as const) {
    const rows = (await env.DB.prepare(`SELECT id, text, author_id FROM ${table} WHERE status='visible' AND created_at>? AND author_id NOT LIKE 'agent:%' LIMIT 200`).bind(since).all<{ id: string; text: string; author_id: string }>()).results;
    for (const r of rows) {
      scanned++;
      const v = analyze(r.text);
      const severe = v.filter((x) => ['1.1', '1.2', '1.3'].includes(x.rule) || x.rule.startsWith('4.'));
      if (!severe.length) continue;
      await env.DB.prepare(`UPDATE ${table} SET status='hidden' WHERE id=?`).bind(r.id).run();
      hidden++;
      await opsLog(env, 'mizan', 'moderation', `خفيت ${type === 'post' ? 'بوست' : type === 'comment' ? 'تعليق' : 'رسالة'} — ${severe.map((x) => `المادة ${x.rule}`).join('، ')}`, { type, id: r.id, author: r.author_id, rules: severe.map((x) => x.rule) }, 'warn');
    }
  }
  // Repeat offenders → owner decides on a long ban.
  const repeat = (await env.DB.prepare('SELECT user_id, COUNT(*) AS n, SUM(points) AS pts FROM penalties WHERE created_at>? GROUP BY user_id HAVING n>=4').bind(new Date(Date.now() - 7 * 86400_000).toISOString()).all<{ user_id: string; n: number; pts: number }>()).results;
  for (const u of repeat) await escalate(env, 'mizan', 'ban', `${u.user_id}:${cairoDay()}`, 'عضو مخالف أكتر من مرة', `العضو ${u.user_id} خد ${u.n} عقوبات (${u.pts} نقطة) في أسبوع. أحظره 30 يوم؟`, [{ id: 'ban30', ar: 'حظر 30 يوم' }, { id: 'warn', ar: 'إنذار أخير بس' }], 'ban30');
  return { ok: true, note: `فحصت ${scanned} وخفيت ${hidden}`, xp: 1 + hidden * 3 };
}

/** 🔭 Catalog health + recrawl requests. */
async function kashaf(env: Env): Promise<Result> {
  const meta = parseJ<{ recordedAt?: string; products?: number; pushedAt?: string }>((await env.DB.prepare("SELECT value FROM settings WHERE key='snapshot_meta'").first<{ value: string }>())?.value, {});
  const prev = parseJ<{ products?: number }>((await env.DB.prepare("SELECT value FROM settings WHERE key='kashaf_prev'").first<{ value: string }>())?.value, {});
  const ageH = meta.recordedAt ? (Date.now() - Date.parse(meta.recordedAt)) / 3600_000 : 999;
  const notes: string[] = [`${meta.products ?? 0} منتج، عمر الأسعار ${ageH.toFixed(1)} ساعة`];
  if (ageH > 30) {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('recrawl_requested',?)").bind(JSON.stringify({ at: nowIso(), reason: 'stale', ageH })).run();
    notes.push('طلبت إعادة سحب');
    await opsLog(env, 'kashaf', 'catalog', `الأسعار بقالها ${Math.round(ageH)} ساعة — طلبت إعادة سحب`, meta, 'warn');
    if (ageH > 72) await escalate(env, 'kashaf', 'stale', `stale:${cairoDay()}`, 'الأسعار قديمة', `آخر تحديث للأسعار من ${Math.round(ageH)} ساعة. السحب اليومي ممكن يكون واقف (رصيد أو عطل).`, [{ id: 'ack', ar: 'هشوفها' }]);
  }
  if (prev.products && meta.products && meta.products < prev.products * 0.7) {
    await escalate(env, 'kashaf', 'shrink', `shrink:${meta.recordedAt}`, 'عدد المنتجات نزل فجأة', `من ${prev.products} لـ ${meta.products}. ممكن متجر قفل الوصول أو السحب فشل جزئيًا.`, [{ id: 'ack', ar: 'تمام' }]);
  }
  const deadStores = (await env.DB.prepare("SELECT store, COUNT(*) AS n FROM products WHERE store IS NOT NULL GROUP BY store").all<{ store: string; n: number }>()).results;
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('kashaf_prev',?)").bind(JSON.stringify({ products: meta.products, stores: deadStores.length, at: nowIso() })).run();
  return { ok: true, note: notes.join(' · '), xp: 2 };
}

/** 📡 Pricing anomalies: impossible drops, fake discounts. Flags them in remote config. */
async function radar(env: Env): Promise<Result> {
  const rows = (await env.DB.prepare('SELECT id, title_ar, price, median30, min90, discount FROM products WHERE price IS NOT NULL').all<{ id: string; title_ar: string; price: number; median30: number | null; min90: number | null; discount: number | null }>()).results;
  const suspects: string[] = [];
  for (const r of rows) {
    const ref = r.median30 ?? r.min90;
    if ((ref && r.price < ref * 0.35) || (r.discount ?? 0) > 85 || r.price < 5) suspects.push(r.id);
  }
  const before = parseJ<string[]>((await env.DB.prepare("SELECT value FROM settings WHERE key='price_suspects'").first<{ value: string }>())?.value, []);
  const fresh = suspects.filter((s) => !before.includes(s));
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('price_suspects',?)").bind(JSON.stringify(suspects)).run();
  if (fresh.length) {
    await bustConfig(env);
    await opsLog(env, 'radar', 'pricing', `علّمت ${fresh.length} سعر غريب بـ «⚠️ اتأكد قبل ما تشتري»`, { ids: fresh.slice(0, 30) }, 'warn');
  }
  return { ok: true, note: `${suspects.length} سعر مشكوك من ${rows.length}`, xp: 1 + Math.min(10, fresh.length) };
}

/** 🏦 Receipt verification. Autonomy grows with rank; never approves below the bar. */
async function khazna(env: Env): Promise<Result> {
  const rank = await agentRank(env, 'khazna');
  const ri = rankIndex(rank.id);
  // Bar to auto-approve by rank: expert 0.9, legend 0.85; below expert → suggestion only.
  const bar = ri >= 4 ? 0.85 : ri >= 3 ? 0.9 : 2;
  const rows = (await env.DB.prepare("SELECT id, user_id, tier, amount, confidence, status, submitted_at, checks FROM payments WHERE status IN ('pending','provisional') AND submitted_at IS NOT NULL AND submitted_at < ? LIMIT 30").bind(new Date(Date.now() - 5 * 60_000).toISOString()).all<{ id: string; user_id: string; tier: string; amount: number; confidence: number | null; status: string; submitted_at: string; checks: string | null }>()).results;
  let approved = 0, asked = 0;
  for (const p of rows) {
    const c = Number(p.confidence ?? 0);
    const reasons = parseJ<{ reasons?: string[] }>(p.checks, {}).reasons ?? [];
    if (c >= bar) {
      await decidePayment(env, 'agent:khazna', p.id, 'approve', `اعتماد تلقائي — ثقة ${Math.round(c * 100)}% (رتبة ${rank.ar})`);
      approved++;
      await opsLog(env, 'khazna', 'payment', `✔ اعتمدت دفع ${p.amount} ج (${p.tier}) — ثقة ${Math.round(c * 100)}%`, { id: p.id }, 'ok');
    } else {
      const suggestion = c >= 0.75 ? 'approve' : c < 0.35 ? 'reject' : 'approve';
      const id = await escalate(env, 'khazna', 'payment', p.id, `إيصال ${p.amount} ج لباقة ${p.tier}`, `ثقة القراءة ${Math.round(c * 100)}%. ${reasons.slice(0, 3).join(' · ') || 'محتاج نظرة سريعة.'}\nاقتراحي: ${suggestion === 'approve' ? 'اعتماد ✔' : 'رفض ✖'}`, [{ id: 'approve', ar: 'اعتمد' }, { id: 'reject', ar: 'ارفض' }], suggestion);
      if (id) asked++;
    }
  }
  return { ok: true, note: `اعتمدت ${approved}، سألت في ${asked} (رتبتي ${rank.ar})`, xp: approved * 5 + 1 };
}

/** 🎨 Curation: deals of the day + a catchy headline (1 AI call, cached by day). */
async function monasseq(env: Env): Promise<Result> {
  const suspects = parseJ<string[]>((await env.DB.prepare("SELECT value FROM settings WHERE key='price_suspects'").first<{ value: string }>())?.value, []);
  const top = (await env.DB.prepare('SELECT id, title_ar, price, store, deal_score, discount FROM products WHERE price IS NOT NULL ORDER BY deal_score DESC LIMIT 20').all<{ id: string; title_ar: string; price: number; store: string | null; deal_score: number; discount: number | null }>()).results.filter((p) => !suspects.includes(p.id)).slice(0, 6);
  if (!top.length) return { ok: true, note: 'مفيش منتجات', xp: 0 };
  const day = cairoDay();
  const old = parseJ<{ day?: string; slot?: number }>((await env.DB.prepare("SELECT value FROM settings WHERE key='curated'").first<{ value: string }>())?.value, {});
  const slot = Math.floor(((new Date().getUTCHours() + 2) % 24) / 6);
  if (old.day === day && old.slot === slot) return { ok: true, note: 'اختيار اليوم موجود', xp: 0 };
  let headline = `🔥 ${top[0]!.title_ar.slice(0, 50)} بـ ${Math.round(top[0]!.price).toLocaleString('en-US')} ج — أحسن صفقة النهارده`;
  let ai = false;
  if (old.day !== day) {
    const out = await llm(env, 'curate', [
      { role: 'system', content: 'إنت محرر إشعارات لموقع عروض مصري اسمه صفقة. اكتب عنوان إشعار واحد قصير وجذاب بالعامية المصرية مع إيموجي واحد أو اتنين، أقل من 90 حرف، من غير مبالغة كاذبة ومن غير أرقام مش موجودة. لازم يذكر اسم المنتج الأول (مختصر) وسعره بالجنيه. رد بالعنوان بس.' },
      { role: 'user', content: top.slice(0, 3).map((p) => `${p.title_ar} — ${Math.round(p.price)} ج${p.store ? ` من ${p.store}` : ''}${p.discount ? ` (خصم ${Math.round(p.discount)}%)` : ''}`).join('\n') },
    ], 80, 0.8);
    if (out?.text) { headline = out.text.replace(/^["«]|["»]$/g, '').split('\n')[0]!.slice(0, 120); ai = true; }
  } else if (old && (old as { headline?: string }).headline) headline = (old as { headline: string }).headline;
  const curated = { day, slot, headline, ai, ids: top.map((p) => p.id), at: nowIso() };
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('curated',?)").bind(JSON.stringify(curated)).run();
  await bustConfig(env);
  await opsLog(env, 'monasseq', 'curation', `اخترت عروض اليوم: ${headline}`, curated, 'ok');
  return { ok: true, note: headline, xp: 3 };
}

export async function dailyStats(env: Env) {
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const n = async (sql: string, ...b: unknown[]) => Number((await env.DB.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0);
  return {
    users: await n('SELECT COUNT(*) AS n FROM users'),
    newUsers: await n('SELECT COUNT(*) AS n FROM users WHERE created_at>?', dayAgo),
    active: await n('SELECT COUNT(*) AS n FROM users WHERE last_seen>?', dayAgo),
    revenue: await n("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('approved','provisional') AND decided_at>? AND note IS NOT 'TEST'", dayAgo),
    payments: await n("SELECT COUNT(*) AS n FROM payments WHERE submitted_at>?", dayAgo),
    posts: await n('SELECT COUNT(*) AS n FROM posts WHERE created_at>?', dayAgo),
    messages: await n('SELECT COUNT(*) AS n FROM messages WHERE created_at>?', dayAgo),
    penalties: await n('SELECT COUNT(*) AS n FROM penalties WHERE created_at>?', dayAgo),
    incidents: await n("SELECT COUNT(*) AS n FROM ops_audit WHERE kind='incident' AND at>?", dayAgo),
    actions: await n("SELECT COUNT(*) AS n FROM ops_audit WHERE actor NOT LIKE '%@%' AND at>?", dayAgo),
    openEscalations: await n("SELECT COUNT(*) AS n FROM escalations WHERE status='open'"),
    products: await n('SELECT COUNT(*) AS n FROM products'),
    clientErrors: await n('SELECT COUNT(*) AS n FROM client_events WHERE at>?', Date.now() - 86400_000),
    aiLeft: await aiBudgetLeft(env),
  };
}

const LABELS: Record<string, string> = { users: 'إجمالي الأعضاء', newUsers: 'أعضاء جدد', active: 'أعضاء نشطين', revenue: 'الإيراد بالجنيه', payments: 'إيصالات اترفعت', posts: 'بوستات', messages: 'رسايل دردشة', penalties: 'عقوبات', incidents: 'أعطال اتحلت تلقائي', actions: 'إجراءات الوكلاء', openEscalations: 'قرارات مستنية المالك', products: 'منتجات في الكتالوج', clientErrors: 'أخطاء عند المستخدمين', aiLeft: 'مكالمات ذكاء اصطناعي باقية النهارده' };
const labeled = (s: Record<string, number>) => Object.entries(s).map(([k, v]) => `- ${LABELS[k] ?? k}: ${v}`).join('\n');

/** 📜 Daily self-report (AI-written when quota allows, template otherwise). */
export async function rawi(env: Env, force = false): Promise<Result> {
  const day = cairoDay();
  if (!force && (await env.DB.prepare('SELECT day FROM ops_reports WHERE day=?').bind(day).first())) return { ok: true, note: 'التقرير موجود', xp: 0 };
  const s = await dailyStats(env);
  const highlights = (await env.DB.prepare("SELECT actor, title FROM ops_audit WHERE at>? AND severity IN ('warn','crit','ok') ORDER BY id DESC LIMIT 15").bind(new Date(Date.now() - 86400_000).toISOString()).all<{ actor: string; title: string }>()).results;
  const template = [
    `📜 تقرير صفقة — ${day}`,
    `👥 ${s.users} عضو (+${s.newUsers} جديد، ${s.active} نشط النهارده)`,
    `💰 ${s.revenue} ج إيراد · ${s.payments} إيصال`,
    `💬 ${s.posts} بوست · ${s.messages} رسالة · ${s.penalties} عقوبة`,
    `🤖 الوكلاء عملوا ${s.actions} إجراء · ${s.incidents} عطل اتحل تلقائي`,
    `🛒 ${s.products} منتج في الكتالوج`,
    s.openEscalations ? `🔔 ${s.openEscalations} قرار مستنيك في Safqa Hub` : '✅ مفيش قرارات مستنياك',
  ].join('\n');
  let body = template, ai = false;
  const out = await llm(env, 'report', [
    { role: 'system', content: 'إنت «راوي»، وكيل التقارير في صفقة. اكتب تقرير يومي قصير للمالك بالعامية المصرية (6-9 سطور، إيموجي في أول كل سطر)، فيه الأرقام زي ما هي بالظبط، وأهم حاجة حصلت، وتوصية واحدة عملية. متخترعش أرقام.' },
    { role: 'user', content: `الأرقام (آخر 24 ساعة):\n${labeled(s)}\nأهم الأحداث:\n${highlights.map((h) => `- [${h.actor}] ${h.title}`).join('\n') || '- مفيش'}` },
  ], 450, 0.5);
  if (out?.text) { body = out.text.trim(); ai = true; }
  await env.DB.prepare('INSERT OR REPLACE INTO ops_reports (day,body,stats,ai,at) VALUES (?,?,?,?,?)').bind(day, body, JSON.stringify(s), ai ? 1 : 0, nowIso()).run();
  await opsLog(env, 'rawi', 'report', `التقرير اليومي جاهز (${day})`, { ai }, 'ok');
  await notifyOwner(env, body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!));
  return { ok: true, note: ai ? 'تقرير بالذكاء الاصطناعي' : 'تقرير بالقالب', xp: 2 };
}

export const RUNNERS: Record<string, (env: Env) => Promise<Result>> = { haris, mizan, kashaf, radar, khazna, monasseq, rawi: (e) => rawi(e) };

/** Lets another module (owner-tools) add agents to the crew: they get ranks, XP, the cron and the Hub controls for free. */
export function registerAgent(a: OpsAgent, run: (env: Env) => Promise<Result>, schedule?: (cairoMinute: number) => boolean) {
  if (!OPS_AGENTS.some((x) => x.id === a.id)) OPS_AGENTS.push(a);
  RUNNERS[a.id] = run;
  if (schedule) SCHEDULES[a.id] = schedule;
}
const SCHEDULES: Record<string, (cairoMinute: number) => boolean> = {};

/** Runs one agent and records its track record. */
export async function runAgent(env: Env, id: string, manual = false): Promise<Result & { id: string }> {
  const row = await agentRow(env, id);
  if (!row.enabled && !manual) return { id, ok: true, note: 'متوقف', xp: 0 };
  const t0 = Date.now();
  let r: Result;
  try { r = await RUNNERS[id]!(env); } catch (e) { r = { ok: false, note: String((e as Error).message ?? e).slice(0, 200), xp: -2 }; }
  await env.DB.prepare('UPDATE ops_agents SET runs=runs+1, ok=ok+?, failed=failed+?, last_run=?, last_note=? WHERE id=?').bind(r.ok ? 1 : 0, r.ok ? 0 : 1, nowIso(), `${r.note} (${Date.now() - t0}ms)`, id).run();
  if (r.xp) await grantOpsXp(env, id, r.xp);
  if (!r.ok) await opsLog(env, id, 'error', `الوكيل ${id} وقع: ${r.note}`, null, 'crit');
  return { id, ...r };
}

/** Called from the 10-minute cron. */
export async function autopilotTick(env: Env, when: Date) {
  const minuteOfDay = ((when.getUTCHours() + 2) % 24) * 60 + when.getUTCMinutes();
  const cairoH = Math.floor(minuteOfDay / 60);
  const out: unknown[] = [];
  for (const a of OPS_AGENTS) {
    if (a.id === 'rawi') { if (cairoH === 22 && when.getUTCMinutes() < 10) out.push(await runAgent(env, 'rawi')); continue; }
    if (SCHEDULES[a.id]) { if (SCHEDULES[a.id]!(minuteOfDay)) out.push(await runAgent(env, a.id)); continue; }
    if (a.every <= 10 || Math.floor(minuteOfDay / 10) % Math.round(a.every / 10) === 0) out.push(await runAgent(env, a.id));
  }
  return out;
}

/** Extra escalation kinds (owner-tools registers «owner_change»: one-tap apply of a proposed change). */
export const ESC_HANDLERS: Record<string, (env: Env, who: string, ref: string, decision: string) => Promise<unknown>> = {};

/** Owner answers an escalation in the Hub. Feeds the agent's XP (agreement = trust). */
export async function decideEscalation(env: Env, who: string, id: string, decision: string) {
  const e = await env.DB.prepare('SELECT * FROM escalations WHERE id=?').bind(id).first<{ id: string; kind: string; ref: string | null; agent_id: string; status: string; suggestion: string | null; options: string }>();
  if (!e) throw new Error('not found');
  if (e.status !== 'open') return { ok: true, already: true };
  const opts = parseJ<{ id: string }[]>(e.options, []);
  if (!opts.some((o) => o.id === decision)) throw new Error('bad decision');
  let effect: unknown = null;
  if (ESC_HANDLERS[e.kind] && e.ref) effect = await ESC_HANDLERS[e.kind]!(env, who, e.ref, decision);
  if (e.kind === 'payment' && e.ref && (decision === 'approve' || decision === 'reject')) effect = await decidePayment(env, who, e.ref, decision, `قرار المالك من Safqa Hub`);
  if (e.kind === 'rollback' && e.ref && decision === 'enable') { await setFlag(env, who, e.ref.split(':')[0]!, { enabled: true }); effect = 'enabled'; }
  if (e.kind === 'ban' && e.ref && decision === 'ban30') {
    const until = new Date(Date.now() + 30 * 86400_000).toISOString();
    await env.DB.prepare("INSERT INTO penalties (id,user_id,rules,action,until,points,reason,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(uid('pen_'), e.ref.split(':')[0], '["9.1"]', 'ban', until, 0, 'حظر 30 يوم بقرار المالك (تكرار المخالفات)', 'owner', nowIso()).run();
    effect = { until };
  }
  await env.DB.prepare("UPDATE escalations SET status='decided', decision=?, decided_at=?, decided_by=? WHERE id=?").bind(decision, nowIso(), who, id).run();
  if (e.suggestion) await grantOpsXp(env, e.agent_id, e.suggestion === decision ? 10 : -5, 'owner decision');
  await opsLog(env, who, 'decision', `المالك قرّر «${decision}» في: ${e.kind}`, { id, ref: e.ref, agreed: e.suggestion === decision }, 'info');
  return { ok: true, effect };
}

export async function agentsOut(env: Env) {
  const rows = new Map((await env.DB.prepare('SELECT * FROM ops_agents').all<Row>()).results.map((r) => [r.id, r]));
  return OPS_AGENTS.map((a) => {
    const r = rows.get(a.id) ?? ({ xp: 0, runs: 0, ok: 0, failed: 0, overridden: 0, enabled: 1, rank_override: null, last_run: null, last_note: null, auto: 1 } as Row);
    const rank = rankFor(r.xp, r.rank_override);
    const next = nextRank(r.xp);
    return { ...a, xp: r.xp, runs: r.runs, okRuns: r.ok, failed: r.failed, overridden: r.overridden, enabled: Boolean(r.enabled), auto: r.auto === undefined ? true : Boolean(r.auto), rank, rankOverride: r.rank_override, next: next ? { ...next, need: next.min - r.xp } : null, lastRun: r.last_run, lastNote: r.last_note };
  });
}
