// Owner-only toolkit for Safqa Hub (Google allow-list + paired devices only; nothing here is reachable by users).
// Six agents join the Autopilot crew (ranks/XP/cron/audit come from autopilot.ts):
//   🧞 أمين (command agent + change watch with auto-rollback)  🕵️ عين (competitor intel, public pages, robots.txt respected)
//   📈 نماء (growth & revenue advisor)  📣 حملة (campaign drafts + image; publishes only to Safqa's own surfaces)
//   🎯 صيّاد (deal hunter: verified hot deals → «صيد اليوم»)  🎙️ المدير (daily CEO brief, read aloud by the Hub)
// Autonomy: global flag «owner_autopilot» + per-agent «auto». Agents act alone only with whitelisted, reversible actions,
// under daily caps and rank gates; every change keeps a «before» snapshot and is watched for error spikes (auto-rollback).
// Money movement, bans, deletions and anything destructive are never automatic — they become escalations.
import * as AP from './autopilot';
import { aiBudgetLeft, extractJson, llm } from './ai';
import { robotsOk, UA } from './catalog/api';
import { enqueue, tgEnabled } from './telegram';
import { cairoDay, type Env, fail, nowIso, parseJ, rateLimit, str, uid } from './util';

type Ctx = { env: Env; req: Request; url: URL; p: string[] };
type On = (method: string, path: string, h: (c: any) => unknown) => void;
type Deps = { needAdmin: (c: any) => Promise<string>; body: (c: any) => Promise<any> };

// ------------------------------------------------------------------ actions (whitelist)
export type Action =
  | { t: 'flag'; key: string; enabled?: boolean; rollout?: number }
  | { t: 'banner'; ar: string; level?: 'info' | 'deal' | 'warn'; on: boolean }
  | { t: 'code'; code: string; active: boolean }
  | { t: 'agent'; id: string; enabled?: boolean; auto?: boolean }
  | { t: 'announce'; title: string; body?: string; level?: 'info' | 'deal' | 'warn' }
  | { t: 'featured'; items: Featured[] }
  | { t: 'run'; id: string };
type Featured = { id: string; title: string; image: string | null; price: number; old: number; pct: number; store: string | null; url: string | null; why: string };

const FLAG_WORDS: [RegExp, string, string][] = [
  [/أصوات|اصوات|صوت الضغط|asmr/i, 'ui_sounds', 'أصوات الواجهة'], [/حركة|أنيميشن|انيميشن|motion/i, 'premium_motion', 'الحركة الفخمة'],
  [/الجديد|what'?s ?new/i, 'whats_new', 'شاشة الجديد'], [/الذكاء (ال)?أوفلاين|الذكاء الاوفلاين|offline/i, 'offline_ai', 'الذكاء الأوفلاين'],
  [/webllm|الشات الأوفلاين|النموذج/i, 'webllm', 'نموذج اللغة الأوفلاين'], [/عدسة|باركود|lens/i, 'price_lens', 'عدسة الأسعار'],
  [/المساعد الصوتي|كلم صفقة|كلّم صفقة|voice/i, 'voice_assistant', 'المساعد الصوتي'], [/آلة الزمن|الة الزمن|time machine/i, 'time_machine', 'آلة الزمن'],
  [/كرة العروض|الكرة|globe/i, 'deal_globe', 'كرة العروض'], [/المجتمع|لايف|الدردشة|community/i, 'live_community', 'المجتمع'],
  [/صيد اليوم|العروض المختارة|featured/i, 'featured_deals', 'صيد اليوم'], [/تيليجرام التلقائي|نشر تيليجرام/i, 'campaign_telegram', 'نشر الحملات على تيليجرام'],
  [/الطيار الآلي|الأوتوبايلوت|autopilot/i, 'owner_autopilot', 'الطيار الآلي'],
];
const OFF = /(وق[ّ]?ف|اوقف|أوقف|اقفل|إقفل|اطفي|اطفى|عط[ّ]?ل|شيل|الغي|ألغي|pause|stop|disable|off)/i;
const ON = /(شغ[ّ]?ل|افتح|فع[ّ]?ل|رج[ّ]?ع|enable|resume|turn on|\bon\b)/i;
const BLOCKED = /(فلوس|استرد|استرجاع|refund|حو[ّ]?ل|تحويل|اعتمد الدفع|وافق على الدفع|احظر|حظر|ban|امسح|احذف|delete|شيل العضو|امسح العضو)/i;

const TIER_WORDS: [RegExp, string][] = [[/ذهب|gold/i, 'gold'], [/فض[ّ]?|silver/i, 'silver'], [/ماس|diamond/i, 'diamond']];

function quoted(t: string) { return t.match(/[«"“](.+?)[»"”]/)?.[1]?.trim() ?? (t.split(/[:：]/).slice(1).join(':').trim() || null); }

/** Fast, offline intent parser for common commands; AI handles the rest. */
export async function parseCommand(env: Env, text: string): Promise<{ actions: Action[]; say: string; blocked?: string }> {
  const t = text.trim();
  if (BLOCKED.test(t)) return { actions: [], say: '', blocked: 'ده فيه فلوس أو حظر أو مسح — مش بنفّذه بأمر سريع. اعمله بنفسك من صفحة المدفوعات أو الإشراف (وهيتسجل في السجل).' };
  const actions: Action[] = [];
  const off = OFF.test(t) && !/(شغ[ّ]?ل|فع[ّ]?ل)/.test(t), on = ON.test(t) && !off;
  if (/(بانر|بنر|شريط|banner|إعلان فوق|اعلان فوق)/i.test(t)) {
    if (off) actions.push({ t: 'banner', ar: '', on: false });
    else {
      let ar = quoted(t);
      if (!ar && /رمضان/.test(t)) ar = 'رمضان كريم 🌙 عروض رمضان الحقيقية على صفقة — من غير خصومات مضروبة';
      if (!ar && /(جمعة|بلاك|black)/i.test(t)) ar = 'الجمعة البيضا 🔥 صفقة بتفرز لك الخصم الحقيقي من الوهمي';
      if (!ar && /(عيد)/.test(t)) ar = 'كل سنة وإنت طيب 🎉 عروض العيد المتأكد منها على صفقة';
      if (ar) actions.push({ t: 'banner', ar: ar.slice(0, 140), level: /(عرض|خصم|جمعة|رمضان|عيد|deal)/i.test(t) ? 'deal' : 'info', on: true });
    }
  }
  if (/(كود|كوبون|برومو|promo|العرض|الخصم)/i.test(t) && (off || on)) {
    const named = t.match(/\b([A-Z0-9][A-Z0-9_-]{2,30})\b/)?.[1];
    if (named) actions.push({ t: 'code', code: named.toUpperCase(), active: !off });
    else {
      const tier = TIER_WORDS.find(([re]) => re.test(t))?.[1];
      if (tier) {
        const rows = (await env.DB.prepare("SELECT code FROM codes WHERE active=? AND tiers LIKE ? LIMIT 20").bind(off ? 1 : 0, `%${tier}%`).all<{ code: string }>()).results;
        for (const r of rows) actions.push({ t: 'code', code: r.code, active: !off });
      }
    }
  }
  if (!actions.some((a) => a.t === 'banner')) for (const [re, key] of FLAG_WORDS) if (re.test(t) && (on || off)) {
    const roll = t.match(/(\d{1,3})\s*[%٪]/)?.[1];
    actions.push({ t: 'flag', key, enabled: !off, ...(roll ? { rollout: Math.min(100, Number(roll)) } : {}) });
  }
  for (const a of AP.OPS_AGENTS) if (t.includes(a.name) && (on || off || /شغ[ّ]?له دلوقتي|run/.test(t))) {
    if (/(دلوقتي|حالا|حالًا|now|run)/i.test(t) && !off) actions.push({ t: 'run', id: a.id });
    else actions.push({ t: 'agent', id: a.id, enabled: !off });
  }
  if (actions.length) return { actions, say: 'فهمتك 👌 دي الخطة — راجعها واضغط تنفيذ.' };
  return aiCommand(env, t);
}

async function aiCommand(env: Env, text: string): Promise<{ actions: Action[]; say: string; blocked?: string }> {
  const flags = (await env.DB.prepare('SELECT key, enabled, description FROM flags').all<{ key: string; enabled: number; description: string }>()).results;
  const codes = (await env.DB.prepare('SELECT code, tiers, active FROM codes ORDER BY created_at DESC LIMIT 15').all<{ code: string; tiers: string; active: number }>()).results;
  const out = await llm(env, 'ops', [
    { role: 'system', content: `إنت «أمين»، وكيل أوامر المالك في Safqa Hub. حوّل طلب المالك (بالمصري) لخطة JSON بس، من غير أي كلام بره الـJSON.
الأفعال المسموحة فقط:
{"t":"flag","key":KEY,"enabled":bool,"rollout":0-100?}
{"t":"banner","ar":"نص قصير بالمصري","level":"info|deal|warn","on":bool}
{"t":"code","code":CODE,"active":bool}
{"t":"agent","id":AGENT,"enabled":bool?,"auto":bool?}
{"t":"announce","title":"...","body":"...","level":"info|deal|warn"}
{"t":"run","id":AGENT}
ممنوع: أي فلوس/استرداد/اعتماد دفع/حظر/مسح. لو الطلب كده رجّع {"blocked":"السبب"}.
الشكل: {"say":"جملة قصيرة للمالك","actions":[...]}
المزايا: ${flags.map((f) => `${f.key}(${f.enabled ? 'on' : 'off'}: ${f.description ?? ''})`).join(' | ')}
الأكواد: ${codes.map((c) => `${c.code}${c.active ? '' : '(off)'} ${c.tiers}`).join(' | ') || 'مفيش'}
الوكلاء: ${AP.OPS_AGENTS.map((a) => `${a.id}=${a.name}`).join(' | ')}` },
    { role: 'user', content: text.slice(0, 600) },
  ], 400, 0.1);
  const j = out ? extractJson<{ say?: string; actions?: unknown[]; blocked?: string }>(out.text) : null;
  if (!j) return { actions: [], say: out ? 'مفهمتش الطلب ده — جرّب تقوله بشكل أوضح (مثلاً: «حط بانر رمضان» أو «وقّف عدسة الأسعار»).' : 'الذكاء الاصطناعي مش متاح دلوقتي — جرّب أمر مباشر زي «وقّف الأصوات» أو «حط بانر: نص».' };
  if (j.blocked) return { actions: [], say: '', blocked: String(j.blocked).slice(0, 200) };
  return { actions: (j.actions ?? []).map(validAction).filter(Boolean) as Action[], say: str(j.say, 200) || 'دي الخطة 👇' };
}

export function validAction(a: any): Action | null {
  if (!a || typeof a !== 'object') return null;
  const lvl = ['info', 'deal', 'warn'].includes(a.level) ? a.level : 'info';
  switch (a.t) {
    case 'flag': return /^[a-z0-9_]{2,40}$/.test(a.key) ? { t: 'flag', key: a.key, ...(typeof a.enabled === 'boolean' ? { enabled: a.enabled } : {}), ...(Number.isFinite(a.rollout) ? { rollout: Math.max(0, Math.min(100, Math.round(a.rollout))) } : {}) } : null;
    case 'banner': return { t: 'banner', ar: str(a.ar, 140), level: lvl, on: a.on !== false };
    case 'code': return /^[A-Za-z0-9_-]{3,32}$/.test(a.code ?? '') ? { t: 'code', code: String(a.code).toUpperCase(), active: Boolean(a.active) } : null;
    case 'agent': return AP.OPS_AGENTS.some((x) => x.id === a.id) ? { t: 'agent', id: a.id, ...(typeof a.enabled === 'boolean' ? { enabled: a.enabled } : {}), ...(typeof a.auto === 'boolean' ? { auto: a.auto } : {}) } : null;
    case 'announce': return str(a.title, 120) ? { t: 'announce', title: str(a.title, 120), body: str(a.body, 600), level: lvl } : null;
    case 'run': return AP.OPS_AGENTS.some((x) => x.id === a.id) ? { t: 'run', id: a.id } : null;
    default: return null;
  }
}

/** Human-readable before → after for the preview card. */
async function preview(env: Env, a: Action) {
  const flag = async (k: string) => env.DB.prepare('SELECT enabled, rollout, value FROM flags WHERE key=?').bind(k).first<{ enabled: number; rollout: number; value: string | null }>();
  switch (a.t) {
    case 'flag': { const f = await flag(a.key); const lbl = FLAG_WORDS.find((x) => x[1] === a.key)?.[2] ?? a.key; return { label: `🎛️ ${lbl}`, before: f ? `${f.enabled ? 'شغالة' : 'مقفولة'} · ${f.rollout}%` : 'مش موجودة', after: `${a.enabled === undefined ? (f?.enabled ? 'شغالة' : 'مقفولة') : a.enabled ? 'شغالة' : 'مقفولة'}${a.rollout !== undefined ? ` · ${a.rollout}%` : ''}`, exists: Boolean(f) }; }
    case 'banner': { const f = await flag('banner'); const v = parseJ<{ ar?: string }>(f?.value, {}); return { label: '📣 شريط فوق الموقع والتطبيق', before: f?.enabled && v.ar ? `«${v.ar}»` : 'مفيش شريط', after: a.on ? `«${a.ar}»` : 'من غير شريط', exists: true }; }
    case 'code': { const c = await env.DB.prepare('SELECT active, tiers, value, kind FROM codes WHERE code=?').bind(a.code).first<{ active: number; tiers: string; value: number; kind: string }>(); return { label: `🎟️ كود ${a.code}`, before: c ? (c.active ? 'شغال' : 'متوقف') : 'مش موجود', after: c ? (a.active ? 'شغال' : 'متوقف') : '—', exists: Boolean(c) }; }
    case 'agent': { const ag = AP.OPS_AGENTS.find((x) => x.id === a.id)!; return { label: `${ag.emoji} الوكيل ${ag.name}`, before: '', after: [a.enabled !== undefined ? (a.enabled ? 'يشتغل' : 'يتوقف') : '', a.auto !== undefined ? (a.auto ? 'ينفّذ لوحده' : 'يقترح بس') : ''].filter(Boolean).join(' · '), exists: true }; }
    case 'announce': return { label: '📰 إعلان داخل الموقع', before: '', after: a.title, exists: true };
    case 'featured': return { label: '🎯 صيد اليوم', before: '', after: `${a.items.length} عرض متأكد منه`, exists: true };
    case 'run': { const ag = AP.OPS_AGENTS.find((x) => x.id === a.id)!; return { label: `▶ تشغيل ${ag.emoji} ${ag.name} دلوقتي`, before: '', after: 'تشغيلة واحدة', exists: true }; }
  }
}

async function snapshot(env: Env, a: Action): Promise<unknown> {
  if (a.t === 'flag' || a.t === 'banner' || a.t === 'featured') return env.DB.prepare('SELECT key, enabled, rollout, value FROM flags WHERE key=?').bind(a.t === 'flag' ? a.key : a.t === 'banner' ? 'banner' : 'featured_deals').first();
  if (a.t === 'code') return env.DB.prepare('SELECT code, active FROM codes WHERE code=?').bind(a.code).first();
  if (a.t === 'agent') return env.DB.prepare('SELECT id, enabled, auto FROM ops_agents WHERE id=?').bind(a.id).first();
  return null;
}

async function execute(env: Env, who: string, a: Action): Promise<unknown> {
  switch (a.t) {
    case 'flag': await AP.setFlag(env, who, a.key, { ...(a.enabled !== undefined ? { enabled: a.enabled } : {}), ...(a.rollout !== undefined ? { rollout: a.rollout } : {}) }); return null;
    case 'banner': await AP.setFlag(env, who, 'banner', a.on ? { enabled: true, value: { ar: a.ar, level: a.level ?? 'info' } } : { enabled: false }); return null;
    case 'code': await env.DB.prepare('UPDATE codes SET active=? WHERE code=?').bind(a.active ? 1 : 0, a.code).run(); return null;
    case 'agent':
      await env.DB.prepare('INSERT OR IGNORE INTO ops_agents (id) VALUES (?)').bind(a.id).run();
      if (a.enabled !== undefined) await env.DB.prepare('UPDATE ops_agents SET enabled=? WHERE id=?').bind(a.enabled ? 1 : 0, a.id).run();
      if (a.auto !== undefined) await env.DB.prepare('UPDATE ops_agents SET auto=? WHERE id=?').bind(a.auto ? 1 : 0, a.id).run();
      return null;
    case 'announce': { const id = uid('ann_'); await env.DB.prepare('INSERT INTO announcements (id,title,body,level,active,created_at) VALUES (?,?,?,?,1,?)').bind(id, a.title, a.body ?? '', a.level ?? 'info', nowIso()).run(); return { announcement: id }; }
    case 'featured': await AP.setFlag(env, who, 'featured_deals', { enabled: true, value: { at: nowIso(), items: a.items } }); return null;
    case 'run': { const r = await AP.runAgent(env, a.id, true); return { note: r.note }; }
  }
}

async function restore(env: Env, a: Action, before: any, extra: any) {
  if ((a.t === 'flag' || a.t === 'banner' || a.t === 'featured') && before) {
    await env.DB.prepare('UPDATE flags SET enabled=?, rollout=?, value=?, updated_at=?, updated_by=? WHERE key=?').bind(before.enabled, before.rollout, before.value, nowIso(), 'rollback', before.key).run();
    await AP.setFlag(env, 'rollback', before.key, {}); // busts the config cache
  } else if ((a.t === 'flag' || a.t === 'banner' || a.t === 'featured') && !before) await AP.setFlag(env, 'rollback', a.t === 'flag' ? a.key : a.t === 'banner' ? 'banner' : 'featured_deals', { enabled: false });
  if (a.t === 'code' && before) await env.DB.prepare('UPDATE codes SET active=? WHERE code=?').bind(before.active, before.code).run();
  if (a.t === 'agent' && before) await env.DB.prepare('UPDATE ops_agents SET enabled=?, auto=? WHERE id=?').bind(before.enabled, before.auto ?? 1, before.id).run();
  if (a.t === 'announce' && extra?.announcement) await env.DB.prepare('UPDATE announcements SET active=0 WHERE id=?').bind(extra.announcement).run();
}

const errRate = async (env: Env, fromMs: number, toMs: number) => Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM client_events WHERE at>=? AND at<?').bind(fromMs, toMs).first<{ n: number }>())?.n ?? 0) / Math.max(1, (toMs - fromMs) / 60_000);

export async function proposeChange(env: Env, actor: string, source: 'command' | 'auto', title: string, actions: Action[], prompt?: string) {
  const id = uid('chg_');
  const previews = await Promise.all(actions.map((a) => preview(env, a)));
  await env.DB.prepare('INSERT INTO owner_changes (id,at,actor,source,title,prompt,actions,status) VALUES (?,?,?,?,?,?,?,?)').bind(id, nowIso(), actor, source, title.slice(0, 200), prompt?.slice(0, 600) ?? null, JSON.stringify(actions), 'previewed').run();
  return { id, previews };
}

export async function applyChange(env: Env, who: string, id: string) {
  const c = await env.DB.prepare('SELECT * FROM owner_changes WHERE id=?').bind(id).first<{ id: string; actions: string; status: string; title: string; source: string }>();
  if (!c) fail(404, 'not_found', 'التغيير مش موجود');
  if (c!.status !== 'previewed') return { ok: true, already: c!.status };
  const actions = parseJ<Action[]>(c!.actions, []);
  const before: unknown[] = [], extra: unknown[] = [];
  for (const a of actions) { before.push(await snapshot(env, a)); extra.push(await execute(env, who, a)); }
  const now = Date.now();
  const baseline = await errRate(env, now - 3600_000, now);
  await env.DB.prepare("UPDATE owner_changes SET status='applied', before=?, baseline_err=?, applied_at=?, note=? WHERE id=?").bind(JSON.stringify({ before, extra }), baseline, nowIso(), JSON.stringify(extra.filter(Boolean)).slice(0, 500), id).run();
  await AP.opsLog(env, who, 'change', `${c!.source === 'auto' ? '🤖 تلقائي' : '🧞 أمر'}: ${c!.title}`, { id, actions }, 'ok');
  return { ok: true, id, results: extra };
}

export async function rollbackChange(env: Env, who: string, id: string, why = 'بطلب المالك') {
  const c = await env.DB.prepare('SELECT * FROM owner_changes WHERE id=?').bind(id).first<{ actions: string; before: string; status: string; title: string }>();
  if (!c) fail(404, 'not_found', 'التغيير مش موجود');
  if (c!.status !== 'applied') return { ok: true, already: c!.status };
  const actions = parseJ<Action[]>(c!.actions, []);
  const snap = parseJ<{ before: unknown[]; extra: unknown[] }>(c!.before, { before: [], extra: [] });
  for (let i = actions.length - 1; i >= 0; i--) await restore(env, actions[i]!, snap.before[i], snap.extra[i]);
  await env.DB.prepare("UPDATE owner_changes SET status='rolled_back', rolled_at=?, note=? WHERE id=?").bind(nowIso(), why.slice(0, 200), id).run();
  await AP.opsLog(env, who, 'rollback', `↩️ رجوع: ${c!.title} (${why})`, { id }, 'warn');
  return { ok: true };
}

// ------------------------------------------------------------------ autonomy guardrails
const AUTO_RULES: Record<string, { cap: number; minRank: string; kinds: Action['t'][] }> = {
  sayyad: { cap: 24, minRank: 'trainee', kinds: ['featured'] },
  hamla: { cap: 2, minRank: 'trainee', kinds: ['banner'] },
  numuw: { cap: 3, minRank: 'assistant', kinds: ['flag', 'banner'] },
  amin: { cap: 10, minRank: 'trainee', kinds: [] },
};
const NEVER_AUTO_FLAGS = new Set(['owner_autopilot', 'campaign_telegram']);

export async function autopilotOn(env: Env) { return Boolean((await env.DB.prepare("SELECT enabled FROM flags WHERE key='owner_autopilot'").first<{ enabled: number }>())?.enabled); }

/** An agent wants to act. Applies it (whitelisted, capped, rank-gated, reversible) or turns it into a one-tap escalation. */
export async function autoAct(env: Env, agentId: string, title: string, actions: Action[], why: string) {
  const rule = AUTO_RULES[agentId];
  const ag = (await AP.agentsOut(env)).find((a) => a.id === agentId);
  const okKinds = rule && actions.every((a) => rule.kinds.includes(a.t) && !(a.t === 'flag' && NEVER_AUTO_FLAGS.has(a.key)));
  const rankOk = rule && ag && AP.rankIndex(ag.rank.id) >= AP.rankIndex(rule.minRank);
  const capKey = `auto:${agentId}:${cairoDay()}`;
  const used = Number((await env.KV.get(capKey)) ?? 0);
  const allowed = okKinds && rankOk && ag?.auto !== false && ag?.enabled && used < (rule?.cap ?? 0) && (await autopilotOn(env));
  const { id } = await proposeChange(env, agentId, 'auto', title, actions, why);
  if (allowed) {
    await env.KV.put(capKey, String(used + 1), { expirationTtl: 2 * 86400 });
    await applyChange(env, agentId, id);
    return { applied: true, id };
  }
  const reason = !okKinds ? 'نوع الإجراء محتاج موافقتك' : !rankOk ? `رتبة الوكيل لسه أقل من ${rule?.minRank}` : used >= (rule?.cap ?? 0) ? 'وصل للحد اليومي' : 'الطيار الآلي مقفول';
  await AP.escalate(env, agentId, 'owner_change', id, title, `${why}\n\nمش اتنفذ تلقائي: ${reason}.`, [{ id: 'apply', ar: '✅ نفّذ' }, { id: 'skip', ar: 'تجاهل' }], 'apply');
  return { applied: false, id, reason };
}
AP.ESC_HANDLERS.owner_change = async (env, who, ref, decision) => (decision === 'apply' ? applyChange(env, who, ref) : env.DB.prepare("UPDATE owner_changes SET status='skipped' WHERE id=? AND status='previewed'").bind(ref).run().then(() => 'skipped'));

// ------------------------------------------------------------------ documents
async function saveDoc(env: Env, kind: string, title: string, body: string, data: unknown, ai: boolean) {
  const id = uid(`${kind}_`);
  await env.DB.prepare('INSERT INTO owner_docs (id,kind,day,title,body,data,ai,at) VALUES (?,?,?,?,?,?,?,?)').bind(id, kind, cairoDay(), title.slice(0, 200), body.slice(0, 6000), JSON.stringify(data ?? null).slice(0, 200_000), ai ? 1 : 0, nowIso()).run();
  await env.DB.prepare('DELETE FROM owner_docs WHERE kind=? AND id NOT IN (SELECT id FROM owner_docs WHERE kind=? ORDER BY at DESC LIMIT 40)').bind(kind, kind).run();
  return id;
}
const latestDoc = (env: Env, kind: string) => env.DB.prepare('SELECT * FROM owner_docs WHERE kind=? ORDER BY at DESC LIMIT 1').bind(kind).first<any>().then((d) => (d ? { ...d, data: parseJ(d.data, null) } : null));

// ------------------------------------------------------------------ 🧞 أمين: change watch (auto-rollback on bad metrics)
async function amin(env: Env): Promise<AP.Result> {
  const since = new Date(Date.now() - 90 * 60_000).toISOString();
  const rows = (await env.DB.prepare("SELECT id, title, applied_at, baseline_err FROM owner_changes WHERE status='applied' AND applied_at>?").bind(since).all<{ id: string; title: string; applied_at: string; baseline_err: number }>()).results;
  let rolled = 0;
  for (const r of rows) {
    const from = Date.parse(r.applied_at), now = Date.now();
    if (now - from < 5 * 60_000) continue;
    const n = Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM client_events WHERE at>=?').bind(from).first<{ n: number }>())?.n ?? 0);
    const rate = n / Math.max(1, (now - from) / 60_000);
    if (n >= 10 && rate > (r.baseline_err ?? 0) * 3 + 0.2) {
      await rollbackChange(env, 'amin', r.id, `الأخطاء زادت بعد التغيير (${n} خطأ، ${rate.toFixed(2)}/د مقابل ${(r.baseline_err ?? 0).toFixed(2)}/د قبله)`);
      await AP.notifyOwner(env, `↩️ <b>رجّعت تغيير تلقائيًا</b>\n${r.title.replace(/[<>&]/g, '')}\nالأخطاء زادت بعده.`);
      rolled++;
    }
  }
  return { ok: true, note: rows.length ? `براقب ${rows.length} تغيير${rolled ? ` · رجّعت ${rolled}` : ''}` : 'مفيش تغييرات تحت المراقبة', xp: rows.length ? 1 : 0 };
}

// ------------------------------------------------------------------ 🕵️ عين: competitor intelligence (public pages only)
const DEFAULT_TARGETS = [
  { name: 'Yaoota', url: 'https://yaoota.com/ar-eg/' },
  { name: 'Jumia عروض', url: 'https://www.jumia.com.eg/ar/flash-sales/' },
  { name: 'noon مصر', url: 'https://www.noon.com/egypt-ar/' },
  { name: 'Amazon.eg عروض', url: 'https://www.amazon.eg/-/ar/deals' },
  { name: 'B.TECH', url: 'https://btech.com/ar/' },
  { name: '2B', url: 'https://2b.com.eg/ar/' },
];
const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
export function pageSignals(html: string) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 160);
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? '').slice(0, 300);
  const heads = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => strip(m[1]!)).filter((x) => x.length > 2 && x.length < 120);
  const promo = [...new Set([...strip(html).matchAll(/[^.!؟\n]{0,60}(خصم|عرض|تخفيض|كوبون|الجمعة البيضاء|رمضان|sale|offer|discount|coupon|black friday|%\s*off)[^.!؟\n]{0,60}/gi)].map((m) => m[0]!.trim()))].slice(0, 25);
  return { title, desc, heads: [...new Set(heads)].slice(0, 40), promo };
}
async function ain(env: Env): Promise<AP.Result> {
  const targets = parseJ<{ name: string; url: string }[]>((await env.DB.prepare("SELECT value FROM flags WHERE key='intel_targets'").first<{ value: string }>())?.value, DEFAULT_TARGETS);
  const sites: any[] = [];
  for (const t of targets.slice(0, 10)) {
    const u = new URL(t.url);
    if (!(await robotsOk(env, u))) { sites.push({ ...t, status: 'robots', note: 'robots.txt مانع — مش بنقرا' }); continue; }
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r?.ok) { sites.push({ ...t, status: r ? `http ${r.status}` : 'timeout' }); continue; }
    const sig = pageSignals((await r.text()).slice(0, 600_000));
    const prev = await env.KV.get<{ heads: string[]; promo: string[] }>(`intel:${u.host}`, 'json');
    const added = prev ? { heads: sig.heads.filter((h) => !prev.heads.includes(h)), promo: sig.promo.filter((p) => !prev.promo.includes(p)) } : null;
    await env.KV.put(`intel:${u.host}`, JSON.stringify(sig), { expirationTtl: 30 * 86400 });
    sites.push({ ...t, status: 'ok', ...sig, added, first: !prev });
  }
  const changed = sites.filter((s) => s.added && (s.added.heads.length || s.added.promo.length));
  let body = sites.map((s) => `• ${s.name}: ${s.status === 'ok' ? (s.first ? `أول قراءة — ${s.promo.length} رسالة عروض` : s.added?.heads.length || s.added?.promo.length ? `جديد: ${[...(s.added.promo ?? []), ...(s.added.heads ?? [])].slice(0, 3).join(' / ')}` : 'مفيش جديد') : s.note ?? s.status}`).join('\n');
  let ai = false;
  if (changed.length || sites.every((s) => s.first)) {
    const out = await llm(env, 'intel', [
      { role: 'system', content: 'إنت «عين»، محلل منافسين لموقع صفقة (مقارنة أسعار مصري). من إشارات الصفحات العامة دي، اكتب ملخص قصير بالمصري (5-8 نقاط): مين بيعمل إيه (حملات، أقسام، خصومات)، وإيه اللي صفقة تعمله ردًا عليه (فكرة أو اتنين عملية). ما تخترعش أرقام مش موجودة.' },
      { role: 'user', content: JSON.stringify(sites.filter((s) => s.status === 'ok').map((s) => ({ site: s.name, title: s.title, new: s.added, promo: s.promo.slice(0, 8), heads: s.heads.slice(0, 10) }))).slice(0, 6000) },
    ], 500, 0.4);
    if (out?.text) { body = out.text.trim(); ai = true; }
  }
  await saveDoc(env, 'intel', `تقرير المنافسين — ${cairoDay()}`, body, { sites: sites.map(({ heads, ...s }) => ({ ...s, heads: heads?.slice(0, 12) })) }, ai);
  await AP.opsLog(env, 'ain', 'intel', `قريت ${sites.filter((s) => s.status === 'ok').length}/${sites.length} موقع منافس · ${changed.length} فيهم جديد`, null, changed.length ? 'warn' : 'info');
  return { ok: true, note: `${sites.filter((s) => s.status === 'ok').length}/${sites.length} موقع · ${changed.length} اتغيّر`, xp: 2 };
}

// ------------------------------------------------------------------ 📈 نماء: growth & revenue advisor
export async function growthMetrics(env: Env) {
  const q = async (sql: string, ...b: unknown[]) => { try { return Number((await env.DB.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0); } catch { return 0; } };
  const d = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
  const daily = (await env.DB.prepare("SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM users WHERE created_at>? GROUP BY day ORDER BY day").bind(d(14)).all<{ day: string; n: number }>()).results;
  const topViewed = (await env.DB.prepare('SELECT title_ar AS t, title, views, heat, category FROM catalog ORDER BY views DESC LIMIT 8').all<any>().catch(() => ({ results: [] as any[] }))).results.map((r: any) => ({ title: r.t || r.title, views: r.views, category: r.category }));
  const cats = (await env.DB.prepare('SELECT category, SUM(views) AS v, COUNT(*) AS n FROM catalog GROUP BY category ORDER BY v DESC LIMIT 8').all<any>().catch(() => ({ results: [] as any[] }))).results;
  return {
    users: await q('SELECT COUNT(*) AS n FROM users'),
    new7: await q('SELECT COUNT(*) AS n FROM users WHERE created_at>?', d(7)), newPrev7: await q('SELECT COUNT(*) AS n FROM users WHERE created_at>? AND created_at<=?', d(14), d(7)),
    active7: await q('SELECT COUNT(*) AS n FROM users WHERE last_seen>?', d(7)),
    paid: await q("SELECT COUNT(*) AS n FROM users WHERE tier!='free' AND tier_until>?", nowIso()),
    revenue30: await q("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('approved','provisional') AND created_at>? AND note IS NOT 'TEST'", d(30)),
    revenuePrev30: await q("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status IN ('approved','provisional') AND created_at>? AND created_at<=? AND note IS NOT 'TEST'", d(60), d(30)),
    checkoutsStarted30: await q('SELECT COUNT(*) AS n FROM payments WHERE created_at>?', d(30)), checkoutsPaid30: await q("SELECT COUNT(*) AS n FROM payments WHERE created_at>? AND status IN ('approved','provisional')", d(30)),
    watchlist: await q('SELECT COUNT(*) AS n FROM watchlist'), telegram: await q('SELECT COUNT(*) AS n FROM tg_links WHERE subscribed=1'),
    votes7: await q('SELECT COUNT(*) AS n FROM votes WHERE at>?', d(7)), submissions7: await q('SELECT COUNT(*) AS n FROM submissions WHERE created_at>?', d(7)),
    products: await q('SELECT COUNT(*) AS n FROM catalog'), errors7: await q('SELECT COUNT(*) AS n FROM client_events WHERE at>?', Date.now() - 7 * 86400_000),
    activeCodes: await q('SELECT COUNT(*) AS n FROM codes WHERE active=1'),
    daily, topViewed, cats,
  };
}
async function numuw(env: Env): Promise<AP.Result> {
  const m = await growthMetrics(env);
  const pct = (a: number, b: number) => (b ? `${Math.round(((a - b) / b) * 100)}%` : a ? 'جديد' : '0');
  let body = [`👥 ${m.users} عضو · +${m.new7} الأسبوع ده (${pct(m.new7, m.newPrev7)} عن اللي قبله) · ${m.active7} نشط`, `💎 ${m.paid} مشترك مدفوع · إيراد 30 يوم ${m.revenue30} ج (${pct(m.revenue30, m.revenuePrev30)})`, `🧾 ${m.checkoutsStarted30} بدأوا دفع · ${m.checkoutsPaid30} كمّلوا`, `🔔 ${m.watchlist} مراقبة · ${m.telegram} على تيليجرام`].join('\n');
  let ideas: { title: string; why: string; action?: Action }[] = [];
  let ai = false;
  const out = await llm(env, 'growth', [
    { role: 'system', content: `إنت «نماء»، مستشار النمو والإيراد لصفقة (موقع مقارنة أسعار مصري، باقات مدفوعة بإنستاباي). من الأرقام الحقيقية دي اكتب JSON بس:
{"summary":"3-5 سطور بالمصري: إيه اللي ماشي كويس وإيه اللي محتاج شغل، بالأرقام","ideas":[{"title":"فكرة عملية قصيرة","why":"ليه، من الأرقام","action":null أو {"t":"banner","ar":"...","level":"deal","on":true} أو {"t":"flag","key":"...","enabled":true}}]}
3-5 أفكار. ما تخترعش أرقام. الإجراءات تكون آمنة وقابلة للرجوع بس.` },
    { role: 'user', content: JSON.stringify(m).slice(0, 5000) },
  ], 600, 0.4);
  const j = out ? extractJson<{ summary?: string; ideas?: any[] }>(out.text) : null;
  if (j?.summary) { body = String(j.summary); ai = true; ideas = (j.ideas ?? []).slice(0, 5).map((x) => ({ title: str(x.title, 120), why: str(x.why, 300), action: validAction(x.action) ?? undefined })).filter((x) => x.title); }
  await saveDoc(env, 'growth', `مستشار النمو — ${cairoDay()}`, body, { metrics: m, ideas }, ai);
  const first = ideas.find((i) => i.action && (i.action.t === 'banner' || i.action.t === 'flag'));
  if (first?.action) await autoAct(env, 'numuw', `💡 ${first.title}`, [first.action], first.why);
  return { ok: true, note: `${ideas.length} فكرة نمو${ai ? '' : ' (من غير AI)'}`, xp: 2 };
}

// ------------------------------------------------------------------ 🎯 صيّاد: verified deal hunter
export function verifyDeal(r: { price: number | null; list_price: number | null; med30: number | null; low: number | null; drop_pct: number | null; in_stock: number; checked_at: string | null; updated_at: string }) {
  const why: string[] = [];
  if (!r.price || !r.in_stock) return { ok: false, why: ['مش متوفر'] };
  const fresh = Date.now() - Date.parse(r.checked_at ?? r.updated_at) < 72 * 3600_000;
  if (!fresh) return { ok: false, why: ['السعر قديم (أكتر من 3 أيام)'] };
  const ref = r.med30 ?? null;
  if (ref && r.price > ref * 0.92) return { ok: false, why: ['مش أرخص من متوسط 30 يوم فعلًا'] };
  if (r.list_price && ref && r.list_price > ref * 1.8) why.push('⚠️ السعر «قبل الخصم» منفوخ — بنحسب الخصم من متوسط 30 يوم');
  const real = ref ? Math.round((1 - r.price / ref) * 100) : Math.round(r.drop_pct ?? 0);
  if (real < 12 || real > 85) return { ok: false, why: [`خصم حقيقي ${real}% مش في الحدود`] };
  if (r.low && r.price <= r.low * 1.01) why.push('🏆 أقل سعر اتسجل');
  if (real > 60) why.push('⚠️ خصم كبير جدًا — اتأكد من صفحة المتجر');
  why.unshift(`خصم حقيقي ${real}% عن متوسط 30 يوم`);
  return { ok: true, real, why };
}
export async function huntDeals(env: Env, limit = 8) {
  const rows = (await env.DB.prepare("SELECT id, title, title_ar, image, price, list_price, med30, low, drop_pct, store, url, in_stock, checked_at, updated_at, heat, views, hot, cold, n_offers FROM catalog WHERE in_stock=1 AND price IS NOT NULL AND (drop_pct>=12 OR (med30 IS NOT NULL AND price < med30*0.88)) ORDER BY COALESCE(drop_pct,0)*0.6 + heat*0.4 DESC LIMIT 120").all<any>()).results;
  const out: (Featured & { score: number })[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const v = verifyDeal(r);
    if (!v.ok) continue;
    const key = (r.title_ar || r.title).slice(0, 28);
    if (seen.has(key)) continue; seen.add(key);
    const score = (v.real! > 60 ? 50 : v.real!) * 1.2 + Math.log1p(r.views + r.hot * 3) * 6 - r.cold * 2 + (r.n_offers > 1 ? 5 : 0);
    out.push({ id: r.id, title: (r.title_ar || r.title).slice(0, 120), image: r.image, price: r.price, old: Math.round(r.med30 ?? r.list_price ?? r.price), pct: v.real!, store: r.store, url: r.url, why: v.why.join(' · '), score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
async function sayyad(env: Env): Promise<AP.Result> {
  const deals = await huntDeals(env);
  if (!deals.length) return { ok: true, note: 'مفيش عروض عدّت التحقق دلوقتي', xp: 0 };
  const cur = parseJ<{ items?: Featured[] }>((await env.DB.prepare("SELECT value FROM flags WHERE key='featured_deals'").first<{ value: string }>())?.value, {});
  const same = cur.items && cur.items.map((x) => x.id).join() === deals.map((x) => x.id).join();
  if (same) return { ok: true, note: `نفس ${deals.length} عروض — مفيش تغيير`, xp: 1 };
  const r = await autoAct(env, 'sayyad', `🎯 صيد اليوم: ${deals.length} عروض متأكد منها (أعلى خصم ${deals[0]!.pct}%)`, [{ t: 'featured', items: deals.map(({ score, ...d }) => d) }], deals.slice(0, 3).map((d) => `• ${d.title} — ${d.price} ج (${d.why})`).join('\n'));
  return { ok: true, note: r.applied ? `نزّلت ${deals.length} عروض في «صيد اليوم»` : `اقترحت ${deals.length} عروض (${r.reason})`, xp: 2 };
}

// ------------------------------------------------------------------ 📣 حملة: campaign generator (drafts; own surfaces only)
async function imageFor(env: Env, prompt: string): Promise<string | null> {
  if ((await aiBudgetLeft(env)) <= 30) return null;
  try {
    const out = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell' as keyof AiModels, { prompt, steps: 4 } as never)) as { image?: string };
    await env.DB.prepare('INSERT INTO ai_usage (day,kind,calls,fails) VALUES (?,?,1,0) ON CONFLICT(day,kind) DO UPDATE SET calls=calls+1').bind(cairoDay(), 'image').run();
    return out?.image ? `data:image/jpeg;base64,${out.image}` : null;
  } catch (e) { console.log('image error', String(e).slice(0, 200)); return null; }
}
export async function makeCampaign(env: Env, goal: string, deal?: Featured | null, withImage = true) {
  const site = 'https://safqaeg.pages.dev';
  const fallback = {
    headline: deal ? `${deal.title} بـ ${deal.price} ج 🔥` : goal.slice(0, 80),
    telegram: deal ? `🎯 <b>صيد اليوم من صفقة</b>\n${deal.title}\n💰 ${deal.price} ج بدل ${deal.old} ج (خصم حقيقي ${deal.pct}%)\n${site}/product/${deal.id}` : `${goal}\n${site}`,
    whatsapp: deal ? `🎯 صيد اليوم من صفقة: ${deal.title} بـ ${deal.price} ج بدل ${deal.old} (خصم حقيقي ${deal.pct}%) — ${site}/product/${deal.id}` : `${goal} — ${site}`,
    facebook: deal ? `خصم حقيقي ${deal.pct}% مش مضروب 👀\n${deal.title} بـ ${deal.price} ج. صفقة بتقارن الأسعار في المتاجر المصرية وبتقولك الخصم بجد ولا لأ.\n${site}` : `${goal}\n${site}`,
    x: deal ? `${deal.title} بـ ${deal.price} ج (خصم حقيقي ${deal.pct}%) 🔥 ${site}/product/${deal.id}` : `${goal} ${site}`,
    imagePrompt: 'premium product advertising photo, warm gold and emerald lighting, Egyptian shopping deal, no text',
  };
  let c = fallback, ai = false;
  const out = await llm(env, 'campaign', [
    { role: 'system', content: `إنت «حملة»، كاتب إعلانات صفقة (مقارنة أسعار مصري، شعارها: الخصم الحقيقي مش المضروب). اكتب JSON بس:
{"headline":"عنوان قصير","telegram":"رسالة تيليجرام (HTML بسيط <b>) 3-5 سطور","whatsapp":"رسالة واتساب قصيرة","facebook":"بوست فيسبوك 3-4 سطور","x":"تويتة أقل من 240 حرف","imagePrompt":"English prompt for an ad image, no text in image"}
بالمصري، دمه خفيف ومحترم، من غير مبالغة ولا وعود كدب، وحط الرابط ${site}${deal ? `/product/${deal.id}` : ''} في الرسايل.` },
    { role: 'user', content: `الهدف: ${goal}\n${deal ? `العرض (حقيقي ومتأكد منه): ${JSON.stringify({ title: deal.title, price: deal.price, before: deal.old, realDiscount: deal.pct, store: deal.store, why: deal.why })}` : ''}` },
  ], 650, 0.8);
  const j = out ? extractJson<typeof fallback>(out.text) : null;
  if (j?.telegram) { c = { ...fallback, ...Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v).slice(0, 1200)])) } as typeof fallback; ai = true; }
  const image = withImage ? await imageFor(env, `${c.imagePrompt}, ${deal ? deal.title.replace(/[^\w\s-]/g, ' ') : ''}`.slice(0, 400)) : null;
  const id = await saveDoc(env, 'campaign', c.headline, c.telegram, { goal, deal, copy: c, image, status: 'draft' }, ai);
  return { id, copy: c, image, deal, ai };
}
async function hamla(env: Env): Promise<AP.Result> {
  const cur = parseJ<{ items?: Featured[] }>((await env.DB.prepare("SELECT value FROM flags WHERE key='featured_deals' AND enabled=1").first<{ value: string }>())?.value, {});
  const deal = cur.items?.[0] ?? (await huntDeals(env, 1))[0] ?? null;
  if (!deal) return { ok: true, note: 'مفيش عرض متأكد منه يستاهل حملة', xp: 0 };
  const camp = await makeCampaign(env, 'حملة صيد اليوم', deal);
  // Own surfaces only: site/app banner. Telegram only when the owner turned «campaign_telegram» on (subscribers who opted in, 1/day).
  const banner = await env.DB.prepare("SELECT enabled, updated_by FROM flags WHERE key='banner'").first<{ enabled: number; updated_by: string }>();
  let note = 'جهّزت مسودة حملة';
  if (!banner?.enabled || banner.updated_by === 'hamla') { const r = await autoAct(env, 'hamla', `📣 شريط الحملة: ${camp.copy.headline}`, [{ t: 'banner', ar: camp.copy.headline.slice(0, 140), level: 'deal', on: true }], 'حملة صيد اليوم على الموقع والتطبيق'); note += r.applied ? ' + نزّلت الشريط' : ''; }
  const tg = await env.DB.prepare("SELECT enabled FROM flags WHERE key='campaign_telegram'").first<{ enabled: number }>();
  if (tg?.enabled && tgEnabled(env) && (await autopilotOn(env)) && (await rateLimit(env, `hamla:tg:${cairoDay()}`, 1, 86400))) {
    const subs = (await env.DB.prepare('SELECT chat_id FROM tg_links WHERE subscribed=1 LIMIT 500').all<{ chat_id: string }>()).results;
    for (const s of subs) await enqueue(env, s.chat_id, camp.copy.telegram);
    await AP.opsLog(env, 'hamla', 'campaign', `نشرت الحملة على تيليجرام لـ ${subs.length} مشترك`, { id: camp.id }, 'ok');
    note += ` + تيليجرام (${subs.length})`;
  }
  await AP.opsLog(env, 'hamla', 'campaign', `مسودة حملة: ${camp.copy.headline}`, { id: camp.id, ai: camp.ai, image: Boolean(camp.image) }, 'info');
  return { ok: true, note, xp: 2 };
}

// ------------------------------------------------------------------ 🎙️ المدير: daily CEO brief
async function modeer(env: Env): Promise<AP.Result> {
  const [m, intel, growth, deals] = await Promise.all([growthMetrics(env), latestDoc(env, 'intel'), latestDoc(env, 'growth'), env.DB.prepare("SELECT value FROM flags WHERE key='featured_deals'").first<{ value: string }>()]);
  const auto = (await env.DB.prepare("SELECT actor, title FROM ops_audit WHERE at>? AND kind IN ('change','rollback','campaign','rank','incident') ORDER BY id DESC LIMIT 15").bind(new Date(Date.now() - 86400_000).toISOString()).all<{ actor: string; title: string }>()).results;
  const open = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM escalations WHERE status='open'").first<{ n: number }>())?.n ?? 0);
  const top = parseJ<{ items?: Featured[] }>(deals?.value, {}).items?.[0];
  let body = [`صباح الفل يا ريّس ☀️`, `عندنا ${m.users} عضو، ${m.new7} جديد الأسبوع ده، و${m.paid} مشترك مدفوع. إيراد آخر 30 يوم ${m.revenue30} جنيه.`, top ? `أحسن صيدة النهارده: ${top.title} بـ ${top.price} جنيه، خصم حقيقي ${top.pct}%.` : '', auto.length ? `الوكلاء عملوا ${auto.length} حاجة لوحدهم من امبارح.` : '', open ? `في ${open} قرار مستنيك في الهاب.` : 'مفيش قرارات مستنياك.'].filter(Boolean).join(' ');
  let ai = false;
  const out = await llm(env, 'brief', [
    { role: 'system', content: 'إنت «المدير»، بتكتب موجز الصبح لصاحب صفقة كأنك مدير تنفيذي شاطر بيكلّمه بالمصري. 120-180 كلمة، نص متصل يتقري بصوت عالي (من غير رموز كتير ولا جداول)، فيه: الأرقام المهمة، اللي الوكلاء عملوه لوحدهم، حركة المنافسين، أهم فكرة نمو، وقرار واحد لو محتاجه. ابدأ بتحية خفيفة.' },
    { role: 'user', content: JSON.stringify({ metrics: { users: m.users, new7: m.new7, newPrev7: m.newPrev7, active7: m.active7, paid: m.paid, revenue30: m.revenue30, revenuePrev30: m.revenuePrev30, telegram: m.telegram }, autonomousActions: auto, competitors: intel?.body?.slice(0, 900), growth: growth?.body?.slice(0, 700), topDeal: top, openDecisions: open }).slice(0, 5000) },
  ], 500, 0.6);
  if (out?.text) { body = out.text.trim(); ai = true; }
  await saveDoc(env, 'brief', `موجز المدير — ${cairoDay()}`, body, { metrics: m, auto, open, topDeal: top ?? null }, ai);
  await AP.opsLog(env, 'modeer', 'brief', `موجز المدير جاهز (${cairoDay()})`, { ai }, 'ok');
  await AP.notifyOwner(env, `🎙️ <b>موجز المدير</b>\n${body.replace(/[<>&]/g, '')}`);
  return { ok: true, note: ai ? 'موجز بالذكاء الاصطناعي' : 'موجز بالقالب', xp: 2 };
}

// ------------------------------------------------------------------ registration
const at = (h: number) => (m: number) => m >= h * 60 && m < h * 60 + 10;
AP.registerAgent({ id: 'amin', name: 'أمين', emoji: '🧞', role: 'وكيل أوامر المالك + مراقبة أي تغيير ورجوعه تلقائي لو الأرقام وحشت', color: '#f5b524', every: 10, crew: 'owner' }, amin);
AP.registerAgent({ id: 'sayyad', name: 'صيّاد', emoji: '🎯', role: 'يصطاد العروض الحقيقية ويتأكد منها وينزّلها في «صيد اليوم»', color: '#22c55e', every: 60, crew: 'owner' }, sayyad);
AP.registerAgent({ id: 'ain', name: 'عين', emoji: '🕵️', role: 'يراقب صفحات المنافسين العامة ويلخّص تحركاتهم (بيحترم robots.txt)', color: '#38bdf8', every: 720, crew: 'owner' }, ain, (m) => at(9)(m) || at(21)(m));
AP.registerAgent({ id: 'numuw', name: 'نماء', emoji: '📈', role: 'مستشار النمو والإيراد من أرقام صفقة الحقيقية', color: '#a78bfa', every: 1440, crew: 'owner' }, numuw, at(10));
AP.registerAgent({ id: 'hamla', name: 'حملة', emoji: '📣', role: 'يكتب حملات تيليجرام/واتساب/سوشيال بصورة — مسودات، وينشر على قنوات صفقة بس', color: '#ec4899', every: 1440, crew: 'owner' }, hamla, at(12));
AP.registerAgent({ id: 'modeer', name: 'المدير', emoji: '🎙️', role: 'موجز الصبح للمالك بصوت (8 الصبح)', color: '#f97316', every: 1440, crew: 'owner' }, modeer, at(8));

// ------------------------------------------------------------------ routes (owner only)
export function registerOwnerTools(on: On, d: Deps) {
  on('GET', '/api/v2/hub/owner', async (c: Ctx) => {
    await d.needAdmin(c);
    const ids = ['amin', 'sayyad', 'ain', 'numuw', 'hamla', 'modeer'];
    const [agents, changes, docs, autopilot, featured, tg] = await Promise.all([
      AP.agentsOut(c.env).then((a) => a.filter((x) => ids.includes(x.id))),
      c.env.DB.prepare('SELECT id, at, actor, source, title, prompt, status, applied_at, rolled_at, note FROM owner_changes ORDER BY at DESC LIMIT 30').all().then((r) => r.results),
      Promise.all(['brief', 'intel', 'growth', 'campaign'].map((k) => latestDoc(c.env, k))),
      autopilotOn(c.env),
      c.env.DB.prepare("SELECT enabled, value FROM flags WHERE key='featured_deals'").first<{ enabled: number; value: string }>(),
      c.env.DB.prepare("SELECT enabled FROM flags WHERE key='campaign_telegram'").first<{ enabled: number }>(),
    ]);
    const [brief, intel, growth, campaign] = docs;
    return { autopilot, campaignTelegram: Boolean(tg?.enabled), agents, changes, brief, intel, growth, campaign, featured: { on: Boolean(featured?.enabled), ...parseJ(featured?.value, {}) }, aiLeft: await aiBudgetLeft(c.env), rules: AUTO_RULES };
  });
  on('POST', '/api/v2/hub/owner/autopilot', async (c: Ctx) => {
    const who = await d.needAdmin(c); const b = await d.body(c);
    if (b.global !== undefined) await AP.setFlag(c.env, who, 'owner_autopilot', { enabled: Boolean(b.global) });
    if (b.telegram !== undefined) await AP.setFlag(c.env, who, 'campaign_telegram', { enabled: Boolean(b.telegram) });
    await AP.opsLog(c.env, who, 'autopilot', `الطيار الآلي: ${b.global !== undefined ? (b.global ? 'اتشغّل' : 'اتقفل') : ''}${b.telegram !== undefined ? ` · نشر تيليجرام ${b.telegram ? 'مسموح' : 'ممنوع'}` : ''}`, b, 'warn');
    return { ok: true };
  });
  on('POST', '/api/v2/hub/command', async (c: Ctx) => {
    const who = await d.needAdmin(c);
    if (!(await rateLimit(c.env, `cmd:${who}`, 40, 3600))) fail(429, 'rate', 'أوامر كتير — استنى شوية');
    const text = str((await d.body(c)).text, 600);
    if (!text) fail(400, 'text', 'اكتب الأمر');
    const plan = await parseCommand(c.env, text);
    await AP.opsLog(c.env, who, 'command', `🧞 أمر: «${text.slice(0, 120)}»`, { actions: plan.actions.length, blocked: plan.blocked ?? null }, 'info');
    if (plan.blocked || !plan.actions.length) return { say: plan.blocked ?? plan.say, blocked: Boolean(plan.blocked), actions: [] };
    const { id, previews } = await proposeChange(c.env, who, 'command', text.slice(0, 120), plan.actions, text);
    return { id, say: plan.say, actions: plan.actions.map((a, i) => ({ ...a, preview: previews[i] })) };
  });
  on('POST', '/api/v2/hub/changes/:id/apply', async (c: Ctx) => applyChange(c.env, await d.needAdmin(c), c.p[0]!));
  on('POST', '/api/v2/hub/changes/:id/rollback', async (c: Ctx) => rollbackChange(c.env, await d.needAdmin(c), c.p[0]!));
  on('GET', '/api/v2/hub/changes', async (c: Ctx) => { await d.needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM owner_changes ORDER BY at DESC LIMIT 100').all()).results.map((r: any) => ({ ...r, actions: parseJ(r.actions, []), before: undefined })) }; });
  on('GET', '/api/v2/hub/docs', async (c: Ctx) => {
    await d.needAdmin(c);
    const kind = c.url.searchParams.get('kind') ?? 'brief';
    const rows = (await c.env.DB.prepare('SELECT * FROM owner_docs WHERE kind=? ORDER BY at DESC LIMIT 20').bind(kind).all<any>()).results;
    return { items: rows.map((r) => ({ ...r, data: parseJ(r.data, null) })) };
  });
  on('GET', '/api/v2/hub/growth', async (c: Ctx) => { await d.needAdmin(c); return { metrics: await growthMetrics(c.env), latest: await latestDoc(c.env, 'growth') }; });
  on('GET', '/api/v2/hub/deals-hunt', async (c: Ctx) => { await d.needAdmin(c); return { items: await huntDeals(c.env, 12) }; });
  on('POST', '/api/v2/hub/deals-hunt/feature', async (c: Ctx) => {
    const who = await d.needAdmin(c);
    const ids: string[] = ((await d.body(c)).ids ?? []).slice(0, 12).map((x: unknown) => String(x));
    const all = await huntDeals(c.env, 40);
    const items = ids.length ? all.filter((x) => ids.includes(x.id)) : all.slice(0, 8);
    if (!items.length) fail(400, 'none', 'مفيش عروض متأكد منها من اللي اخترتهم');
    const { id } = await proposeChange(c.env, who, 'command', `🎯 صيد اليوم (${items.length} عروض) بقرار المالك`, [{ t: 'featured', items: items.map(({ score, ...x }) => x) }]);
    return applyChange(c.env, who, id);
  });
  on('POST', '/api/v2/hub/campaign', async (c: Ctx) => {
    const who = await d.needAdmin(c);
    if (!(await rateLimit(c.env, `camp:${cairoDay()}`, 12, 86400))) fail(429, 'rate', 'كفاية حملات النهارده (حماية حصة الذكاء الاصطناعي)');
    const b = await d.body(c);
    const deal = b.productId ? (await huntDeals(c.env, 40)).find((x) => x.id === b.productId) ?? null : null;
    const r = await makeCampaign(c.env, str(b.goal, 300) || 'حملة صفقة', deal, b.image !== false);
    await AP.opsLog(c.env, who, 'campaign', `مسودة حملة بطلب المالك: ${r.copy.headline}`, { id: r.id }, 'info');
    return r;
  });
  on('POST', '/api/v2/hub/brief', async (c: Ctx) => {
    const who = await d.needAdmin(c);
    if (!(await rateLimit(c.env, `brief:${cairoDay()}`, 4, 86400))) fail(429, 'rate', 'اتعمل موجز كفاية النهارده — اقرا آخر واحد');
    await AP.runAgent(c.env, 'modeer', true);
    await AP.opsLog(c.env, who, 'brief', 'المالك طلب موجز جديد', null, 'info');
    return { brief: await latestDoc(c.env, 'brief') };
  });
}
