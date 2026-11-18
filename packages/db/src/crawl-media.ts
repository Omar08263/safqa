/**
 * Product media + facts crawler for the live catalog (deploy/live/catalog.json).
 *
 * For each product it reads the store product pages once, politely (robots.txt,
 * per-host gap, the honest SafqaBot user agent, stops on any bot check), and
 * keeps only what the store itself publishes on that page:
 *   - the product gallery images (JSON-LD image, og:image and the page gallery
 *     for the same product), downloaded once to SAFQA_STATE_DIR/media-raw
 *   - the store description (JSON-LD / og:description)
 *   - the specifications table the store shows
 *   - the store's aggregate rating and review count, when present
 * Output: deploy/live/media.json (text only) + raw images on disk. Images are
 * converted to WebP by deploy/hf/build-media.py and shipped with the static site.
 *
 * Usage: pnpm --filter @safqa/db exec tsx src/crawl-media.ts [--force]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterBySlug, BlockedBySite, fetchPage, RobotsDisallowed, SAFQA_USER_AGENT } from '@safqa/adapters';

const root = resolve(import.meta.dirname, '../../..');
const catalogPath = process.env.SAFQA_LIVE_CATALOG || resolve(root, 'deploy/live/catalog.json');
const outPath = process.env.SAFQA_MEDIA_JSON || resolve(root, 'deploy/live/media.json');
const stateDir = process.env.SAFQA_STATE_DIR || '/home/box/.safqa';
const rawDir = resolve(stateDir, 'media-raw');
const force = process.argv.includes('--force');
const maxAgeDays = Number(process.env.SAFQA_MEDIA_MAX_AGE_DAYS || 7);
const MAX_IMAGES = 8;

interface CatalogProduct {
  key: string;
  category: string;
  brand: string;
  model: string;
  titleAr: string;
  titleEn: string;
  offers: { store: string; url: string }[];
}
export interface MediaImage {
  file: string; // basename under media-raw/<productId>/
  src: string; // original URL on the store CDN
  store: string;
}
export interface MediaEntry {
  key: string;
  productId: string;
  crawledAt: string;
  images: MediaImage[];
  description?: { text: string; store: string; url: string };
  specs: { key: string; value: string; store: string }[];
  ratings: { store: string; value: number; count: number | null; url: string }[];
  sources: { store: string; url: string; ok: boolean; reason?: string }[];
}

function stableId(name: string): string {
  const h = createHash('sha1').update(`safqa-live:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((Number.parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&check;/g, '✓')
    .replace(/&nbsp;/g, ' ');
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// biome-ignore lint/suspicious/noExplicitAny: raw JSON-LD
function jsonLdProduct(html: string): any | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1] ?? '');
      const list = Array.isArray(j) ? j : [j, ...(Array.isArray(j?.['@graph']) ? j['@graph'] : [])];
      for (const n of list) {
        const t = ([] as string[]).concat(n?.['@type'] ?? []).map(String);
        if (t.includes('Product') || t.includes('ProductGroup')) return n;
      }
    } catch {
      // ignore broken block
    }
  }
  return null;
}
function meta(html: string, prop: string): string | undefined {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return m?.[1] ? decode(m[1]) : undefined;
}

/** Normalised gallery "stem" so we keep images of this product, not of related ones. */
function stem(url: string): string {
  let name = decodeURIComponent(url.split('?')[0]?.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  name = name.replace(/^[0-9a-f]{32,}_/i, '').replace(/Position_\d+/i, 'Position');
  for (let i = 0; i < 3; i++) name = name.replace(/[-_]\d{1,2}$/, '');
  return name.toLowerCase();
}

function galleryFor(store: string, html: string, primary?: string): string[] {
  const found: string[] = [];
  if (store === 'amazon-eg') {
    const block = html.match(/'colorImages':\s*\{\s*'initial':\s*(\[[\s\S]*?\])\s*\}/);
    const text = block?.[1] ?? '';
    for (const m of text.matchAll(/"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g)) found.push(m[1] as string);
    if (found.length === 0) for (const m of text.matchAll(/"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g)) found.push(m[1] as string);
    const landing = html.match(/id="landingImage"[^>]+data-old-hires="([^"]+)"/)?.[1];
    if (landing) found.unshift(landing);
    return [...new Set(found)];
  }
  const pattern =
    store === 'btech'
      ? /https:\/\/media\.btech\.com\/catalogs\/[A-Za-z0-9/_\-.%]+\.(?:jpg|jpeg|png|webp)/g
      : store === '2b'
        ? /https:\/\/2b\.com\.eg\/media\/catalog\/product\/[A-Za-z0-9/_\-.]+\.(?:jpg|jpeg|png|webp)/g
        : store === 'raya'
          ? /https:\/\/prod-fastly\.rayashop\.com\/media\/catalog\/product\/[A-Za-z0-9/_\-.]+\.(?:jpg|jpeg|png|webp)/g
          : /https:\/\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/g;
  const all = [...new Set(html.match(pattern) ?? [])];
  if (!primary) return all.slice(0, 1);
  const want = stem(primary);
  const same = all.filter((u) => stem(u) === want);
  // Prefer the largest Magento cache size per file name (2B serves several).
  const byName = new Map<string, string>();
  for (const u of [primary, ...same]) {
    const name = u.split('/').pop() ?? u;
    if (!byName.has(name)) byName.set(name, u);
  }
  return [...byName.values()];
}

function specsFor(store: string, html: string): { key: string; value: string }[] {
  const specs: { key: string; value: string }[] = [];
  if (store === 'btech') {
    const m = html.match(/\\"specifications\\":(\[[\s\S]*?\])/);
    if (m?.[1]) {
      try {
        const arr = JSON.parse(m[1].replace(/\\"/g, '"')) as { key: string; value: string }[];
        for (const s of arr) if (s.key && s.value && !/^is online$/i.test(s.key)) specs.push({ key: s.key, value: decode(String(s.value)) });
      } catch {
        // fall through to table parsing
      }
    }
  }
  if (specs.length === 0) {
    const table = html.match(/<table[^>]*(?:additional-attributes|data table|specification)[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? '';
    for (const row of table.matchAll(/<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const key = strip(row[1] ?? '');
      const value = strip(row[2] ?? '');
      if (key && value && key.length < 60 && value.length < 300) specs.push({ key, value });
    }
  }
  if (store === 'amazon-eg' && specs.length === 0) {
    const t = html.match(/id="productDetails_techSpec_section_1"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? '';
    for (const row of t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const key = strip(row[1] ?? '');
      const value = strip(row[2] ?? '').replace(/^‎/, '');
      if (key && value && value.length < 300) specs.push({ key, value });
    }
  }
  return specs.slice(0, 40);
}

function cleanDescription(text: string): string {
  return decode(text)
    .replace(/Buy (online|.*?online on Amazon\.eg)[\s\S]*$/i, '')
    .replace(/- Discover the best price[\s\S]*$/i, '')
    .replace(/\r/g, '')
    .trim();
}

async function download(url: string, file: string): Promise<boolean> {
  if (existsSync(file)) return true;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': SAFQA_USER_AGENT, Accept: 'image/*' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return false;
    writeFileSync(file, buf);
    await new Promise((r) => setTimeout(r, 400));
    return true;
  } catch {
    return false;
  }
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { products: CatalogProduct[] };
const previous: Record<string, MediaEntry> = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).products ?? {} : {};
const out: Record<string, MediaEntry> = { ...previous };
const storePriority = ['btech', '2b', 'raya', 'amazon-eg', 'noon'];
// Time budget so the daily refresh stays short: products not reached today are
// picked up tomorrow (they keep their previous media until then).
const budgetMs = Number(process.env.SAFQA_MEDIA_BUDGET_S || 360) * 1000;
const started = Date.now();
let skippedForBudget = 0;

async function crawlProduct(item: CatalogProduct): Promise<void> {
  const productId = stableId(`product:${item.key}`);
  const prev = previous[productId];
  if (!force && prev && prev.images.length > 0 && Date.now() - Date.parse(prev.crawledAt) < maxAgeDays * 86_400_000) return;
  if (Date.now() - started > budgetMs) {
    skippedForBudget += 1;
    return;
  }
  const entry: MediaEntry = { key: item.key, productId, crawledAt: new Date().toISOString(), images: [], specs: [], ratings: [], sources: [] };
  const dir = resolve(rawDir, productId);
  mkdirSync(dir, { recursive: true });
  const offersSorted = [...item.offers].sort((a, b) => storePriority.indexOf(a.store) - storePriority.indexOf(b.store));
  for (const offer of offersSorted) {
    const adapter = adapterBySlug(offer.store);
    if (!adapter) continue;
    let html = '';
    try {
      html = await fetchPage(offer.url, { userAgent: SAFQA_USER_AGENT }, Math.max(2500, adapter.minIntervalMs ?? 0));
    } catch (error) {
      const reason = error instanceof BlockedBySite ? 'blocked (bot check)' : error instanceof RobotsDisallowed ? 'robots.txt disallows' : String((error as Error)?.message ?? error).slice(0, 120);
      entry.sources.push({ store: offer.store, url: offer.url, ok: false, reason });
      continue;
    }
    entry.sources.push({ store: offer.store, url: offer.url, ok: true });
    const ld = jsonLdProduct(html);
    const ldImage = ([] as unknown[]).concat(ld?.image ?? []).map((v) => (typeof v === 'string' ? v : (v as { url?: string })?.url)).find(Boolean) as string | undefined;
    const og = meta(html, 'og:image');
    const primary = ldImage ?? (og && !/share-icons|previewdoh|logo/i.test(og) ? og : undefined);
    if (entry.images.length < 3) {
      const gallery = galleryFor(offer.store, html, primary);
      for (const src of gallery) {
        if (entry.images.length >= MAX_IMAGES) break;
        const ext = (src.split('?')[0]?.match(/\.(jpg|jpeg|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
        const file = `${offer.store}-${createHash('sha1').update(src).digest('hex').slice(0, 10)}.${ext}`;
        if (await download(src, resolve(dir, file))) entry.images.push({ file, src, store: offer.store });
      }
    }
    const desc = cleanDescription(String(ld?.description ?? meta(html, 'og:description') ?? ''));
    if (desc.length > 40 && (!entry.description || desc.length > entry.description.text.length * 1.5))
      entry.description = { text: desc.slice(0, 4000), store: offer.store, url: offer.url };
    if (entry.specs.length === 0) entry.specs = specsFor(offer.store, html).map((s) => ({ ...s, store: offer.store }));
    const rating = Array.isArray(ld?.aggregateRating) ? null : ld?.aggregateRating;
    const value = Number(rating?.ratingValue);
    if (rating && Number.isFinite(value) && value > 0) {
      const count = Number(rating.reviewCount ?? rating.ratingCount);
      entry.ratings.push({ store: offer.store, value, count: Number.isFinite(count) ? count : null, url: offer.url });
    }
  }
  if (entry.images.length === 0 && prev?.images.length) entry.images = prev.images;
  if (!entry.description && prev?.description) entry.description = prev.description;
  if (entry.specs.length === 0 && prev?.specs.length) entry.specs = prev.specs;
  out[productId] = entry;
  console.log(`${item.key}: ${entry.images.length} images, ${entry.specs.length} specs, desc ${entry.description ? entry.description.text.length : 0} chars, ${entry.sources.filter((s) => s.ok).length}/${entry.sources.length} pages`);
}

// One queue per lead store, run in parallel; each store keeps its own polite gap.
const mediaQueues = new Map<string, CatalogProduct[]>();
for (const item of catalog.products) {
  const lead = [...item.offers].sort((a, b) => storePriority.indexOf(a.store) - storePriority.indexOf(b.store))[0]?.store ?? 'other';
  mediaQueues.set(lead, [...(mediaQueues.get(lead) ?? []), item]);
}
await Promise.all([...mediaQueues.values()].map(async (list) => {
  for (const item of list) await crawlProduct(item);
}));
if (skippedForBudget) console.log(`media: ${skippedForBudget} products left for the next run (time budget ${budgetMs / 1000}s)`);

writeFileSync(
  outPath,
  `${JSON.stringify({ $comment: 'Facts and gallery images published by each store on its own product page. Generated by packages/db/src/crawl-media.ts; images are re-hosted as WebP by deploy/hf/build-media.py.', generatedAt: new Date().toISOString(), products: out }, null, 1)}\n`,
);
console.log(`wrote ${outPath}`);
