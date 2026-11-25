// Safqa ingestion agents (Worker cron, free-tier sized).
//  • Feed poller: Shopify storefront feeds are newest-first, so page 1 of one store per run catches new arrivals
//    within ~30 min; a rotating "deep" page sweeps every product's price about every 12 h.
//  • Adaptive recrawl scheduler: watched / hot / volatile / recently viewed products get short intervals.
//  • Self-healing extractor: when a page has no JSON-LD, Workers AI reads a small text excerpt once, and the CSS
//    class that held the price is remembered per host so later reads need no AI.
// Honest bot identity, robots.txt respected, stops on 403/429. No evasion, ever.
import { sget, sput } from '../infra/state';
import * as Budget from '../infra/budget';
import type { Env } from '../util';
import { nowIso, parseJ } from '../util';
import { guessBrand, matchKey, normAr, plausibleEgp, productId, type Extracted } from './core';
import { type Offer, refreshProduct, robotsOk, saveOffers, UA, upsertOffer } from './api';

// biome-ignore lint/suspicious/noExplicitAny: D1 rows.
type Row = Record<string, any>;
export const FEEDS: { id: string; base: string }[] = [
  { id: 'kimo', base: 'https://kimostore.net' },
  { id: 'compumarts', base: 'https://www.compumarts.com' },
  { id: 'tradeline', base: 'https://tradelinestores.com' },
];
interface State { rot: number; deep: Record<string, number>; blocked: Record<string, number> }
interface RunLog { at: string; store: string; page: number; items: number; updated: number; created: number; drops: number; skipped: number; ms: number; note?: string }

async function readFeed(base: string, page: number, limit: number) {
  const r = await fetch(`${base}/products.json?limit=${limit}&page=${page}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (r.status === 403 || r.status === 429 || r.status === 503) return 'blocked' as const;
  if (!r.ok) return null;
  // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
  const products: any[] = ((await r.json()) as any).products ?? [];
  return products.map((p) => {
    // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
    const vars: any[] = p.variants ?? [];
    const avail = vars.filter((v) => v.available);
    const pick = (avail.length ? avail : vars).map((v) => ({ v, price: Number(v.price) })).filter((x) => x.price > 0).sort((a, b) => a.price - b.price)[0];
    if (!pick) return null;
    const cmp = Number(pick.v.compare_at_price) || null;
    const ex: Extracted & { url: string } = {
      url: `${base}/products/${p.handle}`, title: String(p.title).trim(), brand: p.vendor ?? null, gtin: pick.v.barcode || null,
      image: p.images?.[0]?.src ?? null, price: pick.price, listPrice: cmp && cmp > pick.price ? cmp : null, currency: 'EGP', inStock: avail.length > 0,
      crumbs: p.product_type ? [String(p.product_type)] : [], source: 'feed',
    };
    return ex;
  }).filter((x): x is Extracted & { url: string } => Boolean(x));
}

/** Apply one feed page: update changed offers (keeps history, records drops) and create new arrivals. */
async function applyPage(env: Env, store: string, items: (Extracted & { url: string })[], maxWrites: number, allowCreate: boolean) {
  const keyed = await Promise.all(items.map(async (ex) => {
    const brand = guessBrand(ex.title, ex.brand);
    const key = matchKey({ title: ex.title, brand, gtin: ex.gtin });
    const fine = `${key}|${normAr(ex.title).split(' ').sort().join('-').slice(0, 160)}`;
    return { ex, ids: [await productId(key), await productId(fine)] };
  }));
  const ids = [...new Set(keyed.flatMap((k) => k.ids))];
  const rows = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const res = await env.DB.prepare(`SELECT * FROM catalog WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Row>();
    for (const r of res.results) rows.set(r.id, r);
  }
  const updates: { r: Row; offers: Offer[]; drop: boolean }[] = [];
  const creates: (Extracted & { url: string })[] = [];
  let skipped = 0;
  const nowMin = Math.floor(Date.now() / 60000);
  for (const { ex, ids: [a, b] } of keyed) {
    const cands = [rows.get(a!), rows.get(b!)].filter(Boolean) as Row[];
    const r = cands.find((c) => parseJ<Offer[]>(c.offers, []).some((o) => o.u === ex.url));
    if (!r) { if (allowCreate && !cands.length && plausibleEgp(ex.price, null)) creates.push(ex); continue; }
    const offers = parseJ<Offer[]>(r.offers, []);
    const o = offers.find((x) => x.u === ex.url)!;
    const k = ex.inStock === false ? 0 : 1;
    if (o.p === ex.price && o.k === k && (o.l ?? null) === (ex.listPrice ?? null)) continue;
    if (!plausibleEgp(ex.price, r.category)) continue;
    const drop = ex.price! < o.p;
    if (o.p !== ex.price) o.h = [...o.h, [nowMin, ex.price!] as [number, number]].slice(-240);
    o.p = ex.price!; o.k = k; o.l = ex.listPrice ?? null; o.t = nowIso();
    updates.push({ r, offers, drop });
  }
  updates.sort((x, y) => Number(y.drop) - Number(x.drop));
  let updated = 0, created = 0, drops = 0;
  for (const u of updates) {
    if (updated + created >= maxWrites) { skipped++; continue; }
    const res = await saveOffers(env, u.r, u.offers); updated++; if (res.drop) drops++;
  }
  for (const ex of creates.slice(0, Math.max(0, Math.min(4, maxWrites - updated)))) {
    const res = await upsertOffer(env, ex, ex.url, store, 'feed').catch(() => null);
    if (res?.created) created++;
  }
  skipped += Math.max(0, creates.length - created);
  return { updated, created, drops, skipped };
}

/** One ingestion tick: new arrivals of one store + one deep page of the next store. */
export async function ingestTick(env: Env): Promise<RunLog[]> {
  if (!(await Budget.allow(env, 60))) return [];
  const st = parseJ<State>(await sget(env, 'ingest:state'), { rot: 0, deep: {}, blocked: {} });
  st.blocked ??= {};
  const logs: RunLog[] = [];
  const brainPaused = parseJ<Record<string, number>>(await sget(env, 'src:paused'), {}); // العقل الرئيسي can pause a misbehaving source
  const jobs = [{ feed: FEEDS[st.rot % FEEDS.length]!, page: 1, limit: 100, create: true }];
  const deepFeed = FEEDS[(st.rot + 1) % FEEDS.length]!;
  jobs.push({ feed: deepFeed, page: (st.deep[deepFeed.id] ?? 1) + 1, limit: 250, create: false });
  for (const j of jobs) {
    const t0 = Date.now();
    if ((st.blocked[j.feed.id] ?? 0) > Date.now() || (brainPaused[j.feed.id] ?? 0) > Date.now()) { logs.push({ at: nowIso(), store: j.feed.id, page: j.page, items: 0, updated: 0, created: 0, drops: 0, skipped: 0, ms: 0, note: 'paused after a block' }); continue; }
    if (!(await robotsOk(env, new URL(`${j.feed.base}/products.json`)))) { logs.push({ at: nowIso(), store: j.feed.id, page: j.page, items: 0, updated: 0, created: 0, drops: 0, skipped: 0, ms: 0, note: 'robots disallow' }); continue; }
    const items = await readFeed(j.feed.base, j.page, j.limit).catch(() => null);
    if (items === 'blocked') { st.blocked[j.feed.id] = Date.now() + 6 * 3600_000; logs.push({ at: nowIso(), store: j.feed.id, page: j.page, items: 0, updated: 0, created: 0, drops: 0, skipped: 0, ms: Date.now() - t0, note: 'store answered 403/429: paused 6 h' }); continue; }
    if (!items) continue;
    if (!j.create) st.deep[j.feed.id] = items.length ? j.page : 0; // empty page → restart the sweep
    const res = await applyPage(env, j.feed.id, items, j.create ? 8 : 6, j.create);
    logs.push({ at: nowIso(), store: j.feed.id, page: j.page, items: items.length, ...res, ms: Date.now() - t0 });
  }
  st.rot++;
  const prev = parseJ<RunLog[]>(await sget(env, 'ingest:log'), []);
  await sput(env, 'ingest:log', JSON.stringify([...logs, ...prev].slice(0, 120)));
  await sput(env, 'ingest:state', JSON.stringify(st));
  return logs;
}

/**
 * Adaptive recrawl: each candidate gets an interval from why it matters (watched 1 h, very hot 90 min, hot 3 h,
 * recently dropped / multi-store 6 h), shortened for volatile prices; the most overdue go first.
 */
export async function adaptiveRecrawl(env: Env, n = 4) {
  if (!(await Budget.allow(env, n * 6))) return { skipped: 'write budget' };
  const rows = (await env.DB.prepare(`SELECT c.id, c.heat, c.checked_at, c.drop_at, c.n_offers, length(c.offers) AS olen, (SELECT COUNT(*) FROM watchlist w WHERE w.product_id=c.id) AS watchers
    FROM catalog c WHERE c.id IN (SELECT product_id FROM watchlist) OR c.id IN (SELECT id FROM catalog ORDER BY heat DESC LIMIT 200) OR c.drop_at > ?`).bind(new Date(Date.now() - 3 * 86400_000).toISOString()).all<Row>()).results;
  const now = Date.now();
  const scored = rows.map((r) => {
    let mins = r.watchers > 0 ? 60 : r.heat >= 80 ? 90 : r.heat >= 30 ? 180 : 360;
    if (r.drop_at && now - Date.parse(r.drop_at) < 86400_000) mins *= 0.6; // just moved: likely to move again
    if (r.olen > 600) mins *= 0.8; // long history / many offers ≈ volatile
    const age = r.checked_at ? (now - Date.parse(r.checked_at)) / 60000 : 1e6;
    return { id: r.id as string, overdue: age / mins, interval: Math.round(mins) };
  }).filter((x) => x.overdue >= 1).sort((a, b) => b.overdue - a.overdue).slice(0, n);
  let changed = 0, drops = 0;
  for (const p of scored) {
    const r = await env.DB.prepare('SELECT * FROM catalog WHERE id=?').bind(p.id).first<Row>();
    if (!r) continue;
    const res = await refreshProduct(env, r).catch(() => null);
    if (res?.changed) changed++; if (res?.drop) drops++;
  }
  const out = { at: nowIso(), candidates: rows.length, due: scored.length, checked: scored.map((s) => ({ id: s.id, everyMin: s.interval })), changed, drops };
  await sput(env, 'recrawl:last', JSON.stringify(out));
  return out;
}

/** Freshness + health per source, for /#/sources and the Hub dashboard. */
export async function health(env: Env) {
  const per = (await env.DB.prepare(`SELECT store, COUNT(*) n, MAX(checked_at) newest, MIN(checked_at) oldest,
      SUM(CASE WHEN checked_at > ? THEN 1 ELSE 0 END) fresh24, SUM(CASE WHEN first_seen > ? THEN 1 ELSE 0 END) new24
      FROM catalog GROUP BY store ORDER BY n DESC`).bind(new Date(Date.now() - 86400_000).toISOString(), new Date(Date.now() - 86400_000).toISOString()).all<Row>()).results;
  const log = parseJ<RunLog[]>(await sget(env, 'ingest:log'), []);
  const recrawl = parseJ(await sget(env, 'recrawl:last'), null);
  const st = parseJ<State>(await sget(env, 'ingest:state'), { rot: 0, deep: {}, blocked: {} });
  const drops24 = await env.DB.prepare('SELECT COUNT(*) n FROM drops WHERE at > ?').bind(new Date(Date.now() - 86400_000).toISOString()).first<{ n: number }>();
  const heal = parseJ<Record<string, string>>(await sget(env, 'heal:index'), {});
  return {
    at: nowIso(),
    stores: per.map((s) => ({ store: s.store, products: s.n, newestCheck: s.newest, oldestCheck: s.oldest, checked24h: s.fresh24, new24h: s.new24, feed: FEEDS.some((f) => f.id === s.store), pausedUntil: st.blocked?.[s.store] ? new Date(st.blocked[s.store]!).toISOString() : null, deepPage: st.deep?.[s.store] ?? null })),
    ingest: log.slice(0, 30), recrawl, drops24h: drops24?.n ?? 0, selfHealedHosts: heal,
    hunter: parseJ(await sget(env, 'hunter:runs'), []).slice(0, 10), budget: await Budget.report(env),
    freshness: {
      feedNewArrivals: 'new products from Shopify feeds: within ~30 min (one store polled every 10 min, 3 stores rotating)',
      feedPrices: 'every Shopify product price: about every 12 h (rotating 250-item deep page per run)',
      hotWatched: 'watched: ~1 h · very hot: ~90 min · hot: ~3 h (adaptive recrawl, 4 products per run)',
      onView: 'any product older than 6 h is re-read when someone opens it',
      sitemapStores: 'sitemap/JSON-LD stores (B.TECH, 2B, Raya, Sigma, El Badr, Jumia): safqa-hunter on GitHub Actions, daily after the 02:00 Cairo budget reset, within a per-day write budget',
      amazonNoon: 'only via official partner APIs/feeds (dormant until keys), pasted links, or the browser extension',
    },
  };
}

// ---------------- self-healing extractor ----------------
/** Remembered CSS class (per host) that held the price when JSON-LD was missing. */
export async function healedSelector(env: Env, host: string) { return sget(env, `heal:${host}`); }
/**
 * Last-resort extraction: given a short visible-text excerpt and the price-like candidates found on the page,
 * ask Workers AI for {title, price}. When the answer matches one candidate, remember that candidate's CSS class
 * so the next read uses it directly (no AI). Budgeted with the shared daily AI counter.
 */
export async function aiExtract(env: Env, host: string, title: string, candidates: { cls: string; text: string }[]): Promise<{ title: string; price: number } | null> {
  if (!candidates.length || !env.AI) return null;
  const dayKey = `heal:calls:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await sget(env, dayKey)) ?? 0);
  if (used >= 60) return null;
  await sput(env, dayKey, String(used + 1), 2 * 86400);
  const prompt = `Page title: ${title.slice(0, 160)}\nPrice-like texts on the page (index: text):\n${candidates.slice(0, 12).map((c, i) => `${i}: ${c.text.slice(0, 60)}`).join('\n')}\nWhich index is the product's current selling price in EGP (not old price, not installment)? Reply JSON only: {"i":<index>,"price":<number>,"title":"<short product name>"}`;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: Workers AI binding.
    const out: any = await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: [{ role: 'user', content: prompt }], max_tokens: 80, temperature: 0 });
    const j = parseJ<{ i?: number; price?: number; title?: string }>(String(out?.response ?? '').match(/\{[\s\S]*\}/)?.[0], {});
    const c = j.i != null ? candidates[j.i] : undefined;
    if (!c || !j.price || !plausibleEgp(j.price, null)) return null;
    if (c.cls) {
      await sput(env, `heal:${host}`, c.cls, 30 * 86400);
      const idx = parseJ<Record<string, string>>(await sget(env, 'heal:index'), {});
      idx[host] = `${c.cls} @ ${nowIso().slice(0, 10)}`;
      await sput(env, 'heal:index', JSON.stringify(idx));
    }
    return { title: j.title || title, price: j.price };
  } catch { return null; }
}
