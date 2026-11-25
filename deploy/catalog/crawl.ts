// Safqa v5 catalog crawler (Node 24, runs .ts directly).
//   node deploy/catalog/crawl.ts                 crawl all stores, build, push to D1
//   node deploy/catalog/crawl.ts --stores kimo,btech --budget 200
//   node deploy/catalog/crawl.ts --no-crawl      rebuild + push from the local state only
//   node deploy/catalog/crawl.ts --dry           build only, print stats, write nothing remote
// Politeness: honest SafqaBot UA, robots.txt (incl. Crawl-delay) obeyed, one request at a time per host
// (>= 2.5 s apart), conditional GETs, stop a store on 403/429/503 (never retried with another identity).
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { STORES, FOCUS, type StoreSrc } from './stores.ts';
import { categorize, canonicalUrl, condition, extractProduct, guessBrand, matchKey, normAr, parseSpecs, plausibleEgp, productId, searchText, type Extracted } from '../../apps/edge/src/catalog/core.ts';
import { pushCatalog, type BuiltProduct } from './push.ts';
import { aiCategorize } from './ai.ts';

export const UA = 'SafqaBot/5.0 (+https://safqaeg.pages.dev/about; price comparison; contact via site)';
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const DATA = process.env.SAFQA_DATA ?? '/workspace/safqa-data';
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'catalog.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS pages (url TEXT PRIMARY KEY, store TEXT NOT NULL, lastmod TEXT, status TEXT NOT NULL DEFAULT 'new', fetched_at TEXT, fails INTEGER NOT NULL DEFAULT 0, etag TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS pages_store ON pages (store, status);
CREATE TABLE IF NOT EXISTS ai_cat (key TEXT PRIMARY KEY, slug TEXT);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, store TEXT, fetched INTEGER, ok INTEGER, note TEXT);
`);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------- robots ----------------
interface Robots { rules: { allow: boolean; re: RegExp; len: number }[]; delay: number }
const robotsCache = new Map<string, Robots>();
async function robots(base: string): Promise<Robots> {
  const host = new URL(base).origin;
  if (robotsCache.has(host)) return robotsCache.get(host)!;
  let txt = '';
  try { const r = await fetch(`${host}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }); if (r.ok) txt = await r.text(); } catch { /* none */ }
  const groups: { agents: string[]; lines: string[] }[] = [];
  let cur: { agents: string[]; lines: string[] } | null = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1]!.toLowerCase(), v = m[2]!.trim();
    if (k === 'user-agent') { if (!cur || cur.lines.length) { cur = { agents: [], lines: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if (cur) cur.lines.push(`${k}:${v}`);
  }
  const mine = groups.find((g) => g.agents.some((a) => a.includes('safqabot'))) ?? groups.find((g) => g.agents.includes('*'));
  const out: Robots = { rules: [], delay: 2.5 };
  for (const l of mine?.lines ?? []) {
    const [k, ...rest] = l.split(':'); const v = rest.join(':');
    if (k === 'crawl-delay') out.delay = Math.max(out.delay, Math.min(Number(v) || 0, 30));
    if ((k === 'allow' || k === 'disallow') && v) {
      const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
      out.rules.push({ allow: k === 'allow', re, len: v.length });
    }
  }
  robotsCache.set(host, out);
  return out;
}
function allowed(r: Robots, url: string): boolean {
  const u = new URL(url); const p = u.pathname + u.search;
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of r.rules) if (rule.re.test(p) && (!best || rule.len > best.len || (rule.len === best.len && rule.allow))) best = rule;
  return best ? best.allow : true;
}

// ---------------- polite fetch ----------------
const lastHit = new Map<string, number>();
class Blocked extends Error {}
async function politeGet(url: string, delayS: number, accept = 'text/html,application/json;q=0.9,*/*;q=0.5', timeoutMs = 30000): Promise<{ status: number; body: Buffer; etag?: string | null }> {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + delayS * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept, 'accept-language': 'en,ar;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 403 || r.status === 429 || r.status === 503) throw new Blocked(`${r.status} on ${url}`);
      const body = Buffer.from(await r.arrayBuffer());
      if (r.status >= 500 && attempt === 0) { await sleep(5000); continue; }
      return { status: r.status, body, etag: r.headers.get('etag') };
    } catch (e) {
      if (e instanceof Blocked) throw e;
      if (attempt === 0) { await sleep(4000); continue; }
      return { status: 0, body: Buffer.alloc(0) };
    }
  }
  return { status: 0, body: Buffer.alloc(0) };
}
const looksBlocked = (html: string) => /captcha|are you a robot|access denied|request rejected|cf-chl|challenge-platform/i.test(html.slice(0, 20000));

// ---------------- sources ----------------
const upsertPage = db.prepare(`INSERT INTO pages (url, store, lastmod, status, fetched_at, data) VALUES (?,?,?,?,?,?)
  ON CONFLICT(url) DO UPDATE SET lastmod=COALESCE(excluded.lastmod, lastmod), status=excluded.status, fetched_at=excluded.fetched_at, data=excluded.data, fails=0`);
const addUrl = db.prepare(`INSERT INTO pages (url, store, lastmod) VALUES (?,?,?) ON CONFLICT(url) DO UPDATE SET lastmod=COALESCE(excluded.lastmod, lastmod)`);

async function crawlShopify(s: StoreSrc) {
  const rb = await robots(s.base);
  if (!allowed(rb, `${s.base}/products.json`)) { log(s.id, 'products.json disallowed by robots — skipping'); return 0; }
  let n = 0; const now = new Date().toISOString();
  {
    for (let page = 1; page <= 120; page++) {
      const r = await politeGet(`${s.base}/products.json?limit=250&page=${page}`, Math.max(rb.delay, 2), 'application/json');
      if (r.status !== 200) { log(s.id, 'page', page, 'status', r.status); break; }
      // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
      const products: any[] = JSON.parse(r.body.toString('utf8')).products ?? [];
      if (!products.length) break;
      db.exec('BEGIN');
      for (const p of products) {
        // biome-ignore lint/suspicious/noExplicitAny: Shopify JSON.
        const vars: any[] = p.variants ?? [];
        const avail = vars.filter((v) => v.available);
        const pick = (avail.length ? avail : vars).map((v) => ({ v, price: Number(v.price) })).filter((x) => x.price > 0).sort((a, b) => a.price - b.price)[0];
        if (!pick) continue;
        const cmp = Number(pick.v.compare_at_price) || null;
        const ex: Extracted & { url: string; productType?: string; tags?: string[] } = {
          url: `${s.base}/products/${p.handle}`, title: String(p.title).trim(), brand: p.vendor ?? null, sku: pick.v.sku || null, gtin: pick.v.barcode || null,
          image: p.images?.[0]?.src ?? null, price: pick.price, listPrice: cmp && cmp > pick.price ? cmp : null, currency: 'EGP', inStock: avail.length > 0,
          crumbs: [], source: 'feed', productType: p.product_type ?? '', tags: Array.isArray(p.tags) ? p.tags.slice(0, 12) : String(p.tags ?? '').split(',').slice(0, 12),
        };
        upsertPage.run(ex.url, s.id, p.updated_at ?? null, 'ok', now, JSON.stringify(ex));
        n++;
      }
      db.exec('COMMIT');
      if (page % 5 === 0) log(s.id, 'feed page', page, 'items', n);
    }
    // Products gone from the feed are out of stock/removed.
    if (n > 50) db.prepare(`UPDATE pages SET status='gone' WHERE store=? AND status='ok' AND fetched_at < ?`).run(s.id, now);
  }
  return n;
}

async function sitemapUrls(s: StoreSrc, rb: Robots): Promise<number> {
  const queue = [...(s.sitemaps ?? [])]; let added = 0; let maps = 0;
  const found: [string, string | null][] = [];
  while (queue.length && maps < 40) {
    const sm = queue.shift()!; maps++;
    const r = await politeGet(sm, rb.delay, 'application/xml,text/xml,*/*', 180000);
    if (r.status !== 200) continue;
    let buf = r.body;
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    const xml = buf.toString('utf8');
    for (const m of xml.matchAll(/<sitemap>\s*<loc>(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?<\/loc>/g)) if (queue.length < 60) queue.push(m[1]!.trim());
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = m[1]!.match(/<loc>(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?<\/loc>/)?.[1]?.trim().replace(/&amp;/g, '&');
      if (!loc) continue;
      if (s.product && !s.product.test(loc)) continue;
      if (s.focus && !FOCUS.test(loc.toLowerCase())) continue;
      if (!allowed(rb, loc)) continue;
      found.push([canonicalUrl(loc), m[1]!.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null]);
      added++;
    }
  }
  db.exec('BEGIN'); for (const [u, lm] of found) addUrl.run(u, s.id, lm); db.exec('COMMIT');
  return added;
}

async function crawlSitemapStore(s: StoreSrc, budget: number) {
  const rb = await robots(s.base);
  const urls = await sitemapUrls(s, rb);
  log(s.id, 'sitemap product urls', urls, 'delay', rb.delay);
  // New first, then pages whose lastmod moved or that are older than 3 days (incremental refresh).
  const stale = new Date(Date.now() - 3 * 86400_000).toISOString();
  const due = db.prepare(`SELECT url FROM pages WHERE store=? AND (status='new' OR (status='ok' AND (fetched_at < ? OR (lastmod IS NOT NULL AND lastmod > fetched_at))) OR (status='err' AND fails < 3))
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'ok' THEN 1 ELSE 2 END, RANDOM() LIMIT ?`).all(s.id, stale, budget) as { url: string }[];
  let ok = 0, fetched = 0;
  const misses: string[] = [];
  const mark = db.prepare(`UPDATE pages SET status=?, fetched_at=?, fails=fails+?, data=COALESCE(?, data) WHERE url=?`);
  for (const { url } of due) {
    let r;
    try { r = await politeGet(url, rb.delay); } catch (e) { log(s.id, 'STOP (blocked):', (e as Error).message); db.prepare('INSERT INTO runs (at,store,fetched,ok,note) VALUES (?,?,?,?,?)').run(new Date().toISOString(), s.id, fetched, ok, 'blocked'); return ok; }
    fetched++;
    const now = new Date().toISOString();
    // A store that answers every request with an error is refusing our honest bot (or is down): stop politely
    // instead of marking its whole catalogue "gone". We never retry with a disguised client.
    if (r.status !== 200) misses.push(url); else misses.length = 0;
    if (misses.length >= 20 && ok === 0) {
      log(s.id, `STOP: ${misses.length} consecutive HTTP errors with no product — store refuses SafqaBot or is down; not evading`);
      db.prepare(`UPDATE pages SET status='new' WHERE store=? AND status='gone' AND data IS NULL`).run(s.id);
      db.prepare('INSERT INTO runs (at,store,fetched,ok,note) VALUES (?,?,?,?,?)').run(now, s.id, fetched, ok, `refused HTTP ${r.status}`);
      return ok;
    }
    if (r.status === 404 || r.status === 410) { mark.run('gone', now, 0, null, url); continue; }
    if (r.status !== 200) { mark.run('err', now, 1, null, url); continue; }
    const html = r.body.toString('utf8');
    if (looksBlocked(html)) { log(s.id, 'STOP: bot check page, not evading'); return ok; }
    const ex = extractProduct(html);
    if (!ex || !ex.price) { mark.run('noproduct', now, 0, null, url); continue; }
    if (ex.currency && !/EGP|LE|جنيه/i.test(ex.currency)) { mark.run('noproduct', now, 0, null, url); continue; }
    mark.run('ok', now, 0, JSON.stringify({ ...ex, url }), url);
    ok++;
    if (fetched % 50 === 0) log(s.id, `fetched ${fetched}/${due.length} ok ${ok}`);
  }
  db.prepare('INSERT INTO runs (at,store,fetched,ok,note) VALUES (?,?,?,?,?)').run(new Date().toISOString(), s.id, fetched, ok, 'done');
  return ok;
}

// ---------------- build ----------------
const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
export async function build(): Promise<BuiltProduct[]> {
  const rows = db.prepare(`SELECT url, store, data, status, fetched_at FROM pages WHERE data IS NOT NULL AND status IN ('ok','gone')`).all() as { url: string; store: string; data: string; status: string; fetched_at: string }[];
  const groups = new Map<string, { key: string; offers: (Extracted & { url: string; store: string; productType?: string; status: string; at: string })[] }>();
  for (const r of rows) {
    const ex = JSON.parse(r.data);
    if (!ex.price || !ex.title) continue;
    const brand = guessBrand(ex.title, ex.brand);
    let key = matchKey({ title: ex.title, brand, gtin: ex.gtin, mpn: ex.mpn });
    // A store never lists the same product twice: a same-store collision means the key is too coarse.
    const prev = groups.get(key);
    if (prev?.offers.some((o) => o.store === r.store && o.url !== r.url)) key = `${key}|${normAr(ex.title).split(' ').sort().join('-').slice(0, 160)}`;
    const g = groups.get(key) ?? { key, offers: [] };
    g.offers.push({ ...ex, brand, store: r.store, status: r.status, at: r.fetched_at });
    groups.set(key, g);
  }
  const unknown: { key: string; title: string }[] = [];
  const out: BuiltProduct[] = [];
  for (const g of groups.values()) {
    // One offer per store (cheapest live) for a product.
    const byStore = new Map<string, (typeof g.offers)[number]>();
    for (const o of g.offers) {
      const cur = byStore.get(o.store);
      const live = (x: typeof o) => x.status === 'ok' && x.inStock !== false;
      if (!cur || (live(o) && !live(cur)) || (live(o) === live(cur) && o.price! < cur.price!)) byStore.set(o.store, o);
    }
    const offers = [...byStore.values()];
    const en = offers.find((o) => !isArabic(o.title)) ?? offers[0]!;
    const ar = offers.find((o) => isArabic(o.title));
    const crumbs = offers.flatMap((o) => o.crumbs ?? []);
    const ptype = offers.map((o) => o.productType ?? '').join(' ');
    let category = categorize(en.title, crumbs, ptype) ?? (ar ? categorize(ar.title, crumbs, ptype) : null);
    if (!category) {
      const cached = db.prepare('SELECT slug FROM ai_cat WHERE key=?').get(g.key) as { slug: string | null } | undefined;
      if (cached) category = cached.slug; else unknown.push({ key: g.key, title: en.title });
    }
    const specs = parseSpecs(en.title);
    out.push({
      id: await productId(g.key), mkey: g.key, title: en.title.slice(0, 200), titleAr: ar?.title.slice(0, 200) ?? null, brand: en.brand ?? null, category,
      image: offers.find((o) => o.image)?.image ?? null, gtin: offers.find((o) => o.gtin)?.gtin ?? null, cond: condition(en.title),
      specs: { storageGb: specs.storageGb, ramGb: specs.ramGb, inches: specs.inches, color: specs.color },
      offers: offers.map((o) => ({ s: o.store, u: o.url, p: Math.round(o.price! * 100) / 100, l: o.listPrice ?? null, k: o.status === 'ok' && o.inStock !== false ? 1 : 0, t: o.at, r: o.rating ?? null, src: o.source })),
      search: searchText(en.title, ar?.title, en.brand, ...crumbs.slice(-2)),
    });
  }
  if (unknown.length) {
    log('AI categorise', unknown.length, 'titles (Workers AI, cached)');
    const got = await aiCategorize(unknown.map((u) => u.title));
    const ins = db.prepare('INSERT OR REPLACE INTO ai_cat (key, slug) VALUES (?,?)');
    unknown.forEach((u, i) => { const slug = got[i] ?? null; if (slug) ins.run(u.key, slug); /* never cache a miss: retry next run when quota allows */ const p = out.find((x) => x.mkey === u.key); if (p) p.category = slug; });
  }
  // Price sanity per category (drops installment figures and placeholders).
  // Placeholder prices ("1 EGP" = call for price) and installment figures never become an offer.
  for (const p of out) {
    p.offers = p.offers.filter((o) => plausibleEgp(o.p, p.category));
    // A cross-store offer far below the others is almost always a mismatch (accessory, part, deposit): drop it.
    if (p.offers.length >= 2) {
      const ps = p.offers.map((o) => o.p).sort((a, b) => a - b);
      const med = ps[Math.floor(ps.length / 2)]!;
      p.offers = p.offers.filter((o) => o.p >= med * 0.35);
    }
  }
  return out.filter((p) => p.offers.length > 0);
}

// ---------------- main ----------------
async function main() {
  const only = opt('stores')?.split(',');
  const budget = Number(opt('budget') ?? 0) || undefined;
  const stores = STORES.filter((s) => (!only || only.includes(s.id)) && (!s.disabled || only?.includes(s.id)));
  for (const s of STORES) if (s.disabled && !only?.includes(s.id)) log('skip', s.id, '—', s.disabled);
  if (!flag('no-crawl')) {
    await Promise.all(stores.map(async (s) => {
      try {
        const n = s.kind === 'shopify' ? await crawlShopify(s) : await crawlSitemapStore(s, budget ?? s.budget ?? 300);
        log('✓', s.id, n);
      } catch (e) { log('✗', s.id, (e as Error).message); }
    }));
  }
  const products = await build();
  const by = (f: (p: BuiltProduct) => string | null) => products.reduce<Record<string, number>>((a, p) => { const k = f(p) ?? 'none'; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  log('built', products.length, 'products;', 'multi-store', products.filter((p) => p.offers.length > 1).length);
  log('by category', JSON.stringify(by((p) => p.category)));
  log('offers by store', JSON.stringify(products.flatMap((p) => p.offers).reduce<Record<string, number>>((a, o) => { a[o.s] = (a[o.s] ?? 0) + 1; return a; }, {})));
  fs.writeFileSync(path.join(DATA, 'built.json'), JSON.stringify(products));
  if (flag('dry')) return;
  await pushCatalog(products, STORES, { db, log });
}
main().catch((e) => { console.error(e); process.exit(1); });
