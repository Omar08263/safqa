// Security AI agents for the master AI (العقل الرئيسي / brain team «الأمن») and the Hub «🛡️ الأمان».
// Defense only: they read the live attack feed (RL_DO shards), classify, detect anomalies,
// triage honeypot hits and draft fixes / GitHub issue drafts. They never contact an attacker,
// never ban by themselves (bans come from the deterministic strike ledger) and never file
// an issue on their own — drafts go to the brain, which waits for the owner.
// Budget: rules first; at most ONE Workers AI call per agent run and SEC_AI_DAILY per day total.
import { llm, extractJson } from '../ai';
import type { Env } from '../util';
import { liveView, type FeedItem, type Offender } from './defense';

export const SEC_AGENTS = [
  { id: 'sec_analyst', name: 'محلّل التهديدات', emoji: '🧠', role: 'بيصنّف الهجمات اللي داخلة (SQLi/XSS/فحص/فخاخ…) ويكشف الحملات', color: '#dc2626', every: 60 },
  { id: 'sec_anomaly', name: 'راصد الشذوذ', emoji: '📈', role: 'بيقارن الحركة بالمعدل الطبيعي ويكشف أي قفزة غريبة', color: '#f97316', every: 30 },
  { id: 'sec_trap', name: 'صيّاد الفخاخ', emoji: '🪤', role: 'بيفرز اللي وقعوا في الفخاخ: بوت عشوائي ولا هجوم مقصود', color: '#a855f7', every: 60 },
  { id: 'sec_patch', name: 'مستشار الترقيع', emoji: '🩹', role: 'بيكتب اقتراحات إصلاح ومسودات GitHub issue لأي محاولة استغلال جديدة', color: '#0891b2', every: 120 },
] as const;
export type SecAgentId = (typeof SEC_AGENTS)[number]['id'];
export const SEC_AI_DAILY = 12;

// ---------- pure classifiers (unit-tested) ----------
export const CLASS_AR: Record<string, string> = {
  sqli: 'حقن SQL', xss: 'XSS', traversal: 'Path traversal', injection: 'حقن أوامر / Log4Shell / SSRF', scanner: 'أداة فحص', trap: 'فخ / مسار وهمي',
  'form-trap': 'بوت فورم', 'credential-stuffing': 'Credential stuffing', 'rapid-404': 'لف على المسارات', method: 'Method غريب', other: 'أخرى',
};
export function classOf(reason: string): string {
  const r = reason.replace(/-hdr$/, '');
  if (r.startsWith('trap:') || r.startsWith('site-trap:')) return 'trap';
  if (r.startsWith('form-trap')) return 'form-trap';
  if (r === 'scanner-ua') return 'scanner';
  if (r.startsWith('method:')) return 'method';
  return CLASS_AR[r] ? r : 'other';
}
export function classify(feed: FeedItem[]) {
  const by: Record<string, { n: number; clients: Set<string>; paths: Set<string> }> = {};
  for (const f of feed) {
    const c = classOf(f.reason);
    const e = (by[c] ??= { n: 0, clients: new Set(), paths: new Set() });
    e.n++; e.clients.add(f.client); if (f.path) e.paths.add(f.path);
  }
  const classes = Object.entries(by).map(([id, e]) => ({ id, ar: CLASS_AR[id] ?? id, n: e.n, clients: e.clients.size, paths: [...e.paths].slice(0, 5) })).sort((a, b) => b.n - a.n);
  // A "campaign": the same class from ≥3 different clients (distributed scan / botnet).
  const campaigns = classes.filter((c) => c.clients >= 3).map((c) => `${c.ar} من ${c.clients} مصدر`);
  return { classes, campaigns };
}
export function anomaly(hourCounts: number[], current: number) {
  const base = hourCounts.length ? hourCounts.reduce((a, b) => a + b, 0) / hourCounts.length : 0;
  const sd = hourCounts.length > 1 ? Math.sqrt(hourCounts.reduce((a, b) => a + (b - base) ** 2, 0) / (hourCounts.length - 1)) : 0;
  const z = sd > 0 ? (current - base) / sd : current > base * 3 + 10 ? 9 : 0;
  const level = current >= 20 && (z >= 4 || current > base * 5 + 20) ? 'crit' : current >= 10 && (z >= 2.5 || current > base * 3 + 10) ? 'warn' : 'ok';
  return { base: Math.round(base * 10) / 10, sd: Math.round(sd * 10) / 10, z: Math.round(z * 10) / 10, current, level };
}
export function triage(offenders: Offender[]) {
  return offenders.filter((o) => o.reasons.some((r) => r.includes('trap'))).map((o) => {
    const kinds = new Set(o.reasons.filter((r) => r.includes('trap')));
    const targeted = o.reasons.some((r) => /fake-admin-api|form-trap|robots-decoy|credential/.test(r)) || kinds.size >= 3 || o.reasons.some((r) => /sqli|xss|injection|traversal/.test(r));
    return { client: o.client, verdict: targeted ? 'targeted' : 'bot-scan', ar: targeted ? 'هجوم مقصود علينا' : 'بوت فحص عشوائي', bans: o.bans, hits: o.hits, until: o.until, reasons: o.reasons, ua: o.ua, paths: o.paths };
  }).sort((a, b) => (a.verdict === b.verdict ? b.hits - a.hits : a.verdict === 'targeted' ? -1 : 1));
}
/** Fix advice per attack class against a REAL route (not a trap): what to check, in code terms. */
export const ADVICE: Record<string, string> = {
  sqli: 'Confirm every D1 query on this route uses prepare().bind() placeholders (no string-built SQL); add a zod/str() length cap on the parameter.',
  xss: 'Make sure the value is never rendered with innerHTML/dangerouslySetInnerHTML; escape on output; CSP already blocks inline script.',
  traversal: 'Never join user input into R2/KV keys or file paths without a strict allowlist regex; reject "..", "%2e" and backslashes.',
  injection: 'No shell exists on Workers, but check outbound fetch() targets: only allowlisted hosts, never a user-supplied URL to internal/metadata IPs.',
};
export function patchDrafts(feed: FeedItem[], known: string[]) {
  const out: { key: string; cls: string; path: string; n: number; title: string; body: string }[] = [];
  const seen = new Map<string, { n: number; cls: string; path: string; clients: Set<string> }>();
  for (const f of feed) {
    const cls = classOf(f.reason);
    if (!ADVICE[cls] || !f.path || !f.path.startsWith('/api/')) continue;
    const route = f.path.replace(/\/(?=[0-9a-z_-]*\d)[0-9a-z_-]{8,}(?=\/|$)/gi, '/:id').slice(0, 80);
    const key = `${cls}:${route}`;
    const e = seen.get(key) ?? { n: 0, cls, path: route, clients: new Set<string>() };
    e.n++; e.clients.add(f.client); seen.set(key, e);
  }
  for (const [key, e] of seen) {
    if (known.includes(key)) continue;
    out.push({ key, cls: e.cls, path: e.path, n: e.n,
      title: `[security] ${CLASS_AR[e.cls]} attempts on ${e.path}`,
      body: `The guard blocked ${e.n} ${e.cls.toUpperCase()} attempt(s) from ${e.clients.size} client(s) on \`${e.path}\` (blocked at the edge, no impact observed).\n\nHardening checklist:\n- ${ADVICE[e.cls]}\n- Add a regression test with the blocked payload class.\n- Keep the route behind auth if it does not need to be public.\n\n_Drafted by مستشار الترقيع (Safqa security agents). Defense-only; no attacker systems were contacted._` });
  }
  return out.slice(0, 3);
}

// ---------- state (one small KV doc; one write per agent run) ----------
interface AgentOut { at: number; ok: boolean; note: string; data?: unknown; ai?: string | null }
interface State { day: string; aiUsed: number; hours: { h: number; n: number }[]; known: string[]; drafts: { key: string; title: string; body: string; at: number }[]; out: Partial<Record<SecAgentId, AgentOut>> }
const KEY = 'sec:agents';
let memo: { at: number; s: State } | null = null;
async function load(env: Env): Promise<State> {
  if (memo && Date.now() - memo.at < 30_000) return memo.s;
  const s = ((await env.KV.get(KEY, 'json').catch(() => null)) as State | null) ?? { day: '', aiUsed: 0, hours: [], known: [], drafts: [], out: {} };
  const day = new Date().toISOString().slice(0, 10);
  if (s.day !== day) { s.day = day; s.aiUsed = 0; }
  memo = { at: Date.now(), s };
  return s;
}
async function save(env: Env, s: State) { memo = { at: Date.now(), s }; await env.KV.put(KEY, JSON.stringify(s)).catch(() => undefined); }

async function aiNote(env: Env, s: State, prompt: string): Promise<string | null> {
  if (s.aiUsed >= SEC_AI_DAILY) return null;
  s.aiUsed++;
  const r = await llm(env, 'ops', [
    { role: 'system', content: 'You are a defensive security analyst for an Egyptian price-comparison site. Reply in short Egyptian Arabic (max 3 lines). Defense only: suggest detection, blocking and hardening on our own systems; never suggest contacting or attacking anyone.' },
    { role: 'user', content: prompt.slice(0, 2500) },
  ], 180, 0.3).catch(() => null);
  return r?.text?.slice(0, 600) ?? null;
}

export async function runOne(env: Env, id: string, manual = false): Promise<{ ok: boolean; note: string; xp?: number }> {
  if (!SEC_AGENTS.some((a) => a.id === id)) return { ok: false, note: 'unknown agent' };
  const s = await load(env);
  const { feed, offenders } = await liveView(env);
  const hourAgo = Date.now() - 3600_000;
  const lastHour = feed.filter((f) => f.at > hourAgo);
  let out: AgentOut;
  if (id === 'sec_analyst') {
    const c = classify(lastHour);
    const ai = c.classes.length && (manual || c.campaigns.length) ? await aiNote(env, s, `Attack classes in the last hour: ${JSON.stringify(c.classes.map(({ id, n, clients, paths }) => ({ id, n, clients, paths })))}. Campaigns: ${c.campaigns.join('; ') || 'none'}. Summarize the threat and which existing defense handled it.`) : null;
    out = { at: Date.now(), ok: true, note: c.classes.length ? `${lastHour.length} محاولة · ${c.classes.slice(0, 3).map((x) => `${x.ar} ${x.n}`).join(' · ')}${c.campaigns.length ? ` · حملة: ${c.campaigns[0]}` : ''}` : 'هادي — مفيش هجمات في آخر ساعة', data: c, ai };
  } else if (id === 'sec_anomaly') {
    const h = Math.floor(Date.now() / 3600_000);
    const hist = s.hours.filter((x) => x.h < h && x.h >= h - 48).map((x) => x.n);
    const a = anomaly(hist, lastHour.length);
    s.hours = [...s.hours.filter((x) => x.h !== h && x.h >= h - 48), { h, n: lastHour.length }];
    const newBans = offenders.filter((o) => o.until > Date.now() && o.last > hourAgo).length;
    const ai = a.level === 'crit' ? await aiNote(env, s, `Attack volume anomaly: ${JSON.stringify(a)}, active bans ${newBans}. Top reasons: ${[...new Set(lastHour.map((f) => f.reason))].slice(0, 8).join(', ')}. What should the owner watch?`) : null;
    out = { at: Date.now(), ok: true, note: a.level === 'ok' ? `طبيعي (${a.current}/ساعة، المعتاد ${a.base})` : `${a.level === 'crit' ? '🔴 قفزة خطيرة' : '🟠 قفزة'}: ${a.current}/ساعة مقابل ${a.base} (z=${a.z}) · ${newBans} محظور`, data: { ...a, activeBans: newBans }, ai };
  } else if (id === 'sec_trap') {
    const t = triage(offenders);
    const targeted = t.filter((x) => x.verdict === 'targeted');
    const ai = targeted.length && manual ? await aiNote(env, s, `Honeypot triage: ${JSON.stringify(targeted.slice(0, 5).map(({ verdict, reasons, paths, ua, bans }) => ({ verdict, reasons, paths, ua, bans })))}. Is this a targeted attacker? Which extra decoys or blocks help?`) : null;
    out = { at: Date.now(), ok: true, note: t.length ? `${t.length} وقعوا في الفخ · ${targeted.length} مقصود · ${t.length - targeted.length} بوت عشوائي — كلهم محظورين ومتبطّأين` : 'مفيش حد وقع في الفخاخ لسه', data: t.slice(0, 15), ai };
  } else {
    const drafts = patchDrafts(feed, s.known);
    for (const d of drafts) { s.known = [...s.known, d.key].slice(-200); s.drafts = [{ key: d.key, title: d.title, body: d.body, at: Date.now() }, ...s.drafts].slice(0, 20); }
    const ai = drafts.length ? await aiNote(env, s, `New exploit attempts blocked at the edge: ${drafts.map((d) => `${d.cls} on ${d.path} ×${d.n}`).join('; ')}. Give the developer a one-paragraph hardening plan.`) : null;
    out = { at: Date.now(), ok: true, note: drafts.length ? `${drafts.length} مسودة إصلاح/issue جديدة — مستنية موافقتك في العقل الرئيسي` : 'مفيش ثغرات جديدة محتاجة ترقيع', data: { drafts: s.drafts.slice(0, 8) }, ai };
  }
  s.out[id as SecAgentId] = out;
  await save(env, s);
  return { ok: out.ok, note: out.note, xp: 1 };
}

/** For the Hub page. */
export async function agentsView(env: Env) {
  const s = await load(env);
  return { aiUsed: s.aiUsed, aiDaily: SEC_AI_DAILY, list: SEC_AGENTS.map((a) => ({ ...a, last: s.out[a.id] ?? null })) };
}
/** For the brain's sense(): findings + issue drafts of the security team. */
export async function brainSignals(env: Env) {
  const s = await load(env);
  const an = s.out.sec_anomaly?.data as { level?: string; current?: number; base?: number } | undefined;
  return { anomaly: an?.level ?? 'ok', perHour: an?.current ?? 0, base: an?.base ?? 0, drafts: s.drafts.filter((d) => d.at > Date.now() - 7 * 86400_000).slice(0, 3) };
}
