/**
 * Grows deploy/live/catalog.json with real, currently priced products.
 *
 * Sources are public sitemaps of stores whose robots.txt allows product pages
 * (B.TECH, 2B, Raya Shop). Candidate URLs are picked by keyword per category,
 * then each page is read once through the normal site adapter (robots.txt,
 * per-host gap, honest SafqaBot UA, JSON-LD only). Only pages that publish a
 * real price AND say "in stock" are added. Existing catalog entries are kept.
 *
 * Usage: npx tsx src/discover-catalog.ts <dir-with-url-lists> [--budget=420]
 *   url lists: btech-en.txt, 2b-all.txt, raya-all.txt (one URL per line)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adapterBySlug, SAFQA_USER_AGENT } from '@safqa/adapters';

const root = resolve(import.meta.dirname, '../../..');
const catalogPath = resolve(root, 'deploy/live/catalog.json');
const dir = process.argv[2] || '/workspace/safqa-discover';
const budget = Number((process.argv.find((a) => a.startsWith('--budget=')) || '--budget=420').split('=')[1]);

type Cat = 'phones' | 'audio' | 'tvs' | 'appliances' | 'lifestyle' | 'laptops' | 'tablets' | 'gaming' | 'kitchen';
const plan: { cat: Cat; kw: RegExp; max: number }[] = [
  { cat: 'phones', kw: /apple-iphone-1[67]/, max: 8 },
  { cat: 'phones', kw: /samsung-galaxy-(s2[56]|a[0-9]{2}|z-(fold|flip)[67])/, max: 12 },
  { cat: 'phones', kw: /(xiaomi-|redmi-|poco-)/, max: 7 },
  { cat: 'phones', kw: /(oppo-(reno|a[0-9])|realme-|vivo-|honor-(x|[0-9]))/, max: 9 },
  { cat: 'phones', kw: /(infinix-|tecno-|nokia-|motorola-)/, max: 5 },
  { cat: 'tablets', kw: /(apple-ipad|samsung-galaxy-tab|xiaomi-pad|redmi-pad|honor-pad|lenovo-tab)/, max: 10 },
  { cat: 'laptops', kw: /(macbook|lenovo-(ideapad|thinkpad|loq|legion|yoga)|hp-(victus|pavilion|probook|15|omen)|dell-(inspiron|vostro|latitude)|asus-(vivobook|tuf|rog|zenbook)|acer-(aspire|nitro|swift)|msi-)/, max: 16 },
  { cat: 'audio', kw: /(airpods|galaxy-buds|soundcore|jbl-|sony-wh|sony-wf|huawei-freebuds|redmi-buds|anker-)/, max: 12 },
  { cat: 'lifestyle', kw: /(apple-watch|galaxy-watch|huawei-watch|huawei-band|xiaomi-(smart-band|watch)|redmi-watch|amazfit)/, max: 10 },
  { cat: 'gaming', kw: /(playstation|ps5|xbox|nintendo-switch|dualsense)/, max: 8 },
  { cat: 'tvs', kw: /(samsung|lg|toshiba|sharp|tcl|hisense|xiaomi|sony|jac|fresh|tornado)-.*(tv|led|qled|oled|uhd|smart).*(3[2]|4[03]|5[05]|6[05]|75)/, max: 18 },
  { cat: 'appliances', kw: /(refrigerator|fridge|deep-freezer)/, max: 10 },
  { cat: 'appliances', kw: /(washing-machine|washer|dishwasher)/, max: 10 },
  { cat: 'appliances', kw: /(air-conditioner|split-air|-ac-|cool-only|hot-cold)/, max: 10 },
  { cat: 'appliances', kw: /(vacuum-cleaner|water-heater|water-dispenser|air-fryer|airfryer)/, max: 12 },
  { cat: 'kitchen', kw: /(microwave|blender|coffee-machine|espresso|kettle|toaster|food-processor|mixer|cooker)/, max: 14 },
];
const stores: { slug: string; file: string; filter: (u: string) => boolean }[] = [
  { slug: 'btech', file: 'btech-en.txt', filter: (u) => !/-ab$|refurb|used|cover|case|screen-protector|glass|strap|charger|cable|adapter/.test(u) },
  { slug: '2b', file: '2b-all.txt', filter: (u) => u.split('/').length === 5 && u.endsWith('.html') && !/cover|case|screen-protector|glass|strap|charger|cable|adapter|souhoola|offer/.test(u) },
  { slug: 'raya', file: 'raya-all.txt', filter: (u) => u.split('/').length === 5 && !/cover|case|screen-protector|glass|strap|charger|cable|adapter/.test(u) },
];

const brandAr: Record<string, string> = {
  apple: 'أبل', samsung: 'سامسونج', xiaomi: 'شاومي', redmi: 'شاومي ريدمي', poco: 'بوكو', oppo: 'أوبو', realme: 'ريلمي', vivo: 'فيفو', honor: 'أونر',
  huawei: 'هواوي', infinix: 'إنفينكس', tecno: 'تكنو', nokia: 'نوكيا', motorola: 'موتورولا', lenovo: 'لينوفو', hp: 'إتش بي', dell: 'ديل', asus: 'أسوس',
  acer: 'أيسر', msi: 'إم إس آي', sony: 'سوني', lg: 'إل جي', toshiba: 'توشيبا', sharp: 'شارب', tcl: 'تي سي إل', hisense: 'هايسنس', jac: 'جاك',
  fresh: 'فريش', tornado: 'تورنيدو', carrier: 'كاريير', haier: 'هاير', beko: 'بيكو', bosch: 'بوش', ariston: 'أريستون', zanussi: 'زانوسي',
  'white point': 'وايت بوينت', kiriazi: 'كريازي', unionaire: 'يونيون إير', midea: 'ميديا', gree: 'جري', philips: 'فيليبس', braun: 'براون',
  kenwood: 'كينوود', moulinex: 'مولينكس', tefal: 'تيفال', "de'longhi": 'ديلونجي', delonghi: 'ديلونجي', black: 'بلاك آند ديكر', jbl: 'جي بي إل',
  anker: 'أنكر', soundcore: 'ساوند كور', amazfit: 'أمازفيت', microsoft: 'مايكروسوفت', nintendo: 'نينتندو', mienta: 'مينتا', zero: 'زيرو',
  'sonai': 'سوناي', 'electrostar': 'إلكتروستار', 'grouhy': 'جروهي', 'koldair': 'كولدير', 'olympic': 'أوليمبك', 'caldo': 'كالدو',
};
const catAr: Record<Cat, string> = {
  phones: 'موبايل', audio: 'سماعة', tvs: 'شاشة', appliances: 'جهاز', lifestyle: 'ساعة ذكية', laptops: 'لابتوب', tablets: 'تابلت', gaming: 'جيمنج', kitchen: 'جهاز مطبخ',
};
const applianceAr: [RegExp, string][] = [
  [/refrigerator|fridge/i, 'ثلاجة'], [/deep freezer|freezer/i, 'ديب فريزر'], [/dishwasher/i, 'غسالة أطباق'], [/washing machine|washer/i, 'غسالة'],
  [/air conditioner|split|\bac\b/i, 'تكييف'], [/vacuum/i, 'مكنسة كهربائية'], [/water heater/i, 'سخان مياه'], [/dispenser/i, 'مبرد مياه'],
  [/air ?fryer/i, 'قلاية هوائية'], [/microwave/i, 'ميكروويف'], [/blender/i, 'خلاط'], [/coffee|espresso/i, 'ماكينة قهوة'], [/kettle/i, 'غلاية'],
  [/toaster/i, 'محمصة'], [/food processor/i, 'محضرة طعام'], [/mixer/i, 'عجان'], [/cooker|oven/i, 'بوتاجاز'], [/headphone|headset/i, 'سماعة رأس'],
  [/earbuds|buds|airpods/i, 'سماعة لاسلكية'], [/speaker/i, 'سماعة بلوتوث'], [/controller|dualsense/i, 'دراع تحكم'], [/console|playstation|ps5|xbox|switch/i, 'جهاز ألعاب'],
  [/band/i, 'سوار ذكي'],
];
const colorAr: Record<string, string> = {
  black: 'أسود', white: 'أبيض', silver: 'فضي', grey: 'رمادي', gray: 'رمادي', blue: 'أزرق', green: 'أخضر', gold: 'ذهبي', red: 'أحمر',
  purple: 'بنفسجي', pink: 'وردي', titanium: 'تيتانيوم', graphite: 'جرافيت', navy: 'كحلي', beige: 'بيج', orange: 'برتقالي', yellow: 'أصفر', inox: 'استانلس',
};

function arabicTitle(cat: Cat, brand: string, en: string): string {
  const b = brand.toLowerCase();
  const bAr = brandAr[b] || brandAr[b.split(' ')[0] ?? ''] || brand;
  let kind = catAr[cat];
  for (const [re, ar] of applianceAr) if (re.test(en)) { kind = ar; break; }
  if (cat === 'phones') kind = 'موبايل';
  if (cat === 'laptops') kind = 'لابتوب';
  if (cat === 'tablets') kind = 'تابلت';
  if (cat === 'tvs') kind = 'شاشة';
  let rest = en.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '');
  rest = rest.replace(/\s*-\s*[A-Z0-9-]{6,}$/, '').replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
  rest = rest.replace(/\b(\d+)\s?GB\b/gi, '$1 جيجا').replace(/\b(\d+)\s?TB\b/gi, '$1 تيرا').replace(/\b(\d+(?:\.\d+)?)\s?Inch(es)?\b/gi, '$1 بوصة')
    .replace(/\b(\d+)\s?Liters?\b/gi, '$1 لتر').replace(/\b(\d+)\s?Watts?\b/gi, '$1 وات').replace(/\b(\d+(?:\.\d+)?)\s?HP\b/g, '$1 حصان').replace(/\b(\d+)\s?(KG|Kg|kg)\b/g, '$1 كيلو')
    .replace(/\(Official Warranty\)/gi, '(ضمان رسمي)').replace(/\bInternational Version\b/gi, 'نسخة دولية').replace(/\bDual[- ]SIM\b/gi, 'خطين').replace(/\bSmart\b/gi, 'سمارت').replace(/\bWireless\b/gi, 'لاسلكي');
  rest = rest.replace(/\b([A-Za-z]+)\b/g, (w) => colorAr[w.toLowerCase()] ?? w);
  return `${kind} ${bAr} ${rest}`.replace(/\s+/g, ' ').trim().slice(0, 110);
}

function cleanEn(title: string): string {
  return title.replace(/\s*\|.*$/, '').replace(/:\s*Buy Online.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 140);
}
function slugKey(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}
/** Same product across stores: brand + model words + storage, colour-free. */
function matchKey(brand: string, title: string): string {
  const t = title.toLowerCase().replace(/\(.*?\)/g, ' ');
  const storage = (t.match(/(\d+)\s?(gb|tb)\b(?!\s*ram)/g) || []).filter((s) => !/ram/.test(s)).slice(-1)[0]?.replace(/\s/g, '') || '';
  const words = t.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !(w in colorAr) && !/^(dual|sim|4g|5g|lte|gb|tb|ram|the|with|and|nfc|official|warranty|\d+gb|\d+tb)$/.test(w));
  return `${brand.toLowerCase()}|${words.slice(0, 5).join(' ')}|${storage}`;
}

const JUNK = /toner|cartridge|ink\b|\bcase\b|cover|screen protector|tempered|strap|charger|cable|adapter|bag\b|sleeve|stand\b|mount\b|remote control|filter\b|spare|demo/i;
const CAT_OK: Partial<Record<Cat, RegExp>> = {
  laptops: /laptop|notebook|macbook|vivobook|zenbook|ideapad|thinkpad|legion|loq|victus|pavilion|probook|omen|inspiron|vostro|latitude|aspire|nitro|swift|tuf|rog|yoga/i,
  tablets: /tab|pad/i,
  phones: /phone|galaxy|redmi|poco|reno|realme|honor|infinix|tecno|nokia|moto|vivo|oppo|xiaomi|\d+\s?gb/i,
};
interface Offer { store: string; url: string }
interface Product { key: string; category: string; brand: string; model: string; titleAr: string; titleEn: string; offers: Offer[] }
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { $comment?: string; categories: { slug: string; nameAr: string; nameEn: string }[]; products: Product[] };
const knownUrls = new Set(catalog.products.flatMap((p) => p.offers.map((o) => o.url.split('?')[0])));
const keys = new Set(catalog.products.map((p) => p.key));

if (process.argv.includes('--retitle')) {
  const original = Number(process.env.SAFQA_ORIGINAL_COUNT || 27);
  const before = catalog.products.length;
  catalog.products = catalog.products.filter((p, i) => i < original || !(JUNK.test(p.titleEn) || (CAT_OK[p.category as Cat] && !CAT_OK[p.category as Cat]!.test(p.titleEn))));
  catalog.products.forEach((p, i) => { if (i >= original) p.titleAr = arabicTitle(p.category as Cat, p.brand, p.titleEn); });
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`retitled; removed ${before - catalog.products.length} accessories; catalog now ${catalog.products.length}`);
  process.exit(0);
}

// Pick candidates: for each plan line and store, the first N matching URLs (newest models first by a crude score).
const perStoreQueue = new Map<string, { url: string; cat: Cat; line: number }[]>();
const score = (u: string) => (/(17|s26|s25|a5[67]|a3[67]|a1[67]|m4|m5|2026|2025|15)/.test(u) ? 0 : 1);
for (const s of stores) {
  const urls = readFileSync(resolve(dir, s.file), 'utf8').split('\n').filter((u) => u && s.filter(u) && !knownUrls.has(u));
  const q: { url: string; cat: Cat; line: number }[] = [];
  plan.forEach((p, line) => {
    const hits = urls.filter((u) => p.kw.test(u.split('/').pop() || '')).sort((a, b) => score(a) - score(b));
    // Over-sample: many sitemap entries are out of stock.
    for (const url of hits.slice(0, Math.ceil(p.max * 1.6))) q.push({ url, cat: p.cat, line });
  });
  perStoreQueue.set(s.slug, q);
  console.log(`${s.slug}: ${urls.length} urls, ${q.length} candidates`);
}

const found: (Product & { line: number; price: number })[] = [];
const perLine = new Map<string, number>();
let fetched = 0;
await Promise.all(
  stores.map(async (s) => {
    const adapter = adapterBySlug(s.slug);
    if (!adapter) return;
    for (const c of perStoreQueue.get(s.slug) || []) {
      if (fetched >= budget) break;
      const lk = `${c.line}:${s.slug}`;
      if ((perLine.get(lk) || 0) >= Math.ceil(plan[c.line]!.max / 2)) continue;
      fetched += 1;
      try {
        const r = await adapter.fetchAndParse(c.url, { userAgent: SAFQA_USER_AGENT, includeLlmMarkdown: false });
        const o = r.offer;
        if (!o || !(o.priceEGP > 0) || !o.inStock) { console.log(`skip ${s.slug} ${c.url} ${o ? (o.inStock ? 'noprice' : 'out-of-stock') : 'no-jsonld'}`); continue; }
        const titleEn = cleanEn(o.title || '');
        if (JUNK.test(titleEn) || (CAT_OK[c.cat] && !CAT_OK[c.cat]!.test(titleEn))) { console.log(`skip ${s.slug} ${c.url} not-a-${c.cat}`); continue; }
        const brand = (o.brand || titleEn.split(' ')[0] || '').replace(/^\w/, (x) => x.toUpperCase());
        let key = slugKey(titleEn);
        if (keys.has(key)) key = `${key}-${s.slug}`;
        keys.add(key);
        found.push({ key, category: c.cat, brand, model: titleEn.replace(new RegExp(`^${brand}\\s*`, 'i'), '').split(/[,-]/)[0]!.trim().slice(0, 60), titleAr: arabicTitle(c.cat, brand, titleEn), titleEn, offers: [{ store: s.slug, url: c.url }], line: c.line, price: o.priceEGP });
        perLine.set(lk, (perLine.get(lk) || 0) + 1);
        console.log(`ok   ${s.slug} ${o.priceEGP} ${titleEn}`);
      } catch (e) {
        console.log(`err  ${s.slug} ${c.url} ${(e as Error).message.slice(0, 100)}`);
      }
    }
  }),
);

// Merge the same product sold by several stores into one entry with several offers.
const byMatch = new Map<string, Product & { line: number; price: number }>();
let merged = 0;
for (const p of found) {
  const k = matchKey(p.brand, p.titleEn);
  const prev = byMatch.get(k);
  if (prev && !prev.offers.some((o) => o.store === p.offers[0]!.store) && Math.abs(prev.price - p.price) / prev.price < 0.35) {
    prev.offers.push(p.offers[0]!);
    merged += 1;
  } else byMatch.set(prev ? `${k}#${p.key}` : k, p);
}
const added = [...byMatch.values()].map(({ line: _l, price: _p, ...rest }) => rest);
const cats = [
  { slug: 'laptops', nameAr: 'لابتوبات', nameEn: 'Laptops' },
  { slug: 'tablets', nameAr: 'تابلت', nameEn: 'Tablets' },
  { slug: 'gaming', nameAr: 'ألعاب', nameEn: 'Gaming' },
  { slug: 'kitchen', nameAr: 'أجهزة المطبخ', nameEn: 'Kitchen' },
];
for (const c of cats) if (!catalog.categories.some((x) => x.slug === c.slug)) catalog.categories.push(c);
catalog.products.push(...added);
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`fetched ${fetched}, found ${found.length} in-stock priced, merged ${merged}, added ${added.length}; catalog now ${catalog.products.length}`);
process.exit(0);
