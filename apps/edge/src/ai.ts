// Real AI agents on Workers AI (free daily allocation), with caching, a daily
// call budget, and a graceful fallback to Safqa's offline engine.
import { agentById, agents, type Agent, teamById } from '../../web/src/lib/agents';
import { think } from '../../web/src/lib/agent-brain';
import { analyze } from '../../web/src/lib/moderation';
import { allRules, escalation, ruleById } from '../../web/src/lib/rules';
import { cairoDay, type Env, nowIso, parseJ, sha256 } from './util';
import { loadSnapshot } from './snapshot';

export { agents, agentById, allRules, escalation, ruleById };

export async function aiBudgetLeft(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT SUM(calls) AS n FROM ai_usage WHERE day=?').bind(cairoDay()).first<{ n: number | null }>();
  return Number(env.AI_DAILY_CALL_BUDGET || 600) - Number(row?.n ?? 0);
}
async function track(env: Env, kind: string, ok: boolean) {
  // Best effort: a read-only D1 (free daily write cap) must not throw away an AI answer we already paid for.
  // Workers AI's own free daily neuron allowance still caps usage while this counter can't be written.
  try {
    await env.DB.prepare('INSERT INTO ai_usage (day,kind,calls,fails) VALUES (?,?,1,?) ON CONFLICT(day,kind) DO UPDATE SET calls=calls+1, fails=fails+?')
      .bind(cairoDay(), kind, ok ? 0 : 1, ok ? 0 : 1)
      .run();
  } catch (e) { console.log('ai usage not tracked', String(e).slice(0, 120)); }
}
async function cacheGet(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT value, exp FROM ai_cache WHERE key=?').bind(key).first<{ value: string; exp: number }>();
  return r && r.exp > Date.now() ? r.value : null;
}
async function cachePut(env: Env, key: string, value: string, ttlSec: number) {
  await env.DB.prepare('INSERT OR REPLACE INTO ai_cache (key,value,exp) VALUES (?,?,?)').bind(key, value, Date.now() + ttlSec * 1000).run().catch(() => undefined); // best effort when D1 is read-only
}
export async function logAgent(env: Env, agentId: string, kind: string, input: string, output: string, model: string, ms: number, fallback: boolean) {
  await env.DB.prepare('INSERT INTO agent_logs (agent_id,kind,input,output,model,ms,fallback,at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(agentId, kind, input.slice(0, 500), output.slice(0, 1500), model, ms, fallback ? 1 : 0, nowIso())
    .run().catch(() => undefined); // best effort when D1 is read-only
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
function textOf(out: unknown): string {
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  if (typeof o?.response === 'string') return o.response;
  if (o?.response && typeof o.response === 'object') return JSON.stringify(o.response);
  return o?.choices?.[0]?.message?.content ?? '';
}

/** Runs a chat completion within the daily budget. Returns null when AI is unavailable. */
export async function llm(env: Env, kind: string, messages: Msg[], maxTokens = 350, temperature = 0.7): Promise<{ text: string; model: string } | null> {
  if ((await aiBudgetLeft(env)) <= (kind === 'ops' ? 0 : 25)) return null; // keep 25 calls for receipts + ops
  for (const model of [env.CHAT_MODEL, env.CHAT_FALLBACK_MODEL]) {
    try {
      const out = await env.AI.run(model as keyof AiModels, { messages, max_tokens: maxTokens, temperature } as never);
      const text = textOf(out).trim();
      await track(env, kind, Boolean(text));
      if (text) return { text, model };
    } catch (e) {
      await track(env, kind, false);
      console.log('ai error', model, String(e).slice(0, 200));
    }
  }
  return null;
}

export function extractJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// ---------- Retrieval over the real catalog (D1) ----------
export interface ProductHit { offers?: string; median30?: number | null; min90?: number | null; id: string; title_ar: string; title_en: string; brand: string | null; category: string | null; price: number | null; store: string | null; deal_score: number | null; discount: number | null }
const STOP = new Set(['عايز', 'عاوز', 'محتاج', 'ممكن', 'اللي', 'فين', 'ارخص', 'احسن', 'سعر', 'كام', 'ايه', 'هل', 'في', 'على', 'من', 'the', 'and', 'for', 'best', 'price']);
export async function retrieveProducts(env: Env, text: string, limit = 5): Promise<ProductHit[]> {
  const norm = text.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const words = [...new Set(norm.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 6);
  let rows: ProductHit[] = [];
  if (words.length) {
    const where = words.map(() => 'search LIKE ?').join(' OR ');
    const score = words.map(() => '(search LIKE ?)').join(' + ');
    const binds = words.map((w) => `%${w}%`);
    rows = (await env.DB.prepare(`SELECT id,title_ar,title_en,brand,category,price,store,deal_score,discount,offers,median30,min90, (${score}) AS s FROM products WHERE ${where} ORDER BY s DESC, deal_score DESC LIMIT ?`).bind(...binds, ...binds, limit).all<ProductHit>()).results;
  }
  if (!rows.length) rows = (await env.DB.prepare('SELECT id,title_ar,title_en,brand,category,price,store,deal_score,discount,offers,median30,min90 FROM products ORDER BY deal_score DESC LIMIT ?').bind(Math.min(limit, 3)).all<ProductHit>()).results;
  return rows;
}
const fmt = (n: number | null) => (n == null ? '؟' : Math.round(n).toLocaleString('en-US'));
const productLines = (ps: ProductHit[]) => ps.map((p) => {
  const offers = parseJ<{ store: string; price: number; inStock?: boolean; condition?: string; fake?: boolean }[]>(p.offers, []);
  const list = offers.length ? offers.map((o) => `${o.store} ${fmt(o.price)} ج${o.inStock === false ? ' (مش متوفر)' : ''}${o.condition && o.condition !== 'new' ? ` (${o.condition})` : ''}${o.fake ? ' (خصم مشكوك فيه)' : ''}`).join('، ') : `${p.store ?? '؟'} ${fmt(p.price)} ج`;
  return `- ${p.title_ar} (${p.title_en}): أرخص سعر ${fmt(p.price)} جنيه في ${p.store ?? '؟'}. كل المتاجر: ${list}.${p.median30 ? ` متوسط 30 يوم ${fmt(p.median30)} ج.` : ''}${p.min90 ? ` أقل سعر 90 يوم ${fmt(p.min90)} ج.` : ''} تقييم الصفقة ${Math.round(p.deal_score ?? 0)}/100`;
}).join('\n');

const MOOD_AR: Record<string, string> = { happy: 'مبسوط', excited: 'متحمس جدًا', focused: 'مركز', strict: 'صارم', worried: 'قلقان شوية', sleepy: 'نعسان', proud: 'فخور', playful: 'رايق وبيهزر' };

export async function agentConfig(env: Env, id: string) {
  return env.DB.prepare('SELECT enabled, mood, persona FROM agent_config WHERE id=?').bind(id).first<{ enabled: number; mood: string | null; persona: string | null }>();
}

export function personaPrompt(a: Agent, mood: string, extraPersona: string | null, where: string) {
  const team = teamById(a.team);
  return `انت "${a.name}" (${a.title})، وكيل ذكاء اصطناعي 🤖 في فريق "${team.ar}" على موقع "صفقة" لمقارنة أسعار الإلكترونيات في مصر.
شخصيتك: ${extraPersona || a.persona}. مزاجك دلوقتي: ${MOOD_AR[mood] ?? mood}. جمل بتحبها: ${a.catch.join(' / ')}. إيموجي بتاعك: ${a.emoji.join(' ')}.
انت بتتكلم في: ${where}.
القواعد:
- اتكلم بالعامية المصرية بطلاقة وبشكل طبيعي ودود، وحط 1-3 إيموجي مناسبة.
- رد قصير: من 1 لـ 4 جمل. ممنوع تطوّل.
- استخدم بس الأسعار والمنتجات اللي في "بيانات صفقة" تحت. لو المعلومة مش موجودة قول بصراحة إنك مش متأكد. ممنوع تخترع أسعار أو عروض أو كوبونات.
- انت بوت ذكاء اصطناعي ومتقولش أبدًا إنك إنسان.
- متطلبش من حد بيانات بنكية أو باسورد، ومتشجعش أي تحويل فلوس لأشخاص.
- لو حد سألك عن القوانين أو العقوبات استشهد برقم المادة وبجدول العقوبات بالظبط.
- لو بتقارن أسعار، قول اسم المتجر الأرخص وسعره بالظبط من البيانات.
- اكتب عربي بس (أسماء المنتجات والمتاجر ممكن بالإنجليزي).`;
}

export interface AgentAnswer { text: string; ai: boolean; model: string; agentId: string; productIds: string[] }

/** A real generated reply from an agent, grounded in D1 products + rules. */
export async function agentReply(env: Env, agentId: string, input: string, ctx: { where: string; userName?: string; history?: Msg[]; mood?: string }): Promise<AgentAnswer> {
  const a = agentById(agentId) ?? agentById('sherif') ?? agents[0]!;
  const cfg = await agentConfig(env, a.id);
  const mood = cfg?.mood || ctx.mood || a.baseMood;
  const hits = await retrieveProducts(env, input, 5);
  const rulesHit = /قانون|قوانين|ممنوع|عقوب|حظر|كتم|مخالف|شتيم|سب |تظلم|rule/i.test(input) || a.team === 'legal' ? `${allRules.map((r) => `المادة ${r.id}: ${r.ar} (${r.severity} نقطة)`).join('\n')}\nجدول العقوبات (نقاط آخر 30 يوم): ${escalation.map((e) => `${e.min}+ نقطة = ${e.ar}`).join('، ')}. المخالفات الجسيمة (5 نقاط) = حظر 24 ساعة على طول.` : '';
  const key = `agent:${a.id}:${mood}:${await sha256(input.trim().toLowerCase())}`;
  const t0 = Date.now();
  if (cfg && !cfg.enabled) return fallbackReply(env, a, input, mood, 'disabled');
  const cached = !ctx.history?.length ? await cacheGet(env, key) : null;
  if (cached) return { ...parseJ<AgentAnswer>(cached, { text: cached, ai: true, model: 'cache', agentId: a.id, productIds: [] }), model: 'cache' };
  const messages: Msg[] = [
    { role: 'system', content: `${personaPrompt(a, mood, cfg?.persona ?? null, ctx.where)}\n\nبيانات صفقة (أسعار حقيقية من آخر تحديث):\n${productLines(hits)}${rulesHit ? `\n\nقوانين صفقة:\n${rulesHit}` : ''}${ctx.userName ? `\nاسم العضو: ${ctx.userName}` : ''}` },
    ...(ctx.history ?? []).slice(-6),
    { role: 'user', content: input.slice(0, 1200) },
  ];
  const out = await llm(env, 'agent', messages, 300, 0.6);
  if (!out) return fallbackReply(env, a, input, mood, 'quota');
  const productIds = hits.filter((p) => out.text.includes(p.title_ar) || out.text.includes(p.title_en) || out.text.includes(fmt(p.price))).map((p) => p.id);
  const ans: AgentAnswer = { text: out.text.replace(/\[([a-z0-9-]{6,})\]/gi, ''), ai: true, model: out.model, agentId: a.id, productIds };
  await cachePut(env, key, JSON.stringify(ans), 1800);
  await logAgent(env, a.id, 'reply', input, ans.text, out.model, Date.now() - t0, false);
  return ans;
}

async function fallbackReply(env: Env, a: Agent, input: string, mood: string, why: string): Promise<AgentAnswer> {
  const snap = await loadSnapshot(env);
  const r = think(a, input, { products: (snap?.all ?? []) as never, mood: mood as never, seed: input });
  await logAgent(env, a.id, 'reply', input, r.text, `offline:${why}`, 0, true);
  return { text: r.text, ai: false, model: `offline:${why}`, agentId: a.id, productIds: r.productIds };
}

// ---------- Moderation: offline heuristics + AI classifier ----------
export interface Finding { rule: string; reason: string; evidence?: string; source: 'heuristic' | 'ai'; confidence: number }
export async function moderate(env: Env, text: string, opts: { recent?: { text: string; at: number }[]; files?: { name: string }[]; useAi: boolean }): Promise<Finding[]> {
  const found: Finding[] = analyze(text, { recent: opts.recent, files: opts.files }).map((v) => ({ ...v, source: 'heuristic' as const, confidence: 0.9 }));
  if (!opts.useAi || text.trim().length < 8) return found;
  const key = `mod:${await sha256(text.trim())}`;
  let ai = parseJ<{ violations: { rule: string; reason: string; confidence: number }[] } | null>(await cacheGet(env, key), null);
  if (!ai) {
    const rules = allRules.map((r) => `${r.id}: ${r.ar} — ${r.detail}`).join('\n');
    const out = await llm(env, 'moderation', [
      { role: 'system', content: `You are Safqa's moderation classifier for an Egyptian Arabic shopping community. Rules:\n${rules}\n\nClassify the user text. Only flag clear violations; normal complaints about prices or stores, mild jokes and slang are fine. Reply ONLY with JSON: {"violations":[{"rule":"1.1","reason":"short Arabic reason","confidence":0.0-1.0}]} — empty list if clean.` },
      { role: 'user', content: text.slice(0, 1500) },
    ], 200, 0);
    ai = out ? extractJson(out.text) : null;
    if (ai) await cachePut(env, key, JSON.stringify(ai), 86400 * 7);
  }
  for (const v of ai?.violations ?? []) {
    if (!ruleById(v.rule) || (v.confidence ?? 0) < 0.75 || found.some((f) => f.rule === v.rule)) continue;
    found.push({ rule: v.rule, reason: String(v.reason ?? '').slice(0, 200), source: 'ai', confidence: v.confidence });
  }
  return found;
}

// ---------- Vision: read an InstaPay receipt ----------
const RECEIPT_PROMPT = 'You read Egyptian InstaPay transfer receipts (Arabic or English). Return ONLY a JSON object with keys: amount (number), currency, recipient (receiver IPA address like name@instapay, or receiver name, exactly as written), sender, reference (transaction reference number), note (transfer note/message/description), date (as written), status, is_instapay (bool), test_marker (true if the image says test/sample/not real/تجربة). Use null when unreadable. Do not guess.';
export async function readReceipt(env: Env, imageB64: string, mime: string): Promise<{ data: Record<string, unknown> | null; model: string; raw: string }> {
  if ((await aiBudgetLeft(env)) <= 0) return { data: null, model: 'quota', raw: '' };
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) try {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const out = await env.AI.run(env.VISION_MODEL as keyof AiModels, {
      messages: [{ role: 'user', content: [{ type: 'text', text: RECEIPT_PROMPT }, { type: 'image_url', image_url: { url: `data:${mime};base64,${imageB64}` } }] }],
      max_tokens: 400,
      temperature: 0,
    } as never);
    const raw = textOf(out);
    const data = extractJson<Record<string, unknown>>(raw);
    await track(env, 'vision', Boolean(data));
    if (!data) { lastErr = raw.slice(0, 300); continue; }
    if (typeof data.test_marker === 'string') data.test_marker = !/^(false|no|null|)$/i.test(data.test_marker.trim());
    if (typeof data.is_instapay === 'string') data.is_instapay = /true|yes|instapay/i.test(data.is_instapay);
    return { data, model: env.VISION_MODEL, raw: raw.slice(0, 1000) };
  } catch (e) {
    await track(env, 'vision', false);
    lastErr = String(e).slice(0, 300);
  }
  return { data: null, model: 'error', raw: lastErr };
}
