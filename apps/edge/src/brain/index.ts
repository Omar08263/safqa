// العقل الرئيسي (Safqa master AI): one orchestrator over every agent. Every 15 min (its own cron, so its own
// query/subrequest budget) it senses the platform, diagnoses problems, fixes what is safely fixable by itself,
// verifies the fix on the next ticks (undoing it when metrics get worse), proposes the rest to the owner, and
// drafts GitHub issues for code-level problems. Its state is ONE small blob (≤1 write per tick, skipped when nothing
// changed), so it fits the free D1/KV write quotas. Money, user bans/deletions and anything destructive are
// outside its whitelist entirely. No feature here touches another site's bot protection: sources are only paused,
// resumed or re-learned on our side.
import * as AP from '../autopilot';
import { aiBudgetLeft, extractJson, llm } from '../ai';
import { storeInfo, type Ctx, type On } from '../catalog/api';
import { health } from '../catalog/ingest';
import * as Budget from '../infra/budget';
import { edgeCacheGet, edgeCachePut, sget, sput } from '../infra/state';
import { type Env, fail, nowIso, parseJ, rateLimit, str, uid } from '../util';
import { type Done, diagnose, FIX_AR, type Finding, type Fix, fixKey, FORBIDDEN, planFixes, SAFE, type Signals, signature, type Spec } from './core';

type Deps = { needAdmin: (c: Ctx) => Promise<string>; body: (c: Ctx) => Promise<Record<string, unknown>> };

export const TEAM: { id: Spec; ar: string; emoji: string; role: string; agents: string[] }[] = [
  { id: 'tabib', ar: 'الطبيب', emoji: '🩺', role: 'صحة الموقع والـ API والأخطاء — بيصلّح بنفسه', agents: ['haris', 'amin'] },
  { id: 'katalog', ar: 'الكتالوج', emoji: '🛒', role: 'المصادر والسحب والمنتجات الجديدة', agents: ['kashaf', 'sayyad'] },
  { id: 'asaar', ar: 'الأسعار', emoji: '💹', role: 'قرّاء الأسعار والخصومات الغريبة', agents: ['radar'] },
  { id: 'amn', ar: 'الأمن', emoji: '🔐', role: 'المفاتيح والصلاحيات والهجمات', agents: ['khazna'] },
  { id: 'muhtawa', ar: 'المحتوى', emoji: '📝', role: 'جودة المنتجات والمجتمع والحملات', agents: ['mizan', 'monasseq', 'hamla'] },
  { id: 'numuw', ar: 'النمو', emoji: '📈', role: 'التسجيلات والدفع والمنافسين والموجز', agents: ['numuw', 'ain', 'modeer'] },
];

interface Pending { id: string; at: string; key: string; fix: Fix; finding: string; title: string }
interface Issue { id: string; at: string; key: string; title: string; body: string; url?: string; spec: Spec }
interface Plan { at: string; sig: string; summary: string; focus: string[]; next: string[]; model: string }
export interface BrainState {
  v: 1; settings: { auto: boolean; github: boolean };
  lastTick?: string; ticks: number; sig?: string;
  findings: Finding[]; plan?: Plan; done: Done[]; pending: Pending[]; issues: Issue[];
  skipped: Record<string, number>; paused: Record<string, number>;
  vitals?: Record<string, unknown>; dayNote?: string;
}
const KEY = 'brain:state';
const fresh = (): BrainState => ({ v: 1, settings: { auto: true, github: false }, ticks: 0, findings: [], done: [], pending: [], issues: [], skipped: {}, paused: {} });

export async function loadState(env: Env): Promise<BrainState> {
  const live = await edgeCacheGet<BrainState>(KEY);
  const st = live ?? parseJ<BrainState>(await sget(env, KEY), fresh());
  return { ...fresh(), ...st };
}
async function saveState(env: Env, st: BrainState, persist: boolean) {
  st.done = st.done.slice(0, 50); st.pending = st.pending.slice(0, 20); st.issues = st.issues.slice(0, 30);
  for (const [k, until] of Object.entries(st.skipped)) if (until < Date.now()) delete st.skipped[k];
  for (const [k, until] of Object.entries(st.paused)) if (until < Date.now()) delete st.paused[k];
  await edgeCachePut(KEY, st, 900); // free, no quota; this colo only
  if (persist) {
    await sput(env, KEY, JSON.stringify(st));
    await sput(env, 'src:paused', JSON.stringify(st.paused));
  }
}

// ---------------------------------------------------------------- sensors (read-only)
async function timed(url: string, ms = 8000) {
  const t0 = Date.now();
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'SafqaBrain/1.0 (+https://safqaeg.pages.dev; self health check)' } }); return { ok: r.ok, status: r.status, ms: Date.now() - t0, r }; }
  catch { return { ok: false, status: 0, ms: Date.now() - t0, r: null }; }
}
export async function sense(env: Env, st: BrainState): Promise<Signals> {
  const s: Signals = { now: Date.now(), d1Ok: false, kvOk: false, paused: st.paused };
  const q = async <T,>(sql: string, ...b: unknown[]) => (await env.DB.prepare(sql).bind(...b).all<T>()).results;
  const site = (env.SITE_URL || 'https://safqaeg.pages.dev').replace(/\/$/, '');
  const [home, snap, admin] = await Promise.all([timed(`${site}/`), timed(`${site}/demo/snapshot.json`, 10000), timed('https://safqa-admin.pages.dev/', 6000)]);
  s.site = { ok: home.ok, status: home.status, ms: home.ms }; s.admin = { ok: admin.ok, status: admin.status };
  if (snap.r?.ok) { try { const j = (await snap.r.json()) as Record<string, unknown>; const at = String(j.generatedAt ?? j.at ?? j.updatedAt ?? ''); s.snapshotAgeH = at ? (Date.now() - Date.parse(at)) / 3600_000 : null; } catch { s.snapshotAgeH = null; } }
  try { await env.DB.prepare('SELECT 1').first(); s.d1Ok = true; } catch { /* down */ }
  try { await env.KV.get('brain:ping'); s.kvOk = true; } catch { /* down */ }
  try { const b = await Budget.report(env); s.budget = { state: b.state, used: b.used, pct: b.pct, exhausted: b.exhausted }; } catch { /* */ }
  try { s.aiLeft = await aiBudgetLeft(env); } catch { /* */ }
  const since = Date.now() - 15 * 60_000;
  try {
    s.topErrors = await q<{ msg: string; n: number }>('SELECT COALESCE(msg, kind) AS msg, COUNT(*) AS n FROM client_events WHERE at>? GROUP BY msg ORDER BY n DESC LIMIT 5', since);
    s.clientErrors15 = s.topErrors.reduce((a, t) => a + t.n, 0);
    s.guardedFlagErrors = await q<{ flag: string; n: number; users: number }>('SELECT e.flag, COUNT(*) AS n, COUNT(DISTINCT e.sid) AS users FROM client_events e JOIN flags f ON f.key=e.flag WHERE e.at>? AND f.enabled=1 AND f.guard=1 GROUP BY e.flag', since);
  } catch { /* */ }
  try {
    const hl = await health(env);
    s.stores = hl.stores; s.healIndex = hl.selfHealedHosts;
    s.storeHosts = Object.fromEntries(hl.stores.map((x) => [x.store, storeInfo(x.store).domain]).filter(([, d]) => d));
    const run = (hl.hunter as Record<string, unknown>[])[0];
    s.hunterLast = run ? { at: String(run.at ?? ''), errors: Number(run.errors ?? run.failed ?? 0) || 0 } : null;
  } catch { /* */ }
  try { s.wildDrops = await q<{ store: string; n: number; wild: number }>('SELECT store, COUNT(*) AS n, SUM(CASE WHEN pct>=80 THEN 1 ELSE 0 END) AS wild FROM drops WHERE at>? GROUP BY store', new Date(Date.now() - 86400_000).toISOString()); } catch { /* */ }
  try { s.rateHot = await q<{ key: string; count: number }>('SELECT key, count FROM rate WHERE reset>? ORDER BY count DESC LIMIT 5', Math.floor(Date.now() / 1000)); } catch { /* */ }
  s.secrets = { jwtLen: (env.JWT_SECRET ?? '').length, corsWildcard: (env.ALLOWED_ORIGINS ?? '').split(',').some((o) => o.trim() === '*'), adminEmails: (env.ADMIN_EMAILS ?? '').split(',').filter((x) => x.includes('@')).length };
  try { const c = (await q<{ n: number; ni: number; na: number }>('SELECT COUNT(*) AS n, SUM(CASE WHEN image IS NULL OR image=\'\' THEN 1 ELSE 0 END) AS ni, SUM(CASE WHEN title_ar IS NULL OR title_ar=\'\' THEN 1 ELSE 0 END) AS na FROM catalog'))[0]; if (c) s.content = { products: c.n, noImage: c.ni ?? 0, noArabic: c.na ?? 0 }; } catch { /* */ }
  try {
    const d = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
    const g = (await q<{ a: number; b: number; c: number; p: number }>(`SELECT (SELECT COUNT(*) FROM users WHERE created_at>?) a, (SELECT COUNT(*) FROM users WHERE created_at>? AND created_at<=?) b,
      (SELECT COUNT(*) FROM payments WHERE created_at>?) c, (SELECT COUNT(*) FROM payments WHERE created_at>? AND status IN ('approved','provisional')) p`, d(7), d(14), d(7), d(30), d(30)))[0];
    if (g) s.growth = { new7: g.a, newPrev7: g.b, checkouts30: g.c, paid30: g.p };
  } catch { /* */ }
  return s;
}

// ---------------------------------------------------------------- actuators (whitelisted, reversible)
async function execute(env: Env, fix: Fix, st: BrainState): Promise<{ ok: boolean; note: string; undo?: unknown }> {
  if (FORBIDDEN.test(`${fix.t} ${fix.target}`)) return { ok: false, note: 'ممنوع — محتاج المالك' };
  switch (fix.t) {
    case 'cache_purge': await AP.bustConfig(env); await caches.default.delete(`https://cache.safqa.internal/${encodeURIComponent('hub:overview')}`).catch(() => false); return { ok: true, note: 'اتمسح كاش الإعدادات' };
    case 'source_pause': { const prev = st.paused[fix.target] ?? null; st.paused[fix.target] = Date.now() + fix.hours * 3600_000; return { ok: true, note: `المصدر «${fix.target}» واقف ${fix.hours} ساعات (بيرجع لوحده)`, undo: { prev } }; }
    case 'source_resume': { const prev = st.paused[fix.target] ?? null; delete st.paused[fix.target]; return { ok: true, note: `المصدر «${fix.target}» رجع يشتغل`, undo: { prev } }; }
    case 'extractor_relearn': {
      const prev = await sget(env, `heal:${fix.target}`);
      await sput(env, `heal:${fix.target}`, '', 60);
      const idx = parseJ<Record<string, string>>(await sget(env, 'heal:index'), {}); delete idx[fix.target]; await sput(env, 'heal:index', JSON.stringify(idx));
      return { ok: true, note: `قارئ أسعار ${fix.target} هيتعلّم من جديد في أول قراءة`, undo: { prev } };
    }
    case 'flag_off': { const row = await env.DB.prepare('SELECT enabled, guard FROM flags WHERE key=?').bind(fix.target).first<{ enabled: number; guard: number }>(); if (!row?.guard) return { ok: false, note: 'الميزة مش محمية — محتاج المالك' }; await AP.setFlag(env, 'agent:brain', fix.target, { enabled: false }); await AP.bustConfig(env); return { ok: true, note: `قفلت «${fix.target}»`, undo: { enabled: Boolean(row.enabled) } }; }
    case 'run_agent': { if (!AP.RUNNERS[fix.target]) return { ok: false, note: 'وكيل مش معروف' }; const r = await AP.runAgent(env, fix.target, true); return { ok: r.ok, note: `${fix.target}: ${r.note}` }; }
    default: return { ok: false, note: 'مش مدعوم' };
  }
}
async function undo(env: Env, d: Done, st: BrainState) {
  const u = (d.undo ?? {}) as Record<string, unknown>;
  if (d.fix.t === 'source_pause' || d.fix.t === 'source_resume') { if (u.prev) st.paused[d.fix.target] = Number(u.prev); else delete st.paused[d.fix.target]; }
  else if (d.fix.t === 'extractor_relearn') { if (u.prev) await sput(env, `heal:${d.fix.target}`, String(u.prev), 30 * 86400); }
  else if (d.fix.t === 'flag_off') { await AP.setFlag(env, 'agent:brain', d.fix.target, { enabled: Boolean(u.enabled) }); await AP.bustConfig(env); }
  else return false;
  return true;
}

// ---------------------------------------------------------------- planner narrative (LLM, cached by situation)
async function gemini(env: Env, prompt: string): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch { return null; }
}
export function rulePlan(fs: Finding[], acted: number, pending: number): Omit<Plan, 'at' | 'sig' | 'model'> {
  const crit = fs.filter((f) => f.sev === 'crit'), warn = fs.filter((f) => f.sev === 'warn');
  const summary = !fs.length ? 'كله تمام — الموقع والمصادر والأمن شغالين، ومفيش حاجة محتاجة تدخّل.'
    : `${crit.length ? `${crit.length} مشكلة حرجة` : 'مفيش مشاكل حرجة'}${warn.length ? ` و${warn.length} تنبيه` : ''}. ${acted ? `صلّحت ${acted} لوحدي` : 'ماعملتش أي تغيير لوحدي'}${pending ? ` و${pending} مستنية موافقتك` : ''}.`;
  return { summary, focus: [...crit, ...warn].slice(0, 3).map((f) => f.title), next: ['أتأكد إن الإصلاحات نفعت في الدورة الجاية', 'أراقب الأخطاء بعد أي تغيير وأرجّعه لو زادت'] };
}
async function narrate(env: Env, st: BrainState, sig: string, acted: number): Promise<Plan> {
  const base = rulePlan(st.findings, acted, st.pending.length);
  const due = !st.plan || (st.plan.sig !== sig && Date.now() - Date.parse(st.plan.at) > 15 * 60_000) || Date.now() - Date.parse(st.plan.at) > 3 * 3600_000;
  if (!due) return st.plan!;
  if (!st.findings.length) return { at: nowIso(), sig, ...base, model: 'rules' };
  const prompt = `انت "العقل الرئيسي" لموقع صفقة (مقارنة أسعار في مصر). فريقك: الطبيب، الكتالوج، الأسعار، الأمن، المحتوى، النمو.
المشاكل دلوقتي:\n${st.findings.map((f) => `- [${f.sev}] (${f.spec}) ${f.title}${f.detail ? ` — ${f.detail}` : ''}`).join('\n')}
اللي اتعمل تلقائي: ${st.done.slice(0, 5).map((d) => `${FIX_AR[d.fix.t]} ${d.fix.target} (${d.status})`).join('، ') || 'ولا حاجة'}
مستني موافقة المالك: ${st.pending.length}
ممنوع تقترح أي حاجة فيها فلوس أو حظر مستخدمين أو مسح، أو أي التفاف على حماية مواقع تانية.
رد JSON بس بالمصري: {"summary":"جملتين","focus":["أهم 3 أولويات"],"next":["الخطوات الجاية"]}`;
  let text = await gemini(env, prompt), model = 'gemini-2.0-flash';
  if (!text) { const r = await llm(env, 'ops', [{ role: 'user', content: prompt }], 350, 0.3); text = r?.text ?? null; model = r?.model ?? 'rules'; }
  const j = text ? extractJson<{ summary?: string; focus?: string[]; next?: string[] }>(text) : null;
  if (!j?.summary) return { at: nowIso(), sig, ...base, model: 'rules' };
  const clean = (a?: string[]) => (a ?? []).map((x) => str(x, 160)).filter((x) => x && !FORBIDDEN.test(x)).slice(0, 4);
  return { at: nowIso(), sig, summary: str(j.summary, 400), focus: clean(j.focus).length ? clean(j.focus) : base.focus, next: clean(j.next).length ? clean(j.next) : base.next, model };
}

// ---------------------------------------------------------------- GitHub (issue drafts; auto-file only with a token + owner opt-in)
const REPO = (env: Env) => env.GITHUB_REPO || 'Omar08263/safqa';
export const issueLink = (env: Env, i: Issue) => `https://github.com/${REPO(env)}/issues/new?${new URLSearchParams({ title: `[brain] ${i.title}`, body: `${i.body}\n\n— drafted by العقل الرئيسي (Safqa master AI), ${i.at}`, labels: 'brain' }).toString()}`;
async function fileIssue(env: Env, i: Issue): Promise<string | null> {
  if (!env.GITHUB_TOKEN) return null;
  const r = await fetch(`https://api.github.com/repos/${REPO(env)}/issues`, { method: 'POST', headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'SafqaBrain', 'content-type': 'application/json' }, body: JSON.stringify({ title: `[brain] ${i.title}`, body: `${i.body}\n\n— filed by العقل الرئيسي (Safqa master AI)`, labels: ['brain'] }) }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json()) as { html_url?: string }).html_url ?? null;
}

// ---------------------------------------------------------------- the loop
export async function brainTick(env: Env, opts: { manual?: string } = {}) {
  const st = await loadState(env);
  const before = JSON.stringify({ s: st.sig, d: st.done.length, p: st.pending.length, i: st.issues.length, set: st.settings, pz: st.paused });
  const s = await sense(env, st);
  const findings = diagnose(s);
  const sig = signature(findings);
  const ids = new Set(findings.map((f) => f.id));
  const errs = s.clientErrors15 ?? 0;
  // observe → verify earlier fixes; undo the ones that made things worse
  for (const d of st.done) {
    if (d.status !== 'applied' || !d.verifyAt || d.verifyAt > Date.now()) continue;
    const base = Number((d.undo as { errs?: number } | undefined)?.errs ?? 0);
    if (errs > base * 2 + 20 && (await undo(env, d, st).catch(() => false))) { d.status = 'undone'; d.note = `رجّعته — الأخطاء زادت (${base} → ${errs})`; await AP.opsLog(env, 'brain', 'rollback', `🧠↩️ ${FIX_AR[d.fix.t]} ${d.fix.target}: ${d.note}`, d, 'warn').catch(() => undefined); }
    else if (ids.has(d.finding)) { d.status = 'ineffective'; d.note = 'المشكلة لسه موجودة — اتحوّلت للمالك'; }
    else { d.status = 'verified'; d.note = 'اتأكدت إن المشكلة اتحلّت'; }
  }
  st.findings = findings;
  const globalAuto = await env.DB.prepare("SELECT enabled FROM flags WHERE key='owner_autopilot'").first<{ enabled: number }>().then((r) => Boolean(r?.enabled)).catch(() => false);
  const autopilot = st.settings.auto && globalAuto;
  const plan = planFixes(findings.filter((f) => !st.done.some((d) => d.finding === f.id && d.status === 'ineffective' && Date.now() - Date.parse(d.at) < 6 * 3600_000)), st.done, Date.now(), autopilot);
  let acted = 0;
  for (const { fix, finding } of plan.act) {
    const r = await execute(env, fix, st).catch((e) => ({ ok: false, note: String((e as Error).message ?? e).slice(0, 160), undo: undefined }));
    const d: Done = { id: uid('bd_'), at: nowIso(), key: fixKey(fix), fix, finding: finding.id, by: 'auto', status: r.ok ? 'applied' : 'failed', undo: { ...(r.undo as object ?? {}), errs }, verifyAt: Date.now() + 30 * 60_000, note: r.note };
    st.done.unshift(d); if (r.ok) acted++;
    await AP.opsLog(env, 'brain', 'auto_fix', `🧠 ${FIX_AR[fix.t]} «${fix.target}» — ${finding.title}: ${r.note}`, { fix, finding: finding.id }, r.ok ? 'ok' : 'warn').catch(() => undefined);
  }
  for (const { fix, finding } of plan.propose) {
    const key = fixKey(fix);
    if (st.pending.some((p) => p.key === key) || (st.skipped[key] ?? 0) > Date.now()) continue;
    st.pending.unshift({ id: uid('bp_'), at: nowIso(), key, fix, finding: finding.id, title: `${FIX_AR[fix.t]} «${fix.target}» — ${finding.title}` });
  }
  const today = nowIso().slice(0, 10);
  for (const { fix, finding } of plan.drafts) {
    if (st.issues.some((i) => i.key === fix.target)) continue;
    const i: Issue = { id: uid('bi_'), at: nowIso(), key: fix.target, title: fix.title, body: `${fix.body}\n\nFinding: ${finding.title}`, spec: finding.spec };
    if (st.settings.github && st.issues.filter((x) => x.url && x.at.slice(0, 10) === today).length < 3) i.url = (await fileIssue(env, i)) ?? undefined;
    st.issues.unshift(i);
  }
  // pending proposals whose problem disappeared are dropped
  st.pending = st.pending.filter((p) => ids.has(p.finding));
  st.plan = await narrate(env, st, sig, acted);
  st.vitals = { site: s.site, admin: s.admin, d1: s.d1Ok, kv: s.kvOk, budget: s.budget, aiLeft: s.aiLeft, clientErrors15: errs, snapshotAgeH: s.snapshotAgeH != null ? Math.round(s.snapshotAgeH) : null, stores: s.stores?.length ?? 0, autopilot };
  st.ticks++; st.lastTick = nowIso(); st.sig = sig;
  if (opts.manual) await AP.opsLog(env, opts.manual, 'brain_run', '🧠 تشغيل يدوي للعقل الرئيسي', { findings: findings.length, acted }, 'info').catch(() => undefined);
  const changed = JSON.stringify({ s: st.sig, d: st.done.length, p: st.pending.length, i: st.issues.length, set: st.settings, pz: st.paused }) !== before;
  const hourly = new Date().getUTCMinutes() < 15;
  await saveState(env, st, changed || hourly || Boolean(opts.manual));
  return st;
}

// ---------------------------------------------------------------- Hub routes (owner only)
export function registerBrain(on: On, d: Deps) {
  on('GET', '/api/v2/hub/brain', async (c) => {
    await d.needAdmin(c);
    const st = await loadState(c.env);
    const agents = await AP.agentsOut(c.env).catch(() => [] as Awaited<ReturnType<typeof AP.agentsOut>>);
    const team = TEAM.map((t) => ({ ...t, findings: st.findings.filter((f) => f.spec === t.id).length, worst: st.findings.filter((f) => f.spec === t.id).reduce((w, f) => (f.sev === 'crit' ? 'crit' : w === 'crit' ? w : f.sev === 'warn' ? 'warn' : w), 'ok' as string), members: agents.filter((a) => t.agents.includes(a.id)).map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, enabled: a.enabled, rank: a.rank, lastRun: (a as { lastRun?: string }).lastRun ?? null })) }));
    return { ...st, team, issues: st.issues.map((i) => ({ ...i, link: i.url ?? issueLink(c.env, i) })), github: { token: Boolean(c.env.GITHUB_TOKEN), repo: REPO(c.env) }, models: { planner: c.env.GEMINI_API_KEY ? 'gemini-2.0-flash → Workers AI' : `Workers AI (${c.env.CHAT_MODEL})` }, safe: SAFE };
  });
  on('POST', '/api/v2/hub/brain/run', async (c) => {
    const who = await d.needAdmin(c);
    if (!(await rateLimit(c.env, `brainrun:${who}`, 12, 3600))) fail(429, 'rate_limited', 'استنى شوية');
    const st = await brainTick(c.env, { manual: who });
    return { ok: true, findings: st.findings.length, plan: st.plan };
  });
  on('POST', '/api/v2/hub/brain/settings', async (c) => {
    const who = await d.needAdmin(c);
    const b = await d.body(c);
    const st = await loadState(c.env);
    if (typeof b.auto === 'boolean') st.settings.auto = b.auto;
    if (typeof b.github === 'boolean') st.settings.github = b.github;
    await saveState(c.env, st, true);
    await AP.opsLog(c.env, who, 'brain_settings', `🧠 إعدادات العقل: لوحده=${st.settings.auto ? 'آه' : 'لأ'}، GitHub=${st.settings.github ? 'آه' : 'لأ'}`, st.settings, 'info').catch(() => undefined);
    return { ok: true, settings: st.settings };
  });
  on('POST', '/api/v2/hub/brain/pending/:id', async (c) => {
    const who = await d.needAdmin(c);
    const decision = str((await d.body(c)).decision, 10);
    const st = await loadState(c.env);
    const p = st.pending.find((x) => x.id === c.p[0]);
    if (!p) fail(404, 'not_found', 'مش موجودة');
    st.pending = st.pending.filter((x) => x.id !== p!.id);
    if (decision !== 'apply') { st.skipped[p!.key] = Date.now() + 24 * 3600_000; await saveState(c.env, st, true); await AP.opsLog(c.env, who, 'brain_skip', `🧠 المالك رفض: ${p!.title}`, p, 'info').catch(() => undefined); return { ok: true, skipped: true }; }
    const r = await execute(c.env, p!.fix, st);
    st.done.unshift({ id: uid('bd_'), at: nowIso(), key: p!.key, fix: p!.fix, finding: p!.finding, by: who, status: r.ok ? 'applied' : 'failed', undo: r.undo, verifyAt: Date.now() + 30 * 60_000, note: r.note });
    await saveState(c.env, st, true);
    await AP.opsLog(c.env, who, 'brain_apply', `🧠 المالك وافق: ${p!.title} — ${r.note}`, p, r.ok ? 'ok' : 'warn').catch(() => undefined);
    return { ok: r.ok, note: r.note };
  });
  on('POST', '/api/v2/hub/brain/undo/:id', async (c) => {
    const who = await d.needAdmin(c);
    const st = await loadState(c.env);
    const x = st.done.find((y) => y.id === c.p[0]);
    if (!x || !['applied', 'verified', 'ineffective'].includes(x.status)) fail(404, 'not_found', 'مفيش حاجة ترجع');
    const ok = await undo(c.env, x!, st);
    if (!ok) fail(400, 'no_undo', 'الإجراء ده مالوش رجوع (زي مسح الكاش)');
    x!.status = 'undone'; x!.note = `رجّعه ${who}`;
    await saveState(c.env, st, true);
    await AP.opsLog(c.env, who, 'brain_undo', `🧠↩️ ${FIX_AR[x!.fix.t]} «${x!.fix.target}»`, x, 'info').catch(() => undefined);
    return { ok: true };
  });
  on('POST', '/api/v2/hub/brain/issues/:id/file', async (c) => {
    const who = await d.needAdmin(c);
    const st = await loadState(c.env);
    const i = st.issues.find((y) => y.id === c.p[0]);
    if (!i) fail(404, 'not_found', 'مش موجودة');
    if (i!.url) return { ok: true, url: i!.url };
    const url = await fileIssue(c.env, i!);
    if (!url) return { ok: false, link: issueLink(c.env, i!), note: 'مفيش GITHUB_TOKEN — افتح اللينك وابعتها بنفسك' };
    i!.url = url; await saveState(c.env, st, true);
    await AP.opsLog(c.env, who, 'brain_issue', `🧠🐙 ${i!.title}`, { url }, 'info').catch(() => undefined);
    return { ok: true, url };
  });
}
