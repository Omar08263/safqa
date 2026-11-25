// Safqa v5 catalog API on the Worker: instant search, product + real history + prediction,
// hot deals (heat), live drops (SSE + polling), votes, coupons, paste-a-link, personalised feed,
// compare, and the priority recrawl used by the cron (hot/watched first, Keepa-style).
import { outboundOk, safeFetch } from '../security/outbound';
import { edgeCacheGet, edgeCachePut } from '../infra/state';
import { aePoint } from '../infra/budget';
import type { Env } from '../util';
import { fail, nowIso, parseJ, rateLimit, str, uid } from '../util';
import { CATEGORIES, canonicalUrl, categorize, categoryBySlug, condition, extractProduct, guessBrand, matchKey, normAr, normQuery, plausibleEgp, predict, productId, rowHeat, searchText, type Extracted } from './core';
import * as amazon from './amazon';
import { aiExtract, healedSelector } from './ingest';
import { dealDna, fakeDiscount, seasonAdvice } from './insights';

// biome-ignore lint/suspicious/noExplicitAny: D1 rows.
type Row = Record<string, any>;
export interface Offer { s: string; u: string; p: number; l: number | null; k: 0 | 1; t: string; r?: number | null; src?: string; h: [number, number][]; /** this store's own product image */ i?: string | null }

/** Prices at or above this are store placeholders (e.g. a RAM stick listed at EGP 1,010,000), never shown. */
export const MAX_SANE_PRICE = 1_000_000;

/** Which store an image URL belongs to (Shopify shop file ids + store hosts), so the UI can say «photo from X»
 * instead of silently showing one store's watermarked photo next to another store's price. */
const SHOPIFY_SHOP: Record<string, string> = { '0554/5594/0776': 'kimo', '0622/7050/5109': 'compumarts', '0647/8000/9538': 'tradeline' };
const IMG_HOSTS: [RegExp, string][] = [[/sigma-computer\.com$/, 'sigma'], [/rayashop\.com$/, 'raya'], [/(^|\.)2b\.com\.eg$/, '2b'], [/elbadrgroupeg\.store$/, 'elbadr'], [/jumia\.(is|com\.eg)$/, 'jumia'], [/btech\.com$/, 'btech'], [/kimostore\.net$/, 'kimo'], [/compumarts\.com$/, 'compumarts'], [/tradelinestores\.com$/, 'tradeline'], [/(amazon|media-amazon|ssl-images-amazon)\./, 'amazon-eg'], [/noon(cdn)?\./, 'noon']];
export function imageStore(u?: string | null): string | null {
  if (!u) return null;
  const m = /cdn\.shopify\.com\/s\/files\/\d\/(\d+\/\d+\/\d+)/.exec(u);
  if (m) return SHOPIFY_SHOP[m[1]!] ?? null;
  try { const h = new URL(u).hostname; for (const [re, id] of IMG_HOSTS) if (re.test(h)) return id; } catch { /* not a URL */ }
  return null;
}

export const STORE_NAMES: Record<string, [string, string, string]> = {
  kimo: ['كيمو ستور', 'Kimo Store', 'kimostore.net'], compumarts: ['كمبيومارتس', 'Compumarts', 'compumarts.com'], tradeline: ['تريدلاين', 'Tradeline', 'tradelinestores.com'],
  btech: ['بي.تك', 'B.TECH', 'btech.com'], '2b': ['تو بي', '2B', '2b.com.eg'], raya: ['راية شوب', 'Raya Shop', 'rayashop.com'], elaraby: ['العربي جروب', 'El Araby', 'elarabygroup.com'],
  sigma: ['سيجما كمبيوتر', 'Sigma Computer', 'sigma-computer.com'], elbadr: ['البدر جروب', 'El Badr Group', 'elbadrgroupeg.store'], jumia: ['جوميا', 'Jumia', 'jumia.com.eg'],
  'amazon-eg': ['أمازون مصر', 'Amazon.eg', 'amazon.eg'], noon: ['نون', 'noon', 'noon.com'], user: ['رابط من مستخدم', 'User link', ''],
};
const SHOPIFY = new Set(['kimo', 'compumarts', 'tradeline']);
export const storeInfo = (id: string) => { const s = STORE_NAMES[id]; return { slug: id, nameAr: s?.[0] ?? id, nameEn: s?.[1] ?? id, domain: s?.[2] ?? '' }; };
/** Official affiliate tagging (Amazon Associates, amazon.eg). Free; referred sales are what unlock the Creators API
 * (Amazon requires 10 qualified sales in the trailing 30 days). Untouched when no tag is configured. */
export function affiliateUrl(env: Env, u: string): string {
  try {
    const url = new URL(u);
    if (env.AMAZON_PARTNER_TAG && /(^|\.)amazon\.eg$/.test(url.hostname)) { url.searchParams.set('tag', env.AMAZON_PARTNER_TAG); return url.toString(); }
  } catch { /* leave as is */ }
  return u;
}
export function storeFromHost(host: string): string | null {
  const h = host.replace(/^www\./, '');
  for (const [id, v] of Object.entries(STORE_NAMES)) if (v[2] && (h === v[2] || h.endsWith(`.${v[2]}`))) return id;
  return null;
}

/** Card in the v4 ProductCard shape (so existing UI renders it) plus v5 fields. */
export function toCard(r: Row) {
  const cat = categoryBySlug(r.category);
  const disc = r.list_price && r.list_price > r.price ? Math.round(((r.list_price - r.price) / r.list_price) * 100) : null;
  const score = Math.max(10, Math.min(99, Math.round(50 + (r.heat ?? 0) / 3)));
  return {
    id: r.id, titleAr: r.title_ar || r.title, titleEn: r.title, brand: r.brand, model: null, ean: r.gtin ?? null, image: r.image, imageStore: imageStore(r.image),
    category: cat ? { slug: cat.slug, nameAr: cat.ar, nameEn: cat.en } : { slug: 'other', nameAr: 'متنوع', nameEn: 'Other' },
    offerCount: r.n_offers, lowestPriceEgp: r.price, condition: r.cond,
    bestOffer: { id: `${r.id}:${r.store}`, url: r.url, title: r.title, priceEgp: r.price, listPriceEgp: r.list_price, inStock: Boolean(r.in_stock), condition: r.cond === 'new' ? 'new' : 'used', rating: null,
      dealScore: score, dealLabel: score >= 80 ? 'great' : score >= 65 ? 'good' : 'fair', fakeDiscount: false, fakeDiscountReason: null, discountPct: disc, lastSeenAt: r.checked_at ?? r.updated_at, store: { ...storeInfo(r.store), adapterStatus: 'ok' } },
    v5: { heat: Math.round(r.heat ?? 0), hot: r.hot ?? 0, cold: r.cold ?? 0, low: r.low, med30: r.med30, dropPct: r.drop_pct, dropAt: r.drop_at, firstSeen: r.first_seen, checkedAt: r.checked_at },
  };
}
const CARD_COLS = 'id,title,title_ar,brand,category,image,gtin,cond,price,list_price,store,url,n_offers,in_stock,low,med30,drop_pct,drop_at,heat,hot,cold,first_seen,updated_at,checked_at';

// ---------------- edge cache ----------------
async function cached(req: Request, ttl: number, fn: () => Promise<unknown>, exec?: ExecutionContext): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const body = await fn();
  const res = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` } });
  const put = cache.put(key, res.clone());
  if (exec) exec.waitUntil(put); else await put;
  return res;
}

// ---------------- search ----------------
const trigrams = (w: string) => { const out: string[] = []; for (let i = 0; i + 3 <= w.length; i++) out.push(w.slice(i, i + 3)); return out; };
const ftsQuote = (s: string) => `"${s.replace(/"/g, '')}"`;
function scoreSim(q: string, text: string): number {
  const A = new Set(q.split(' ').flatMap(trigrams)); if (!A.size) return 0;
  const T = normAr(text); let hit = 0; for (const g of A) if (T.includes(g)) hit++;
  return hit / A.size;
}
export async function search(env: Env, sp: URLSearchParams) {
  const qRaw = str(sp.get('q') ?? '', 120);
  const cat = sp.get('cat') || sp.get('category');
  const store = sp.get('store');
  const sort = sp.get('sort') ?? (qRaw ? 'relevance' : 'heat');
  const min = Number(sp.get('min') ?? 0) || 0, max = Number(sp.get('max') ?? 0) || 0;
  const cond = sp.get('cond');
  const inStock = sp.get('instock') === '1';
  const limit = Math.min(Number(sp.get('limit') ?? 40) || 40, 100);
  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  let rows: Row[] = []; let fuzzy = false;
  const filt: string[] = []; const binds: unknown[] = [];
  if (cat) { filt.push('c.category=?'); binds.push(cat); }
  if (store) { filt.push('c.store=?'); binds.push(store); }
  if (min) { filt.push('c.price>=?'); binds.push(min); }
  if (max) { filt.push('c.price<=?'); binds.push(max); }
  if (cond) { filt.push('c.cond=?'); binds.push(cond); }
  if (inStock) filt.push('c.in_stock=1');
  filt.push(`c.price < ${MAX_SANE_PRICE}`);
  const where = ` AND ${filt.join(' AND ')}`;
  const q = qRaw ? normQuery(qRaw) : '';
  if (q) {
    const words = q.split(' ').filter((w) => w.length >= 3);
    const short = q.split(' ').filter((w) => w.length > 0 && w.length < 3);
    if (words.length) {
      const strict = words.map(ftsQuote).join(' AND ');
      rows = (await env.DB.prepare(`SELECT ${CARD_COLS.split(',').map((x) => `c.${x}`).join(',')} FROM catalog_fts f JOIN catalog c ON c.rowid=f.rowid WHERE catalog_fts MATCH ?${where} ORDER BY rank LIMIT 300`).bind(strict, ...binds).all<Row>()).results;
      if (short.length) rows = rows.filter((r) => short.every((s) => normAr(`${r.title} ${r.title_ar ?? ''}`).split(' ').some((w) => w.startsWith(s))));
      if (rows.length < 5) {
        // Typo tolerance: OR of every trigram, ranked by bm25, then re-scored by trigram overlap.
        const grams = [...new Set(words.flatMap(trigrams))].slice(0, 40);
        const loose = (await env.DB.prepare(`SELECT ${CARD_COLS.split(',').map((x) => `c.${x}`).join(',')} FROM catalog_fts f JOIN catalog c ON c.rowid=f.rowid WHERE catalog_fts MATCH ?${where} ORDER BY rank LIMIT 200`).bind(grams.map(ftsQuote).join(' OR '), ...binds).all<Row>()).results;
        const seen = new Set(rows.map((r) => r.id));
        const extra = loose.map((r) => ({ r, s: scoreSim(q, `${searchText(r.title, r.title_ar, r.brand)}`) })).filter((x) => x.s >= 0.5 && !seen.has(x.r.id)).sort((a, b) => b.s - a.s).map((x) => x.r);
        if (extra.length) { fuzzy = rows.length === 0; rows = [...rows, ...extra]; }
      }
    } else {
      rows = (await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog c WHERE (c.title LIKE ? OR c.title_ar LIKE ?)${where} ORDER BY heat DESC LIMIT 200`).bind(`%${q}%`, `%${q}%`, ...binds).all<Row>()).results;
    }
  } else {
    const order = sort === 'price' ? 'c.price ASC' : sort === '-price' ? 'c.price DESC' : sort === 'drop' ? 'c.drop_at DESC' : sort === 'new' ? 'c.first_seen DESC' : 'c.heat DESC';
    rows = (await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog c WHERE 1=1${where} ${sort === 'drop' ? 'AND c.drop_at IS NOT NULL' : ''} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, limit + 1, page * limit).all<Row>()).results;
    const more = rows.length > limit;
    return { items: rows.slice(0, limit).map(toCard), page, more, total: null, fuzzy: false };
  }
  if (sort === 'price') rows.sort((a, b) => a.price - b.price);
  else if (sort === '-price') rows.sort((a, b) => b.price - a.price);
  else if (sort === 'heat') rows.sort((a, b) => b.heat - a.heat);
  else if (sort === 'drop') rows.sort((a, b) => (b.drop_pct ?? 0) - (a.drop_pct ?? 0));
  const facets = { categories: count(rows, 'category'), stores: count(rows, 'store') };
  return { items: rows.slice(page * limit, page * limit + limit).map(toCard), page, more: rows.length > (page + 1) * limit, total: rows.length, fuzzy, query: q, facets };
}
const count = (rows: Row[], k: string) => Object.entries(rows.reduce<Record<string, number>>((a, r) => { const v = r[k] ?? 'other'; a[v] = (a[v] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, n]) => ({ id, n }));

// ---------------- product ----------------
export async function product(env: Env, id: string, exec?: ExecutionContext) {
  const r = await env.DB.prepare('SELECT * FROM catalog WHERE id=?').bind(id).first<Row>();
  if (!r) return null;
  const offers = parseJ<Offer[]>(r.offers, []);
  const points = offers.flatMap((o) => o.h.map(([t, p]) => ({ at: new Date(t * 60000).toISOString(), price: p, store: o.s })));
  // Daily best-price series across stores (step-held), for the chart.
  const series = bestSeries(offers);
  const pred = predict(series.map((x) => ({ at: x.at, price: x.price })), r.in_stock ? r.price : null);
  const similar = (await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog WHERE category=? AND id<>? AND brand IS ? AND price < 1000000 ORDER BY heat DESC LIMIT 8`).bind(r.category, id, r.brand).all<Row>()).results;
  // Refresh on view (Keepa-style): a stale Shopify offer is re-read right away in the background.
  if (exec && r.checked_at && Date.now() - Date.parse(r.checked_at) > 6 * 3600_000) exec.waitUntil(refreshProduct(env, r).catch(() => null));
  // Show the photo of the store whose price is shown, when we have it; otherwise say whose photo it is.
  const best = offers.filter((o) => o.k && o.p === r.price)[0] ?? offers.find((o) => o.s === r.store);
  const ownImg = best?.i || offers.find((o) => o.s === r.store && o.i)?.i || null;
  const image = ownImg || r.image;
  return {
    ...toCard(r), image, imageStore: imageStore(image) ?? (ownImg ? r.store : null), specs: parseJ(r.specs, {}), offers: offers.sort((a, b) => b.k - a.k || a.p - b.p).map((o) => ({ store: storeInfo(o.s), url: affiliateUrl(env, o.u), priceEgp: o.p, listPriceEgp: o.l, inStock: Boolean(o.k), checkedAt: o.t, source: o.src ?? 'crawl', userReported: o.src === 'user', points: o.h.length })),
    history: points, series, prediction: pred, similar: similar.map(toCard), votes: { hot: r.hot, cold: r.cold },
    dna: dealDna({ price: r.price, offers, hot: Number(r.hot), cold: Number(r.cold), checkedAt: r.checked_at }),
    fake: fakeDiscount(offers.find((o) => o.p === r.price && o.src !== 'user') ?? null),
    season: seasonAdvice(Date.now(), r.category),
    war: (await env.DB.prepare('SELECT COUNT(DISTINCT store) s, COUNT(*) n FROM drops WHERE product_id=? AND at > ?').bind(id, new Date(Date.now() - 14 * 86400_000).toISOString()).first<{ s: number; n: number }>().then((w) => (w && w.s >= 2 && w.n >= 3 ? { stores: w.s, drops: w.n } : null))),
  };
}
export function bestSeries(offers: Offer[]) {
  const ev = offers.flatMap((o) => o.h.map(([t, p]) => ({ t, p, s: o.s }))).sort((a, b) => a.t - b.t);
  const cur = new Map<string, number>(); const out: { at: string; price: number }[] = [];
  for (const e of ev) {
    cur.set(e.s, e.p);
    const best = Math.min(...cur.values());
    const day = new Date(e.t * 60000).toISOString().slice(0, 10);
    if (out.length && out[out.length - 1]!.at.slice(0, 10) === day) out[out.length - 1] = { at: `${day}T12:00:00.000Z`, price: Math.min(out[out.length - 1]!.price, best) };
    else out.push({ at: `${day}T12:00:00.000Z`, price: best });
  }
  return out;
}

// ---------------- refresh (cron + on view) ----------------
export { cached };
export type { Ctx, On };
export const UA = 'SafqaBot/5.0 (+https://safqaeg.pages.dev/about; price comparison)';
async function readOffer(env: Env, o: Offer): Promise<{ price: number | null; inStock: boolean | null; listPrice?: number | null } | 'blocked' | null> {
  const u = new URL(o.u);
  if (!(await robotsOk(env, u))) return null;
  if (SHOPIFY.has(o.s)) {
    const r = await fetch(`${u.origin}${u.pathname}.js`, { headers: { 'user-agent': UA, accept: 'application/json' }, cf: { cacheTtl: 600 } } as RequestInit);
    if (r.status === 403 || r.status === 429) return 'blocked';
    if (r.status === 404) return { price: null, inStock: false };
    if (!r.ok) return null;
    // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
    const j: any = await r.json();
    // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
    const vars: any[] = (j.variants ?? []).filter((v: any) => v.price > 0);
    const avail = vars.filter((v) => v.available);
    const v = (avail.length ? avail : vars).sort((a, b) => a.price - b.price)[0];
    if (!v) return null;
    if (v.price / 100 >= MAX_SANE_PRICE) return null; // store placeholder price: keep the last real one
    return { price: v.price / 100, inStock: avail.length > 0, listPrice: v.compare_at_price ? v.compare_at_price / 100 : null };
  }
  const r = await fetch(o.u, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (r.status === 403 || r.status === 429 || r.status === 503) return 'blocked';
  if (r.status === 404 || r.status === 410) return { price: null, inStock: false };
  if (!r.ok) return null;
  const ex = await extractFromResponse(r, env);
  return ex?.price ? { price: ex.price, inStock: ex.inStock ?? true } : null;
}
/**
 * Collect only JSON-LD + meta tags with HTMLRewriter (cheap on CPU), then parse. When the page has no structured
 * data, fall back to the self-healing extractor: price-like elements (+ the class remembered for this host) are
 * handed to Workers AI once, and the winning class is remembered so later reads skip the AI.
 */
async function extractFromResponse(r: Response, env?: Env): Promise<Extracted | null> {
  let ld = ''; let metas = ''; let inLd = false; let title = '';
  const host = (() => { try { return new URL(r.url).host; } catch { return ''; } })();
  const healed = env && host ? await healedSelector(env, host) : null;
  const cands: { cls: string; text: string }[] = []; let healedText = '';
  let cur: { cls: string; text: string } | null = null;
  let inTitle = false;
  const rw = new HTMLRewriter()
    .on('script[type="application/ld+json"]', { element() { inLd = true; ld += '<script type="application/ld+json">'; }, text(t) { if (inLd) { ld += t.text; if (t.lastInTextNode) { ld += '</script>'; inLd = false; } } } })
    .on('meta', { element(e) { const p = e.getAttribute('property') ?? e.getAttribute('name') ?? e.getAttribute('itemprop'); const c = e.getAttribute('content'); if (p && c && /^(og:|product:)/.test(p)) metas += `<meta property="${p}" content="${c.replace(/"/g, '&quot;')}">`; } })
    .on('title', { element() { inTitle = true; }, text(t) { if (inTitle) { title += t.text; if (t.lastInTextNode) inTitle = false; } } })
    .on('[class*="price"], [class*="Price"], [itemprop="price"]', {
      element(e) { if (cands.length < 24) { cur = { cls: (e.getAttribute('class') ?? '').split(/\s+/).find((c) => /price/i.test(c)) ?? '', text: '' }; cands.push(cur); } },
      text(t) { if (cur && cur.text.length < 80) cur.text += t.text; },
    });
  if (healed) rw.on(`.${healed.replace(/[^a-zA-Z0-9_-]/g, '')}`, { text(t) { if (healedText.length < 80) healedText += t.text; } });
  await rw.transform(r).arrayBuffer();
  if (/captcha|robot check/i.test(metas + title)) return null;
  const ex = extractProduct(ld + metas);
  if (ex?.price) return ex;
  // Healed selector first (no AI), then AI with the price-like candidates.
  const num = (s: string) => { const m = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/,/g, '').match(/\d{2,7}(\.\d+)?/); return m ? Number(m[0]) : null; };
  const t = (ex?.title || title).trim();
  if (healedText && num(healedText) && t) return { ...(ex ?? {}), title: t, price: num(healedText), currency: 'EGP', inStock: true, crumbs: [], source: 'healed' } as Extracted;
  if (!env || !t) return ex;
  const useful = cands.map((c) => ({ cls: c.cls, text: c.text.replace(/\s+/g, ' ').trim() })).filter((c) => /\d/.test(c.text));
  const ai = await aiExtract(env, host, t, useful);
  return ai ? ({ ...(ex ?? {}), title: ai.title, price: ai.price, currency: 'EGP', inStock: true, crumbs: [], source: 'ai' } as Extracted) : ex;
}
export async function robotsOk(env: Env, u: URL): Promise<boolean> {
  const key = `robots:${u.host}`;
  let txt = await edgeCacheGet<string>(key);
  if (txt === null) {
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA } }).catch(() => null);
    txt = r?.ok ? (await r.text()).slice(0, 20000) : '';
    await edgeCachePut(key, txt, 86400);
  }
  let active = false; let best: { allow: boolean; len: number } | null = null;
  const path = u.pathname + u.search;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1]!.toLowerCase(); const v = m[2]!.trim();
    if (k === 'user-agent') { active = v === '*' || /safqabot/i.test(v); continue; }
    if (!active || (k !== 'allow' && k !== 'disallow') || !v) continue;
    const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || v.length > best.len)) best = { allow: k === 'allow', len: v.length };
  }
  return best ? best.allow : true;
}
export async function refreshProduct(env: Env, r: Row): Promise<{ changed: boolean; drop?: number } | null> {
  const offers = parseJ<Offer[]>(r.offers, []);
  const target = offers.filter((o) => o.src !== 'user').sort((a, b) => (SHOPIFY.has(b.s) ? 1 : 0) - (SHOPIFY.has(a.s) ? 1 : 0) || a.t.localeCompare(b.t))[0];
  if (!target) return null;
  const got = await readOffer(env, target).catch(() => null);
  const now = nowIso();
  if (got === 'blocked' || got === null) { await env.DB.prepare('UPDATE catalog SET checked_at=? WHERE id=?').bind(now, r.id).run(); return null; }
  target.t = now;
  if (got.price && plausibleEgp(got.price, r.category)) {
    if (!target.h.length || target.h[target.h.length - 1]![1] !== got.price) target.h.push([Math.floor(Date.now() / 60000), got.price]);
    target.h = target.h.slice(-240);
    target.p = got.price; if (got.listPrice !== undefined) target.l = got.listPrice;
  }
  target.k = got.inStock === false ? 0 : 1;
  return saveOffers(env, r, offers);
}
/** Recompute best price/low/median/heat from offers and persist; records a real drop when the best price falls. */
export async function saveOffers(env: Env, r: Row, offers: Offer[]): Promise<{ changed: boolean; drop?: number }> {
  const live = offers.filter((o) => o.k && o.src !== 'user');
  const pool = live.length ? live : offers.filter((o) => o.src !== 'user');
  if (!pool.length) return { changed: false };
  const best = pool.reduce((a, b) => (b.p < a.p ? b : a));
  const pts = offers.filter((o) => o.src !== 'user').flatMap((o) => o.h.map(([, v]) => v));
  const low = Math.min(best.p, ...pts);
  const since = Math.floor(Date.now() / 60000) - 30 * 1440;
  const recent = offers.flatMap((o) => o.h.filter(([t]) => t >= since).map(([, v]) => v)).sort((a, b) => a - b);
  const med30 = recent.length ? recent[Math.floor(recent.length / 2)]! : best.p;
  const now = nowIso();
  // Write budget: if nothing a user can see changed, only stamp checked_at (1 row, unindexed column)
  // instead of rewriting the row and both heat indexes (3+ rows).
  const strip = (os: Offer[]) => JSON.stringify(os.map(({ t: _t, ...o }) => o));
  if (best.p === Number(r.price) && (best.l ?? null) === (r.list_price ?? null) && (live.length ? 1 : 0) === Number(r.in_stock) && offers.length === Number(r.n_offers) && best.s === r.store && strip(offers) === strip(parseJ<Offer[]>(r.offers, []))) {
    await env.DB.prepare('UPDATE catalog SET checked_at=? WHERE id=?').bind(now, r.id).run();
    aePoint(env, 'obs', [r.id, best.s, 'same'], [best.p]);
    return { changed: false };
  }
  aePoint(env, 'obs', [r.id, best.s, 'changed'], [best.p, Number(r.price) || 0]);
  let dropPct = r.drop_pct, dropAt = r.drop_at, drop: number | undefined;
  if (r.price && best.p < r.price * 0.995 && live.length) {
    dropPct = Math.round(((r.price - best.p) / r.price) * 1000) / 10; dropAt = now; drop = dropPct;
    await env.DB.prepare('INSERT INTO drops (product_id, store, old, new, pct, at) VALUES (?,?,?,?,?,?)').bind(r.id, best.s, r.price, best.p, dropPct, now).run();
    await env.DB.prepare(`INSERT INTO alerts (id,user_id,type,title,body,product_id,read,created_at) SELECT 'al_'||lower(hex(randomblob(8))), user_id, 'price_drop', ?, ?, ?, 0, ? FROM watchlist WHERE product_id=? AND (target IS NULL OR target >= ?)`)
      .bind(`📉 نزل ${dropPct}%: ${(r.title_ar || r.title).slice(0, 80)}`, `من ${Math.round(r.price)} لـ ${Math.round(best.p)} ج.م في ${storeInfo(best.s).nameAr}`, r.id, now, r.id, best.p).run();
    if (dropPct >= 5) await env.DB.prepare('INSERT INTO price_events (product_id,old_price,new_price,drop_pct,category,headline,at) VALUES (?,?,?,?,?,?,?)').bind(r.id, r.price, best.p, dropPct, r.category, `${r.title_ar || r.title}`.slice(0, 120), now).run();
  }
  const ageH = dropAt ? (Date.now() - Date.parse(dropAt)) / 3600_000 : 999;
  const claimed = best.l && best.l > best.p ? ((best.l - best.p) / best.l) * 100 : 0;
  const h = rowHeat({ hot: Number(r.hot), cold: Number(r.cold), dropPct: ageH < 168 ? dropPct : 0, vsMedian: med30 > best.p ? ((med30 - best.p) / med30) * 100 : 0, atLow: pts.length > 1 && best.p <= low, ageHours: Math.min(ageH, 72), claimed, liveStores: live.length, price: best.p });
  await env.DB.prepare('UPDATE catalog SET offers=?, price=?, list_price=?, store=?, url=?, n_offers=?, in_stock=?, low=?, med30=?, drop_pct=?, drop_at=?, heat=?, checked_at=?, updated_at=? WHERE id=?')
    .bind(JSON.stringify(offers), best.p, best.l, best.s, best.u, offers.length, live.length ? 1 : 0, low, med30, dropPct, dropAt, Math.max(0, h), now, now, r.id).run();
  return { changed: best.p !== r.price, drop };
}
/** Cron: re-read the stalest of the hottest/watched products (a handful per run, free-tier CPU friendly). */
export async function priorityRecrawl(env: Env, n = 6) {
  const hot = (await env.DB.prepare('SELECT id, checked_at FROM catalog ORDER BY heat DESC LIMIT 150').all<Row>()).results;
  const watched = (await env.DB.prepare("SELECT c.id, c.checked_at FROM watchlist w JOIN catalog c ON c.id=w.product_id GROUP BY c.id LIMIT 150").all<Row>()).results;
  const cutoff = Date.now() - 2 * 3600_000;
  const pick = [...new Map([...watched, ...hot].map((x) => [x.id, x])).values()].filter((x) => !x.checked_at || Date.parse(x.checked_at) < cutoff).sort((a, b) => String(a.checked_at ?? '').localeCompare(String(b.checked_at ?? ''))).slice(0, n);
  let changed = 0, drops = 0;
  for (const p of pick) {
    const r = await env.DB.prepare('SELECT * FROM catalog WHERE id=?').bind(p.id).first<Row>();
    if (!r) continue;
    const res = await refreshProduct(env, r).catch(() => null);
    if (res?.changed) changed++; if (res?.drop) drops++;
  }
  return { checked: pick.length, changed, drops };
}

// ---------------- votes ----------------
export async function vote(env: Env, userKey: string, id: string, v: number) {
  const val = v > 0 ? 1 : v < 0 ? -1 : 0;
  const r = await env.DB.prepare('SELECT id, hot, cold, heat FROM catalog WHERE id=?').bind(id).first<Row>();
  if (!r) fail(404, 'not_found', 'المنتج مش موجود');
  const prev = (await env.DB.prepare('SELECT v FROM votes WHERE user_key=? AND product_id=?').bind(userKey, id).first<{ v: number }>())?.v ?? 0;
  if (prev === val) return { hot: r!.hot, cold: r!.cold, heat: Math.round(r!.heat), mine: val };
  const hot = r!.hot + (val === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
  const cold = r!.cold + (val === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
  const newHeat = Math.max(0, r!.heat + ((val - prev) * 12));
  const stmts = [env.DB.prepare('UPDATE catalog SET hot=?, cold=?, heat=? WHERE id=?').bind(hot, cold, newHeat, id)];
  stmts.push(val === 0 ? env.DB.prepare('DELETE FROM votes WHERE user_key=? AND product_id=?').bind(userKey, id) : env.DB.prepare('INSERT OR REPLACE INTO votes (user_key, product_id, v, at) VALUES (?,?,?,?)').bind(userKey, id, val, nowIso()));
  await env.DB.batch(stmts);
  return { hot, cold, heat: Math.round(newHeat), mine: val };
}

// ---------------- paste a link ----------------
export async function submitLink(env: Env, rawUrl: string, userKey: string) {
  let u: URL;
  try { u = new URL(rawUrl.trim()); } catch { return fail(400, 'bad_url', 'الرابط مش مظبوط'); }
  if (!/^https?:$/.test(u.protocol)) fail(400, 'bad_url', 'الرابط لازم يبدأ بـ https');
  if (!outboundOk(u)) fail(400, 'bad_url', 'الرابط ده مش لمتجر'); // SSRF guard (security/outbound.ts)
  const url = canonicalUrl(u.toString());
  const storeId = storeFromHost(u.hostname) ?? 'user';
  const sid = uid('sub_');
  const record = async (status: string, productId: string | null, note: string) => { await env.DB.prepare('INSERT INTO submissions (id,url,user_key,status,product_id,note,created_at) VALUES (?,?,?,?,?,?,?)').bind(sid, url, userKey, status, productId, note, nowIso()).run(); };
  // Already tracked?
  const known = await env.DB.prepare('SELECT id FROM catalog WHERE url=? LIMIT 1').bind(url).first<{ id: string }>();
  if (known) { await record('known', known.id, ''); return { status: 'known', productId: known.id }; }
  let ex: Extracted | null = null; let via = 'page';
  if (storeId === 'amazon-eg' && amazon.configured(env)) {
    const asin = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1];
    if (asin) { ex = await amazon.getItem(env, asin).catch(() => null); via = 'amazon-creators-api'; }
  }
  if (!ex) {
    if (!(await robotsOk(env, u))) { await record('robots', null, 'robots.txt disallows'); return { status: 'robots', message: 'المتجر ده مانع القراءة الآلية للصفحة دي في robots.txt — مش هنقرأها. جرّب إضافة صفقة للمتصفح: بتقرا الصفحة اللي إنت فاتحها بنفسك.' }; }
    const r = await safeFetch(url, { headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'ar,en;q=0.8' } });
    if (!r || r.status === 403 || r.status === 429 || r.status === 503) {
      await record('blocked', null, `status ${r?.status ?? 'network'}`);
      return { status: 'blocked', message: storeId === 'amazon-eg' || storeId === 'noon'
        ? 'أمازون/نون بيقفلوا القراءة الآلية، وإحنا مش بنتحايل على ده. الحل الرسمي: Amazon Creators API ونون عن طريق برنامج الأفلييت (متجهّزين أول ما المفاتيح تتسجّل)، أو إضافة صفقة للمتصفح.'
        : 'المتجر رفض الطلب الآلي — مش هنحاول نتخفّى. جرّب إضافة صفقة للمتصفح.' };
    }
    if (!r.ok) { await record('error', null, `status ${r.status}`); return { status: 'error', message: `المتجر رد بـ ${r.status}` }; }
    ex = await extractFromResponse(r, env);
  }
  if (!ex?.price || !ex.title) { await record('noproduct', null, ''); return { status: 'noproduct', message: 'ملقيناش بيانات منتج منظمة (schema.org) في الصفحة دي.' }; }
  if (ex.currency && !/EGP|LE|جنيه/i.test(ex.currency)) { await record('currency', null, String(ex.currency)); return { status: 'currency', message: `السعر بعملة ${ex.currency} — صفقة بتقارن بالجنيه بس.` }; }
  const saved = await upsertOffer(env, ex, url, storeId, via === 'page' ? 'jsonld' : 'api');
  await record('added', saved.id, via);
  return { status: saved.created ? 'added' : 'merged', productId: saved.id, via };
}
/** Extension: the user's browser read the product from the page they are viewing. Labelled as user-reported. */
export async function observe(env: Env, b: Row, userKey: string) {
  const url = canonicalUrl(str(b.url, 600));
  let host: string; try { host = new URL(url).hostname; } catch { return fail(400, 'bad_url', 'bad url'); }
  const storeId = storeFromHost(host);
  if (!storeId) fail(400, 'unknown_store', 'متجر مش مدعوم');
  const ex: Extracted = { title: str(b.title, 200), brand: str(b.brand, 60) || null, price: Number(b.price) || null, currency: str(b.currency, 8) || 'EGP', image: str(b.image, 600) || null, inStock: b.inStock !== false, gtin: str(b.gtin, 20) || null, crumbs: [], source: 'user' };
  if (!ex.title || !ex.price || !/EGP|LE/i.test(ex.currency ?? '')) fail(400, 'invalid', 'بيانات ناقصة');
  const saved = await upsertOffer(env, ex, url, storeId!, 'user');
  return { ok: true, productId: saved.id, userReported: true, by: userKey.slice(0, 6) };
}
export async function upsertOffer(env: Env, ex: Extracted, url: string, storeId: string, src: string): Promise<{ id: string; created: boolean }> {
  const brand = guessBrand(ex.title, ex.brand);
  const key = matchKey({ title: ex.title, brand, gtin: ex.gtin, mpn: ex.mpn });
  const id = await productId(key);
  const now = nowIso();
  if (!ex.price || ex.price >= MAX_SANE_PRICE) throw new Error('implausible_price');
  const offer: Offer = { s: storeId, u: url, p: ex.price!, l: ex.listPrice ?? null, k: ex.inStock === false ? 0 : 1, t: now, src, h: [[Math.floor(Date.now() / 60000), ex.price!]], ...(ex.image ? { i: String(ex.image).slice(0, 400) } : {}) };
  const r = await env.DB.prepare('SELECT * FROM catalog WHERE id=?').bind(id).first<Row>();
  if (r) {
    const all = parseJ<Offer[]>(r.offers, []);
    const prev = all.find((o) => o.u === url);
    if (prev?.h.length) offer.h = [...prev.h, ...(prev.h[prev.h.length - 1]![1] !== offer.p ? offer.h : [])].slice(-240); // keep history
    const offers = all.filter((o) => o.u !== url);
    offers.push(offer);
    await saveOffers(env, r, offers);
    return { id, created: false };
  }
  const cat = categorize(ex.title, ex.crumbs);
  const isAr = /[\u0600-\u06FF]/.test(ex.title);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO catalog (id,mkey,title,title_ar,brand,category,image,gtin,cond,price,list_price,store,url,n_offers,in_stock,offers,low,med30,heat,source,first_seen,updated_at,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,0,?,?,?,?)`)
      .bind(id, key, ex.title.slice(0, 200), isAr ? ex.title.slice(0, 200) : null, brand, cat, ex.image ?? null, ex.gtin ?? null, condition(ex.title), ex.price, ex.listPrice ?? null, storeId, url, offer.k, JSON.stringify([offer]), ex.price, ex.price, src, now, now, now),
    env.DB.prepare('INSERT INTO catalog_fts (rowid, text) SELECT rowid, ? FROM catalog WHERE id=?').bind(searchText(ex.title, brand).slice(0, 600), id),
  ]);
  return { id, created: true };
}

// ---------------- coupons ----------------
export async function coupons(env: Env, store?: string | null) {
  const rows = (await env.DB.prepare(`SELECT * FROM coupons WHERE status='visible' AND (expires IS NULL OR expires > ?) ${store ? 'AND store=?' : ''} ORDER BY (worked - failed) DESC, created_at DESC LIMIT 100`).bind(nowIso(), ...(store ? [store] : [])).all<Row>()).results;
  // Real store-side sales from the feeds (the store's own compare-at price), as a second section.
  const sales = (await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog WHERE list_price > price * 1.15 AND in_stock=1 ORDER BY heat DESC LIMIT 24`).all<Row>()).results;
  return { coupons: rows.map((c) => ({ ...c, store: storeInfo(c.store) })), storeSales: sales.map(toCard) };
}

// ---------------- feed / meta ----------------
export async function feed(env: Env, sp: URLSearchParams) {
  const cats = (sp.get('cats') ?? '').split(',').filter((c) => categoryBySlug(c)).slice(0, 5);
  const brands = (sp.get('brands') ?? '').split(',').map((b) => normAr(b)).filter(Boolean).slice(0, 5);
  const max = Number(sp.get('max') ?? 0) || 0;
  const out: Row[] = [];
  for (const c of cats) out.push(...(await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog WHERE category=? AND in_stock=1 ${max ? 'AND price<=?' : ''} ORDER BY heat DESC LIMIT 12`).bind(c, ...(max ? [max] : [])).all<Row>()).results);
  for (const b of brands) out.push(...(await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog WHERE brand=? AND in_stock=1 ORDER BY heat DESC LIMIT 8`).bind(b).all<Row>()).results);
  if (out.length < 12) out.push(...(await env.DB.prepare(`SELECT ${CARD_COLS} FROM catalog WHERE in_stock=1 ORDER BY heat DESC LIMIT 24`).all<Row>()).results);
  const seen = new Set<string>();
  const items = out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).sort((a, b) => b.heat - a.heat).slice(0, 40).map(toCard);
  return { items, personalised: cats.length + brands.length > 0 };
}
export async function meta(env: Env) {
  const m = parseJ<Row>((await env.DB.prepare("SELECT value FROM settings WHERE key='catalog_meta'").first<{ value: string }>())?.value, {});
  const stores = (await env.DB.prepare('SELECT * FROM stores ORDER BY products DESC').all<Row>()).results;
  const cats = (await env.DB.prepare('SELECT category, COUNT(*) n FROM catalog GROUP BY category').all<Row>()).results;
  const drops24 = (await env.DB.prepare('SELECT COUNT(*) n FROM drops WHERE at > ?').bind(new Date(Date.now() - 86400_000).toISOString()).first<{ n: number }>())?.n ?? 0;
  return {
    ...m, drops24, amazon: amazon.configured(env), noon: Boolean(env.NOON_FEED_URL),
    stores: stores.map((s) => ({ ...storeInfo(s.id), kind: s.kind, products: s.products, lastCrawl: s.last_crawl })),
    categories: CATEGORIES.map((c) => ({ slug: c.slug, nameAr: c.ar, nameEn: c.en, emoji: c.emoji, n: cats.find((x) => x.category === c.slug)?.n ?? 0 })),
  };
}
export async function drops(env: Env, since: number, limit = 30) {
  const rows = (await env.DB.prepare(`SELECT d.id AS drop_id, d.old, d.new, d.pct, d.at, d.store AS drop_store, ${CARD_COLS.split(',').map((x) => `c.${x}`).join(',')} FROM drops d JOIN catalog c ON c.id=d.product_id WHERE d.id > ? ORDER BY d.id DESC LIMIT ?`).bind(since, limit).all<Row>()).results;
  return { items: rows.map((r) => ({ dropId: r.drop_id, old: r.old, new: r.new, pct: r.pct, at: r.at, store: storeInfo(r.drop_store), product: toCard(r) })), last: rows[0]?.drop_id ?? since };
}

// ---------------- routes ----------------
type Ctx = { req: Request; env: Env; url: URL; p: string[]; exec: ExecutionContext };
type On = (m: string, path: string, h: (c: Ctx) => Promise<unknown> | unknown) => void;
async function userKey(c: Ctx, authenticate: (env: Env, req: Request) => Promise<{ user: { id: string } } | null>): Promise<string> {
  const a = await authenticate(c.env, c.req).catch(() => null);
  if (a) return `u:${a.user.id}`;
  const ip = c.req.headers.get('cf-connecting-ip') ?? '0';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${c.req.headers.get('user-agent') ?? ''}|${c.env.JWT_SECRET.slice(0, 8)}`));
  return `a:${Array.from(new Uint8Array(d).slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('')}`;
}
export function register(on: On, authenticate: (env: Env, req: Request) => Promise<{ user: { id: string } } | null>) {
  on('GET', '/api/v5/meta', (c) => cached(c.req, 300, () => meta(c.env), c.exec));
  on('GET', '/api/v5/search', (c) => cached(c.req, 120, () => search(c.env, c.url.searchParams), c.exec));
  on('GET', '/api/v5/suggest', (c) => cached(c.req, 300, async () => { const sp = new URLSearchParams({ q: c.url.searchParams.get('q') ?? '', limit: '8' }); const r = await search(c.env, sp); return { items: r.items.map((x) => ({ id: x.id, title: x.titleAr, image: x.image, price: x.lowestPriceEgp, store: x.bestOffer.store.nameAr })), fuzzy: r.fuzzy }; }, c.exec));
  on('GET', '/api/v5/deals', (c) => cached(c.req, 120, () => search(c.env, new URLSearchParams({ cat: c.url.searchParams.get('cat') ?? '', sort: c.url.searchParams.get('sort') ?? 'heat', limit: c.url.searchParams.get('limit') ?? '40', page: c.url.searchParams.get('page') ?? '0', instock: '1' })), c.exec));
  on('GET', '/api/v5/feed', (c) => cached(c.req, 180, () => feed(c.env, c.url.searchParams), c.exec));
  on('GET', '/api/v5/product/:id', async (c) => { const p = await product(c.env, c.p[0]!, c.exec); if (!p) fail(404, 'not_found', 'المنتج مش موجود'); return p; });
  on('GET', '/api/v5/compare', async (c) => {
    const ids = (c.url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
    const items = []; for (const id of ids) { const p = await product(c.env, id); if (p) items.push(p); }
    return { items };
  });
  on('GET', '/api/v5/drops', async (c) => drops(c.env, Number(c.url.searchParams.get('since') ?? 0) || 0, Math.min(Number(c.url.searchParams.get('limit') ?? 30) || 30, 60)));
  // Server-sent events: pushes new drops as they are recorded (cron/user refreshes). Clients reconnect every ~25 s.
  on('GET', '/api/v5/live', async (c) => {
    let last = Number(c.url.searchParams.get('since') ?? c.req.headers.get('last-event-id') ?? 0) || 0;
    if (!last) last = (await c.env.DB.prepare('SELECT MAX(id) m FROM drops').first<{ m: number }>())?.m ?? 0;
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter(); const enc = new TextEncoder();
    c.exec.waitUntil((async () => {
      await w.write(enc.encode(`retry: 5000\nevent: hello\ndata: {"since":${last}}\n\n`));
      for (let i = 0; i < 3; i++) {
        const d = await drops(c.env, last, 10);
        if (d.items.length) { last = d.last; await w.write(enc.encode(`id: ${last}\nevent: drops\ndata: ${JSON.stringify(d.items)}\n\n`)); }
        else await w.write(enc.encode(': ping\n\n'));
        await new Promise((r) => setTimeout(r, 8000));
      }
      await w.close();
    })().catch(() => w.close().catch(() => null)));
    return new Response(readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
  });
  on('POST', '/api/v5/vote', async (c) => {
    const k = await userKey(c, authenticate);
    if (!(await rateLimit(c.env, `vote:${k}`, 60, 3600))) fail(429, 'slow_down', 'استنى شوية قبل ما تصوّت تاني');
    const b = (await c.req.json().catch(() => ({}))) as Row;
    return vote(c.env, k, str(b.id, 40), Number(b.v));
  });
  on('GET', '/api/v5/votes/mine', async (c) => {
    const k = await userKey(c, authenticate);
    const ids = (c.url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 60);
    if (!ids.length) return { votes: {} };
    const rows = (await c.env.DB.prepare(`SELECT product_id, v FROM votes WHERE user_key=? AND product_id IN (${ids.map(() => '?').join(',')})`).bind(k, ...ids).all<Row>()).results;
    return { votes: Object.fromEntries(rows.map((r) => [r.product_id, r.v])) };
  });
  on('POST', '/api/v5/submit', async (c) => {
    const k = await userKey(c, authenticate);
    if (!(await rateLimit(c.env, `submit:${k}`, 15, 3600))) fail(429, 'slow_down', 'وصلت للحد — جرّب بعد ساعة');
    const b = (await c.req.json().catch(() => ({}))) as Row;
    return submitLink(c.env, str(b.url, 800), k);
  });
  on('POST', '/api/v5/observe', async (c) => {
    const k = await userKey(c, authenticate);
    if (!(await rateLimit(c.env, `observe:${k}`, 40, 3600))) fail(429, 'slow_down', 'وصلت للحد');
    return observe(c.env, (await c.req.json().catch(() => ({}))) as Row, k);
  });
  on('GET', '/api/v5/coupons', (c) => cached(c.req, 120, () => coupons(c.env, c.url.searchParams.get('store')), c.exec));
  on('POST', '/api/v5/coupons', async (c) => {
    const a = await authenticate(c.env, c.req); if (!a) fail(401, 'unauthorized', 'سجّل دخول عشان تشارك كوبون');
    if (!(await rateLimit(c.env, `coupon:${a!.user.id}`, 10, 86400))) fail(429, 'slow_down', 'كفاية كوبونات النهارده 🙏');
    const b = (await c.req.json().catch(() => ({}))) as Row;
    const store = str(b.store, 30); const title = str(b.title, 140);
    if (!STORE_NAMES[store] || !title) fail(400, 'invalid', 'اختار متجر واكتب وصف');
    if (/https?:\/\/|wa\.me|\+?\d{10,}/i.test(`${title} ${b.code ?? ''}`)) fail(400, 'invalid', 'من غير روابط أو أرقام تليفونات');
    const id = uid('cp_');
    await c.env.DB.prepare('INSERT INTO coupons (id,store,code,title,url,expires,source,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, store, str(b.code, 40) || null, title, null, str(b.expires, 30) || null, 'community', a!.user.id, nowIso()).run();
    return { id };
  });
  on('POST', '/api/v5/coupons/:id/feedback', async (c) => {
    const k = await userKey(c, authenticate);
    if (!(await rateLimit(c.env, `cpfb:${k}:${c.p[0]}`, 1, 86400 * 30))) return { ok: true, dup: true };
    const b = (await c.req.json().catch(() => ({}))) as Row;
    await c.env.DB.prepare(`UPDATE coupons SET ${b.worked ? 'worked=worked+1' : 'failed=failed+1'} WHERE id=?`).bind(c.p[0]).run();
    return { ok: true };
  });
  on('GET', '/api/v5/amazon/search', async (c) => {
    if (!amazon.configured(c.env)) return { configured: false, docs: 'https://github.com/Omar08263/safqa/blob/main/docs/catalog.md#amazon-creators-api' };
    return { configured: true, items: await amazon.search(c.env, str(c.url.searchParams.get('q') ?? '', 100)) };
  });
}
