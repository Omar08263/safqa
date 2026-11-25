#!/usr/bin/env node
// safqa-catalog CLI: one entry point for the catalog tooling.
//   node deploy/catalog/cli.ts status                 live source health/freshness (from the Worker)
//   node deploy/catalog/cli.ts probe <https://store>  store-adapter generator: checks robots.txt, Shopify/WooCommerce
//                                                     public feeds, sitemaps and JSON-LD, then prints a StoreSrc snippet
//   node deploy/catalog/cli.ts crawl [--stores a,b]   run the polite crawler (same as crawl.ts)
// Honest UA, robots.txt respected, ≥2.5 s between requests, stops on 403/429/captcha. No evasion of any kind.
import { spawnSync } from 'node:child_process';

const UA = 'SafqaBot/5.0 (+https://safqaeg.pages.dev/about; price comparison; contact via site)';
const API = process.env.SAFQA_EDGE ?? 'https://safqa-api.safqaeg.workers.dev';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastAt = 0;
async function politeGet(url: string): Promise<Response | null> {
  const wait = lastAt + 2500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  try {
    return await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html,application/xml;q=0.9,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  } catch { return null; }
}

const txt = async (r: Response | null) => { try { return r?.ok ? await r.text() : ''; } catch { return ''; } };

function robotsAllows(txt: string, path: string): boolean {
  let applies = false; const rules: [boolean, string][] = [];
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim(); const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1]!.toLowerCase(); const v = m[2]!.trim();
    if (k === 'user-agent') applies = v === '*' || /safqabot/i.test(v);
    else if (applies && (k === 'allow' || k === 'disallow') && v) rules.push([k === 'allow', v]);
  }
  let best: [boolean, string] | null = null;
  for (const r of rules) { const re = new RegExp('^' + r[1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')); if (re.test(path) && (!best || r[1].length > best[1].length)) best = r; }
  return best ? best[0] : true;
}

async function probe(input: string) {
  const base = new URL(input).origin; const host = new URL(base).hostname.replace(/^www\./, '');
  const out: string[] = []; const log = (s: string) => { out.push(s); console.log(s); };
  log(`🔎 probing ${base} as ${UA}`);
  const rb = await politeGet(`${base}/robots.txt`);
  const robots = await txt(rb);
  log(rb ? `robots.txt: HTTP ${rb.status} (${robots.length} bytes)` : 'robots.txt: unreachable');
  if (rb && [401, 403, 429].includes(rb.status)) { log('⛔ the site refuses our honest crawler; stop here (we never disguise it).'); return; }
  const sitemaps = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  let kind: 'shopify' | 'woocommerce' | 'sitemap' | null = null;
  if (robotsAllows(robots, '/products.json')) {
    const r = await politeGet(`${base}/products.json?limit=1`);
    if (r?.ok && /json/.test(r.headers.get('content-type') ?? '')) { const j = await r.json().catch(() => null) as { products?: unknown[] } | null; if (j?.products) { kind = 'shopify'; log('✅ Shopify public storefront feed (/products.json): best option — full catalog, newest first.'); } }
  }
  if (!kind && robotsAllows(robots, '/wp-json/wc/store/v1/products')) {
    const r = await politeGet(`${base}/wp-json/wc/store/v1/products?per_page=1`);
    if (r?.ok && /json/.test(r.headers.get('content-type') ?? '')) { const j = await r.json().catch(() => null); if (Array.isArray(j)) { kind = 'woocommerce'; log('✅ WooCommerce public Store API (/wp-json/wc/store/v1/products) — paginate with per_page=100&page=N.'); } }
  }
  let sample: string | null = null;
  if (!kind) {
    const sm = sitemaps[0] ?? `${base}/sitemap.xml`;
    const r = await politeGet(sm); const xml = await txt(r);
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
    log(`sitemap ${sm}: ${r ? `HTTP ${r.status}` : 'unreachable'}, ${locs.length} <loc> entries`);
    const child = locs.find((l) => /product|catalog|item/i.test(l) && /\.xml/.test(l));
    let urls = locs.filter((l) => !/\.xml(\.gz)?$/.test(l));
    if (!urls.length && child) { const r2 = await politeGet(child); const x2 = await txt(r2); urls = [...x2.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!); log(`child sitemap ${child}: ${urls.length} urls`); }
    sample = urls.find((u) => /\d/.test(new URL(u).pathname) && new URL(u).pathname.split('-').length > 3) ?? urls[0] ?? null;
    if (sample && robotsAllows(robots, new URL(sample).pathname)) {
      const p = await politeGet(sample); const html = await txt(p);
      const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!).join('\n');
      const hasProduct = /"@type"\s*:\s*\[?\s*"Product"/.test(ld); const hasOg = /product:price:amount|og:price:amount/.test(html);
      log(`sample ${sample}: HTTP ${p?.status ?? '—'}; JSON-LD Product: ${hasProduct ? 'yes' : 'no'}; OG price: ${hasOg ? 'yes' : 'no'}`);
      if (hasProduct || hasOg) kind = 'sitemap';
      else log('⚠️ no structured price on product pages; the Worker can still try its self-healing extractor (price selectors, then Workers AI).');
    }
  }
  if (!kind) { log('❌ no polite, structured source found. Options: ask the store for a feed, or rely on user-pasted links and the extension.'); return; }
  const id = host.split('.')[0]!.replace(/[^a-z0-9]/g, '');
  const prodRe = sample ? new URL(sample).pathname.replace(/[a-z0-9]+(?:-[a-z0-9]+)+/i, '[a-z0-9-]+').replace(/\d+/g, '\\d+') : '';
  console.log('\n// ---- paste into deploy/catalog/stores.ts ----');
  console.log(kind === 'sitemap'
    ? `  { id: '${id}', nameAr: '${id}', nameEn: '${id}', domain: '${host}', base: '${base}', kind: 'sitemap', sitemaps: [${JSON.stringify(sitemaps[0] ?? `${base}/sitemap.xml`).replace(/"/g, "'")}], product: /${prodRe.replace(/\//g, '\\/')}$/, budget: 400 },`
    : `  { id: '${id}', nameAr: '${id}', nameEn: '${id}', domain: '${host}', base: '${base}', kind: '${kind}' },${kind === 'woocommerce' ? '  // needs the woocommerce adapter (see docs/roadmap-v5.md)' : ''}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'budget') {
  const { accountWrites } = await import('./account-budget.ts');
  const real = await accountWrites();
  const worker = await (await fetch(`${API}/api/v5/budget`)).json() as { used: number; jobs: { job: string; rows: number }[]; resetsAt: string };
  console.log(`account (Cloudflare analytics): ${real ? `${real.rowsWritten.toLocaleString()} rows written / 100,000 today (UTC), ${real.rowsRead.toLocaleString()} read / 5,000,000` : 'set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN to see it'}`);
  console.log(`worker-metered: ${worker.used} rows · ${worker.jobs.map((j) => `${j.job}=${j.rows}`).join(' ')} · resets ${worker.resetsAt}`);
} else if (cmd === 'status') {
  const r = await fetch(`${API}/api/v5/health`); const h = await r.json() as { stores: { store: string; products: number; newestCheck: string | null; oldestCheck: string | null; feed: boolean; pausedUntil: string | null }[]; ingest: { at: string; store: string; kind: string; added: number; updated: number }[]; drops24h: number; recrawl: unknown };
  const age = (s: string | null) => (s ? `${Math.round((Date.now() - Date.parse(s)) / 60000)}m` : '—');
  console.table(h.stores.map((s) => ({ store: s.store, products: s.products, newest: age(s.newestCheck), oldest: age(s.oldestCheck), method: s.feed ? 'feed' : 'sitemap', paused: s.pausedUntil ?? '' })));
  console.log(`drops 24h: ${h.drops24h} · last ingest runs:`); for (const x of h.ingest.slice(0, 8)) console.log(`  ${x.at} ${x.store} ${x.kind} +${x.added} ↻${x.updated}`);
} else if (cmd === 'probe' && rest[0]) {
  await probe(rest[0]);
} else if (cmd === 'crawl') {
  const r = spawnSync(process.execPath, [new URL('./crawl.ts', import.meta.url).pathname, ...rest], { stdio: 'inherit' }); process.exit(r.status ?? 1);
} else {
  console.log('usage: node deploy/catalog/cli.ts budget | status | probe <url> | crawl [--stores a,b] [--no-crawl]');
}
