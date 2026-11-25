// Smart notifications (opt-in only) + deal-intelligence endpoints.
// Interest model per user = watchlist + viewed products (auto-tracked with the price at view time) + searches
// + categories/brands browsed (synced from the device when signed in). Each tick ranks fresh real drops against
// it, respects quiet hours (Cairo), a daily cap and dedupe, writes one catchy-but-honest AI headline per drop
// (Workers AI, shared daily budget), and delivers in-app (alerts) + Telegram when linked.
// Email: needs a mail provider/domain we don't have on the free stack, so it is not offered (no fake toggle).
import { sget, sput } from '../infra/state';
import * as Budget from '../infra/budget';
import { llm } from '../ai';
import { enqueue, tgEnabled } from '../telegram';
import type { Env } from '../util';
import { fail, nowIso, parseJ, rateLimit } from '../util';
import { cached, type On, storeInfo, toCard } from './api';
import { health } from './ingest';
import { fakeDiscount, optimizeBasket, priceWars, SEASONS, seasonAdvice, type OfferLite } from './insights';

// biome-ignore lint/suspicious/noExplicitAny: D1 rows.
type Row = Record<string, any>;
export interface Interests { cats?: Record<string, number>; brands?: Record<string, number>; viewed?: [string, number, string][]; searches?: string[] }
const cairoHour = (d: Date) => (d.getUTCHours() + 2) % 24;
const inQuiet = (h: number, a: number, b: number) => (a === b ? false : a < b ? h >= a && h < b : h >= a || h < b);

export function scoreForUser(i: Interests, r: { id: string; category?: string | null; brand?: string | null; price: number; pct: number; heat?: number; title?: string }): { score: number; why: string } {
  let s = Math.min(30, r.pct * 2) + Math.min(15, (r.heat ?? 0) / 8);
  let why = '';
  const v = (i.viewed ?? []).find((x) => x[0] === r.id);
  if (v) { s += 60; why = v[1] > r.price ? `شفته بـ ${Math.round(v[1])} وبقى ${Math.round(r.price)}` : 'منتج اتفرجت عليه'; }
  const catW = r.category ? (i.cats?.[r.category] ?? 0) : 0;
  if (catW) { s += Math.min(25, catW * 4); why ||= 'من الأقسام اللي بتحبها'; }
  const bw = r.brand ? (i.brands?.[r.brand.toLowerCase()] ?? 0) : 0;
  if (bw) { s += Math.min(20, bw * 4); why ||= `من ماركة ${r.brand}`; }
  const t = (r.title ?? '').toLowerCase();
  if ((i.searches ?? []).some((q) => q.length > 2 && t.includes(q.toLowerCase()))) { s += 25; why ||= 'زي حاجة دورت عليها'; }
  return { score: Math.round(s), why };
}

async function headlines(env: Env, drops: Row[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const need: Row[] = [];
  for (const d of drops) { const h = await sget(env, `head:${d.dropId}`); if (h) out[d.dropId] = h; else need.push(d); }
  if (need.length) {
    const r = await llm(env, 'headline', [
      { role: 'system', content: 'اكتب لكل منتج عنوان تنبيه واحد قصير جدًا بالعامية المصرية، جذاب بس صادق 100% (ممنوع "آخر قطعة" أو أي مبالغة)، بإيموجي واحد. رد JSON بس: {"h":["..."]} بنفس الترتيب.' },
      { role: 'user', content: need.slice(0, 8).map((d) => `${d.title}: من ${Math.round(d.old)} لـ ${Math.round(d.new)} ج (-${Math.round(d.pct)}%)`).join('\n') },
    ], 300, 0.8).catch(() => null);
    const h = parseJ<{ h?: string[] }>(r?.text.match(/\{[\s\S]*\}/)?.[0], {}).h ?? [];
    for (const [i, d] of need.slice(0, 8).entries()) {
      const line = (h[i] || `📉 ${String(d.title).slice(0, 50)} نزل ${Math.round(d.pct)}%`).slice(0, 120);
      out[d.dropId] = line;
      await sput(env, `head:${d.dropId}`, line, 7 * 86400);
    }
  }
  return out;
}

/** One smart-notification tick (runs on the ingestion cron). */
export async function smartTick(env: Env, d: Date) {
  if (!(await Budget.allow(env, 40, Budget.SOFT_CAP))) return { skipped: 'write budget' };
  const since = (await sget(env, 'smart:since')) ?? new Date(Date.now() - 20 * 60_000).toISOString();
  const now = nowIso();
  const hour = cairoHour(d);
  const users = (await env.DB.prepare(`SELECT p.*, t.chat_id FROM notif_prefs p LEFT JOIN tg_links t ON t.user_id=p.user_id AND t.subscribed=1 WHERE p.opted_in=1 AND p.mode<>'off' LIMIT 200`).all<Row>()).results;
  if (!users.length) { await sput(env, 'smart:since', now); return { users: 0 }; }
  let sent = 0;
  // Instant: fresh real drops.
  const drops = (await env.DB.prepare(`SELECT d.id dropId, d.product_id id, d.old, d.new, d.pct, d.store, d.at, c.title, c.title_ar, c.category, c.brand, c.heat, c.price
    FROM drops d JOIN catalog c ON c.id=d.product_id WHERE d.at > ? ORDER BY d.pct DESC LIMIT 40`).bind(since).all<Row>()).results;
  const instant = users.filter((u) => u.mode === 'instant' && !inQuiet(hour, u.quiet_start, u.quiet_end));
  if (drops.length && instant.length) {
    const heads = await headlines(env, drops.map((x) => ({ ...x, title: x.title_ar || x.title })));
    for (const u of instant) {
      const today = await env.DB.prepare('SELECT COUNT(*) n FROM notif_sent WHERE user_id=? AND at > ?').bind(u.user_id, new Date(Date.now() - 86400_000).toISOString()).first<{ n: number }>();
      let budget = Math.max(0, u.max_per_day - (today?.n ?? 0));
      if (!budget) continue;
      const ints = parseJ<Interests>(u.interests, {});
      const ranked = drops.filter((x) => x.pct >= u.min_drop).map((x) => ({ x, ...scoreForUser(ints, { ...x, price: x.new, title: x.title }) })).filter((r) => r.score >= 45).sort((a, b) => b.score - a.score);
      for (const r of ranked) {
        if (!budget) break;
        const dup = await env.DB.prepare('INSERT OR IGNORE INTO notif_sent (user_id, product_id, kind, at) VALUES (?,?,?,?)').bind(u.user_id, r.x.id, 'drop', now).run();
        if (!dup.meta.changes) continue;
        const title = heads[r.x.dropId] ?? `📉 نزل ${Math.round(r.x.pct)}%`;
        const body = `${String(r.x.title_ar || r.x.title).slice(0, 90)} — من ${Math.round(r.x.old)} لـ ${Math.round(r.x.new)} ج.م في ${storeInfo(r.x.store).nameAr}${r.why ? ` · ${r.why}` : ''}`;
        await env.DB.prepare(`INSERT INTO alerts (id,user_id,type,title,body,product_id,read,created_at) VALUES ('al_'||lower(hex(randomblob(8))),?,?,?,?,?,0,?)`).bind(u.user_id, 'smart_drop', title, body, r.x.id, now).run();
        if (u.chat_id && tgEnabled(env)) await enqueue(env, u.chat_id, `${title}\n\n${body}\n\n<i>🤖 تنبيه ذكي من صفقة · سعر حقيقي</i>`, [[{ text: '🛒 افتح العرض', url: `${env.SITE_URL}/p/${r.x.id}` }]]);
        budget--; sent++;
      }
    }
  }
  // Digest: once a day at the user's hour (outside quiet hours).
  const digestUsers = users.filter((u) => u.mode === 'digest' && hour === u.digest_hour && (!u.last_digest || Date.now() - Date.parse(u.last_digest) > 20 * 3600_000)).slice(0, 25);
  if (digestUsers.length) {
    const pool = (await env.DB.prepare(`SELECT id, title, title_ar, category, brand, price, heat, drop_pct FROM catalog WHERE in_stock=1 AND (drop_at > ? OR heat > 30) ORDER BY heat DESC LIMIT 150`).bind(new Date(Date.now() - 86400_000).toISOString()).all<Row>()).results;
    for (const u of digestUsers) {
      const ints = parseJ<Interests>(u.interests, {});
      const top = pool.map((x) => ({ x, ...scoreForUser(ints, { ...x, pct: x.drop_pct ?? 0, title: x.title }) })).sort((a, b) => b.score - a.score).slice(0, 5);
      if (!top.length) continue;
      const lines = top.map((t, i) => `${i + 1}. ${String(t.x.title_ar || t.x.title).slice(0, 60)} — ${Math.round(t.x.price)} ج${t.why ? ` (${t.why})` : ''}`).join('\n');
      await env.DB.prepare(`INSERT INTO alerts (id,user_id,type,title,body,product_id,read,created_at) VALUES ('al_'||lower(hex(randomblob(8))),?,?,?,?,?,0,?)`).bind(u.user_id, 'smart_digest', '☀️ صفقاتك المختارة النهارده', lines, top[0]!.x.id, now).run();
      if (u.chat_id && tgEnabled(env)) await enqueue(env, u.chat_id, `☀️ <b>صفقاتك المختارة النهارده</b>\n\n${lines}\n\n<i>مرتبة على ذوقك — من اللي شفته ودوّرت عليه</i>`, [[{ text: '🔥 كل الصفقات', url: `${env.SITE_URL}/hot` }]]);
      await env.DB.prepare('UPDATE notif_prefs SET last_digest=? WHERE user_id=?').bind(now, u.user_id).run();
      sent++;
    }
  }
  await sput(env, 'smart:since', now);
  return { users: users.length, drops: drops.length, sent };
}

const DEFAULT_PREFS = { opted_in: 0, mode: 'digest', quiet_start: 23, quiet_end: 9, digest_hour: 10, min_drop: 5, max_per_day: 3, auto_track: 1 };
export function registerSmart(on: On, authenticate: (env: Env, req: Request) => Promise<{ user: { id: string } } | null>) {
  const me = async (env: Env, req: Request) => { const a = await authenticate(env, req).catch(() => null); if (!a) fail(401, 'auth', 'سجّل دخول الأول'); return a!.user.id; };
  on('GET', '/api/v5/me/notify', async (c) => {
    const uid = await me(c.env, c.req);
    const r = await c.env.DB.prepare('SELECT * FROM notif_prefs WHERE user_id=?').bind(uid).first<Row>();
    const tg = await c.env.DB.prepare('SELECT chat_id FROM tg_links WHERE user_id=? AND subscribed=1').bind(uid).first();
    const { interests, ...rest } = r ?? { ...DEFAULT_PREFS, interests: '{}' };
    const ints = parseJ<Interests>(interests, {});
    return { prefs: { ...DEFAULT_PREFS, ...rest }, telegram: Boolean(tg), email: false, interests: { cats: Object.keys(ints.cats ?? {}).length, brands: Object.keys(ints.brands ?? {}).length, viewed: (ints.viewed ?? []).length, searches: (ints.searches ?? []).length } };
  });
  on('PUT', '/api/v5/me/notify', async (c) => {
    const uid = await me(c.env, c.req);
    const b = (await c.req.json().catch(() => ({}))) as Row;
    const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
    const p = { opted_in: b.opted_in ? 1 : 0, mode: ['instant', 'digest', 'off'].includes(b.mode) ? b.mode : 'digest', quiet_start: clamp(b.quiet_start, 0, 23, 23), quiet_end: clamp(b.quiet_end, 0, 23, 9), digest_hour: clamp(b.digest_hour, 0, 23, 10), min_drop: clamp(b.min_drop, 1, 50, 5), max_per_day: clamp(b.max_per_day, 1, 10, 3), auto_track: b.auto_track === false || b.auto_track === 0 ? 0 : 1 };
    await c.env.DB.prepare(`INSERT INTO notif_prefs (user_id,opted_in,mode,quiet_start,quiet_end,digest_hour,min_drop,max_per_day,auto_track,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET opted_in=excluded.opted_in, mode=excluded.mode, quiet_start=excluded.quiet_start, quiet_end=excluded.quiet_end, digest_hour=excluded.digest_hour, min_drop=excluded.min_drop, max_per_day=excluded.max_per_day, auto_track=excluded.auto_track, updated_at=excluded.updated_at`)
      .bind(uid, p.opted_in, p.mode, p.quiet_start, p.quiet_end, p.digest_hour, p.min_drop, p.max_per_day, p.auto_track, nowIso()).run();
    return { ok: true, prefs: p };
  });
  on('POST', '/api/v5/me/interests', async (c) => {
    const uid = await me(c.env, c.req);
    if (!(await rateLimit(c.env, `ints:${uid}`, 30, 3600))) fail(429, 'slow_down', 'براحة شوية');
    const b = (await c.req.json().catch(() => ({}))) as Interests;
    const r = await c.env.DB.prepare('SELECT interests, auto_track FROM notif_prefs WHERE user_id=?').bind(uid).first<Row>();
    const cur = parseJ<Interests>(r?.interests, {});
    const topN = (o: Record<string, number> = {}, n: number) => Object.fromEntries(Object.entries(o).filter(([k, v]) => k.length < 40 && Number.isFinite(v)).sort((a, b) => b[1] - a[1]).slice(0, n));
    const merged: Interests = {
      cats: topN({ ...cur.cats, ...b.cats }, 15), brands: topN({ ...cur.brands, ...b.brands }, 20),
      viewed: (r?.auto_track === 0 ? [] : [...(b.viewed ?? []), ...(cur.viewed ?? [])]).filter((v) => Array.isArray(v) && /^p[0-9a-f]{20}$/.test(String(v[0]))).filter((v, i, a) => a.findIndex((x) => x[0] === v[0]) === i).slice(0, 60),
      searches: [...new Set([...(b.searches ?? []), ...(cur.searches ?? [])].map((s) => String(s).slice(0, 40)))].slice(0, 20),
    };
    await c.env.DB.prepare(`INSERT INTO notif_prefs (user_id, interests, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET interests=excluded.interests, updated_at=excluded.updated_at`).bind(uid, JSON.stringify(merged), nowIso()).run();
    return { ok: true };
  });
  // Deal intelligence.
  on('GET', '/api/v5/health', (c) => cached(c.req, 60, () => health(c.env), c.exec));
  on('GET', '/api/v5/seasons', (c) => cached(c.req, 3600, async () => ({ seasons: SEASONS, now: seasonAdvice(Date.now(), c.url.searchParams.get('cat')) }), c.exec));
  on('GET', '/api/v5/radar/fake', (c) => cached(c.req, 600, async () => {
    const rows = (await c.env.DB.prepare('SELECT * FROM catalog WHERE list_price > price * 1.1 AND in_stock=1 ORDER BY heat DESC LIMIT 400').all<Row>()).results;
    const items = rows.map((r) => { const o = parseJ<OfferLite[]>(r.offers, []).find((x) => x.p === r.price); return { r, f: fakeDiscount(o ?? null) }; }).filter((x) => x.f.flag).slice(0, 40);
    return { scanned: rows.length, items: items.map((x) => ({ ...toCard(x.r), fake: x.f })), note: 'Only products whose store shows a "was" price; checked against the prices we actually recorded.' };
  }, c.exec));
  on('GET', '/api/v5/wars', (c) => cached(c.req, 600, async () => {
    const drops = (await c.env.DB.prepare('SELECT product_id, store, at, new FROM drops WHERE at > ? ORDER BY at DESC LIMIT 2000').bind(new Date(Date.now() - 14 * 86400_000).toISOString()).all<Row>()).results as { product_id: string; store: string; at: string; new: number }[];
    const wars = priceWars(drops).slice(0, 30);
    if (!wars.length) return { items: [] };
    const rows = (await c.env.DB.prepare(`SELECT * FROM catalog WHERE id IN (${wars.map(() => '?').join(',')})`).bind(...wars.map((w) => w.id)).all<Row>()).results;
    return { items: wars.map((w) => { const r = rows.find((x) => x.id === w.id); return r ? { ...toCard(r), war: w.stores.map((s) => ({ ...storeInfo(s.store), drops: s.drops })) } : null; }).filter(Boolean) };
  }, c.exec));
  on('POST', '/api/v5/basket', async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { ids?: string[]; fee?: number; fees?: Record<string, number> };
    const ids = [...new Set((b.ids ?? []).filter((x) => /^p[0-9a-f]{20}$/.test(x)))].slice(0, 15);
    if (!ids.length) fail(400, 'empty', 'ضيف منتجات الأول');
    const rows = (await c.env.DB.prepare(`SELECT * FROM catalog WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Row>()).results;
    const items = rows.map((r) => ({ id: r.id as string, offers: parseJ<OfferLite[]>(r.offers, []).filter((o) => o.src !== 'user').map((o) => ({ s: o.s, p: o.p, k: o.k })) }));
    const def = Math.max(0, Math.min(500, Number(b.fee ?? 60)));
    const res = optimizeBasket(items, (s) => Number(b.fees?.[s] ?? def));
    return { ...res, assumedFee: def, products: rows.map(toCard), stores: [...new Set(items.flatMap((i) => i.offers.map((o) => o.s)))].map(storeInfo) };
  });
}
