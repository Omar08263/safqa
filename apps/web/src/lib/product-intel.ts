// Offline product intelligence: canonical specs, an "AI summary" (ملخص ذكي)
// and spec-grounded answers. Deterministic: rules + templates over the real
// store specs, the real price history and the real offers. No network, no LLM.
import type { PriceHistory, ProductDetail } from '@safqa/shared';
import { hasAny, normalizeAr } from './arabic';
import type { ProductMedia } from './media';

export interface Canon {
  storageGB?: number;
  ramGB?: number;
  screenIn?: number;
  batteryMah?: number;
  refreshHz?: number;
  cameraMp?: number;
  resolution?: '8K' | '4K' | 'FHD' | 'HD';
  net5g?: boolean;
  ip?: string;
  hp?: number;
  inverter?: boolean;
  kg?: number;
  liters?: number;
  watts?: number;
  anc?: boolean;
  warrantyYears?: number;
  os?: string;
  chip?: string;
  smart?: boolean;
  wirelessCharging?: boolean;
  grill?: boolean;
}

const num = (s: string | undefined) => (s ? Number.parseFloat(s.replace(',', '.')) : undefined);
function maxMatch(text: string, re: RegExp, min = 0, max = Number.POSITIVE_INFINITY): number | undefined {
  let best: number | undefined;
  for (const m of text.matchAll(re)) {
    const v = num(m[1]);
    if (v != null && v >= min && v <= max && (best == null || v > best)) best = v;
  }
  return best;
}

export function canonical(item: Pick<ProductDetail, 'titleEn' | 'titleAr' | 'category'>, media?: ProductMedia | null): Canon {
  const specText = (media?.specs ?? []).map((s) => `${s.key}: ${s.value}`).join('\n');
  const desc = media?.description?.text ?? '';
  const all = `${item.titleEn}\n${specText}\n${desc}`;
  const spec = (re: RegExp) => media?.specs.find((s) => re.test(s.key))?.value;
  const c: Canon = {};
  const cat = item.category?.slug ?? '';
  const ramSpec = spec(/^ram|memory \(ram\)|ram size/i);
  c.ramGB = num(ramSpec?.match(/(\d+)/)?.[1]) ?? num(item.titleEn.match(/(\d+)\s*GB\s*\/\s*\d+\s*GB/i)?.[1]) ?? num(all.match(/(\d+)\s*GB\s*RAM/i)?.[1]);
  const storSpec = spec(/internal (memory|storage)|^storage|memory storage|rom/i);
  c.storageGB = num(storSpec?.match(/(\d+)/)?.[1]) ?? maxMatch(item.titleEn, /(\d+)\s*GB/gi, 32, 2048);
  if (c.storageGB && /TB/i.test(storSpec ?? '')) c.storageGB *= 1024;
  const scr = spec(/screen size|display size/i);
  c.screenIn = num(scr?.match(/(\d+(?:\.\d+)?)/)?.[1]) ?? num(item.titleEn.match(/(\d{2}(?:\.\d)?)\s*(?:"|''|inch|in\b)/i)?.[1]) ?? num(all.match(/(\d+(?:\.\d+)?)\s*(?:inch|-inch|")/i)?.[1]);
  c.batteryMah = maxMatch(all, /(\d{3,5})\s*m\s?Ah/gi, 100, 30000);
  c.refreshHz = maxMatch(all, /(\d{2,3})\s*Hz/gi, 50, 240);
  c.cameraMp = maxMatch(all, /(\d{1,3}(?:\.\d)?)\s*(?:MP|megapixels?)/gi, 2, 300);
  c.resolution = /\b8K\b/i.test(all) ? '8K' : /\b4K\b|UHD|3840/i.test(all) ? '4K' : /FHD|Full HD|1080/i.test(all) && cat === 'tvs' ? 'FHD' : /\bHD\b/.test(all) && cat === 'tvs' ? 'HD' : undefined;
  c.net5g = /\b5G\b/.test(all) || undefined;
  c.ip = all.match(/\bIP(6[5-9])\b/i)?.[0]?.toUpperCase();
  c.hp = num(all.match(/(\d(?:\.\d+)?)\s*HP\b/i)?.[1]);
  c.inverter = /inverter/i.test(all) || undefined;
  c.kg = cat === 'appliances' ? num(all.match(/(\d{1,2}(?:\.\d)?)\s*kg/i)?.[1]) : undefined;
  c.liters = num(all.match(/(\d{2,3})\s*(?:L\b|Liters?|Litres?)/i)?.[1]);
  c.watts = maxMatch(all, /(\d{3,4})\s*(?:W\b|Watts?)/gi, 100, 5000);
  c.anc = /noise cancel|\bANC\b|\bNC\b/i.test(all) || undefined;
  c.warrantyYears = num(all.match(/(\d)\s*years?\s*(?:official\s*)?warranty/i)?.[1]);
  c.os = spec(/operating system/i)?.trim();
  c.chip = spec(/chipset|processor|cpu/i)?.trim();
  c.smart = /smart|google tv|android tv|webos|tizen|vidaa/i.test(all) || undefined;
  c.wirelessCharging = /wireless charging|magsafe|qi2?\b/i.test(all) || undefined;
  c.grill = /grill/i.test(all) || undefined;
  return c;
}

export interface Line { ar: string; en: string }
export interface Summary {
  what: Line;
  pros: Line[];
  cons: Line[];
  verdict: { kind: 'great' | 'good' | 'wait' | 'careful'; ar: string; en: string; reasons: Line[] };
  basis: Line[];
  confidence: number; // 0..1
  historyDays: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function catName(slug: string): Line {
  const m: Record<string, Line> = {
    phones: { ar: 'موبايل', en: 'smartphone' },
    audio: { ar: 'سماعة', en: 'audio device' },
    tvs: { ar: 'شاشة تلفزيون', en: 'TV' },
    appliances: { ar: 'جهاز منزلي', en: 'home appliance' },
    lifestyle: { ar: 'ساعة/سوار ذكي', en: 'wearable' },
  };
  return m[slug] ?? { ar: 'منتج', en: 'product' };
}

export function historyFacts(history?: PriceHistory | null) {
  const pts = (history?.series ?? []).flatMap((s) => s.points.map((p) => ({ ...p, store: s.storeSlug })));
  if (pts.length === 0) return null;
  const times = pts.map((p) => Date.parse(p.t));
  const days = Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000) + 1);
  const prices = pts.map((p) => p.priceEgp);
  const lastByStore = (history?.series ?? []).map((s) => s.points.at(-1)?.priceEgp ?? Number.POSITIVE_INFINITY);
  const prevByStore = (history?.series ?? []).map((s) => s.points.at(-2)?.priceEgp ?? s.points.at(-1)?.priceEgp ?? Number.POSITIVE_INFINITY);
  const now = Math.min(...lastByStore);
  const before = Math.min(...prevByStore);
  return { days, min: Math.min(...prices), max: Math.max(...prices), now, before, changePct: before ? ((now - before) / before) * 100 : 0, points: pts.length };
}

export function summarize(item: ProductDetail, media: ProductMedia | null | undefined, history: PriceHistory | null | undefined, peers: { id: string; lowestPriceEgp: number | null; category?: { slug: string } | null }[]): Summary {
  const c = canonical(item, media);
  const slug = item.category?.slug ?? '';
  const cn = catName(slug);
  const best = item.bestOffer;
  const pros: Line[] = [];
  const cons: Line[] = [];
  const P = (ar: string, en: string) => pros.push({ ar, en });
  const C = (ar: string, en: string) => cons.push({ ar, en });

  // --- what it is
  const bits: Line[] = [];
  if (c.screenIn) bits.push({ ar: `شاشة ${c.screenIn} بوصة`, en: `${c.screenIn}" screen` });
  if (c.storageGB && slug === 'phones') bits.push({ ar: `مساحة ${c.storageGB} جيجا`, en: `${c.storageGB} GB storage` });
  if (c.ramGB && slug === 'phones') bits.push({ ar: `رام ${c.ramGB} جيجا`, en: `${c.ramGB} GB RAM` });
  if (c.batteryMah && slug === 'phones') bits.push({ ar: `بطارية ${fmt(c.batteryMah)} مللي أمبير`, en: `${fmt(c.batteryMah)} mAh battery` });
  if (c.resolution && slug === 'tvs') bits.push({ ar: `دقة ${c.resolution}`, en: `${c.resolution} resolution` });
  if (c.hp) bits.push({ ar: `قدرة ${c.hp} حصان`, en: `${c.hp} HP` });
  if (c.kg) bits.push({ ar: `سعة ${c.kg} كيلو`, en: `${c.kg} kg load` });
  if (c.liters) bits.push({ ar: `سعة ${c.liters} لتر`, en: `${c.liters} L` });
  if (c.anc) bits.push({ ar: 'عزل ضوضاء نشط', en: 'active noise cancelling' });
  const what: Line = {
    ar: `${cn.ar} من ${item.brand ?? 'ماركة غير محددة'}${item.model ? ` (${item.model})` : ''}${bits.length ? ` — ${bits.slice(0, 4).map((b) => b.ar).join('، ')}` : ''}.`,
    en: `A ${item.brand ?? ''} ${cn.en}${item.model ? ` (${item.model})` : ''}${bits.length ? ` with ${bits.slice(0, 4).map((b) => b.en).join(', ')}` : ''}.`,
  };

  // --- pros / cons from specs
  if (slug === 'phones') {
    if (c.batteryMah) c.batteryMah >= 5000 ? P(`بطارية كبيرة ${fmt(c.batteryMah)} مللي أمبير`, `Big ${fmt(c.batteryMah)} mAh battery`) : c.batteryMah < 4000 ? C(`بطارية صغيرة نسبيًا (${fmt(c.batteryMah)} مللي أمبير)`, `Smallish battery (${fmt(c.batteryMah)} mAh)`) : null;
    if (c.refreshHz) c.refreshHz >= 120 ? P(`شاشة ${c.refreshHz} هرتز ناعمة جدًا`, `Smooth ${c.refreshHz} Hz display`) : c.refreshHz <= 60 ? C('شاشة 60 هرتز بس', 'Only a 60 Hz display') : P(`شاشة ${c.refreshHz} هرتز`, `${c.refreshHz} Hz display`);
    if (c.storageGB) c.storageGB >= 256 ? P(`مساحة ${c.storageGB} جيجا تكفي سنين`, `${c.storageGB} GB is plenty`) : c.storageGB <= 64 ? C(`مساحة ${c.storageGB} جيجا هتتملي بسرعة`, `${c.storageGB} GB fills up fast`) : null;
    if (c.ramGB) c.ramGB >= 8 ? P(`رام ${c.ramGB} جيجا لتعدد المهام`, `${c.ramGB} GB RAM for multitasking`) : c.ramGB <= 4 ? C(`رام ${c.ramGB} جيجا محدودة`, `Limited ${c.ramGB} GB RAM`) : null;
    if (c.net5g) P('يدعم 5G', 'Supports 5G');
    else C('مفيش 5G', 'No 5G');
    if (c.ip) P(`مقاوم للمية والتراب ${c.ip}`, `${c.ip} water/dust resistance`);
    if (c.wirelessCharging) P('شحن لاسلكي', 'Wireless charging');
    if (c.cameraMp && c.cameraMp >= 108) P(`كاميرا ${c.cameraMp} ميجابكسل`, `${c.cameraMp} MP camera`);
  }
  if (slug === 'tvs') {
    if (c.resolution === '4K') P('دقة 4K', '4K resolution');
    if (c.resolution === 'HD') C('دقة HD بس (مش فل HD)', 'HD only (not Full HD)');
    if (c.smart) P('شاشة سمارت (تطبيقات ونتفلكس)', 'Smart TV apps');
    if (c.screenIn && c.screenIn >= 55) P(`مقاس كبير ${c.screenIn} بوصة`, `Large ${c.screenIn}" size`);
    if (c.refreshHz && c.refreshHz >= 100) P(`${c.refreshHz} هرتز للألعاب والرياضة`, `${c.refreshHz} Hz for sport & games`);
  }
  if (slug === 'appliances') {
    if (c.inverter) P('تكنولوجيا إنفرتر توفر كهرباء', 'Inverter saves electricity');
    else if (c.hp || c.kg) C('مش إنفرتر — استهلاك كهرباء أعلى', 'Not inverter — higher power use');
    if (c.grill) P('فيه جريل', 'Has a grill');
  }
  if (slug === 'audio') {
    if (c.anc) P('عزل ضوضاء نشط', 'Active noise cancelling');
    else C('مفيش عزل ضوضاء نشط', 'No active noise cancelling');
  }
  if (c.warrantyYears) c.warrantyYears >= 2 ? P(`ضمان ${c.warrantyYears} سنة`, `${c.warrantyYears}-year warranty`) : null;

  // --- price facts
  const offers = item.offers.filter((o) => o.condition === 'new');
  const prices = offers.map((o) => o.priceEgp).sort((a, b) => a - b);
  const spread = prices.length > 1 ? (prices.at(-1) as number) - (prices[0] as number) : 0;
  if (spread > 0 && prices[0]) P(`أرخص من أغلى متجر بـ ${fmt(spread)} جنيه`, `${fmt(spread)} EGP cheaper than the priciest store`);
  if (offers.length === 1) C('متاح في متجر واحد بس في تتبعنا', 'Only one tracked store');
  if (best && !best.inStock) C('غير متوفر حاليًا في أرخص متجر', 'Out of stock at the cheapest store');
  if (best?.fakeDiscount) C('الخصم المعروض شكله مضخّم', 'The shown discount looks inflated');
  if (best?.rating && best.rating >= 4.4) P(`تقييم المتجر ${best.rating}/5`, `Store rating ${best.rating}/5`);
  if (best?.rating && best.rating < 3.8) C(`تقييم المتجر ${best.rating}/5 بس`, `Store rating only ${best.rating}/5`);
  for (const r of media?.ratings ?? []) if (r.value < 3.8 && r.count && r.count > 20) C(`تقييم ${r.value}/5 من ${r.count} مراجعة على المتجر`, `${r.value}/5 from ${r.count} store reviews`);

  const peerPrices = peers.filter((p) => p.category?.slug === slug && p.lowestPriceEgp).map((p) => p.lowestPriceEgp as number).sort((a, b) => a - b);
  const price = item.lowestPriceEgp ?? best?.priceEgp ?? 0;
  const pct = peerPrices.length > 1 ? peerPrices.filter((p) => p < price).length / (peerPrices.length - 1) : 0.5;

  const h = historyFacts(history);
  const reasons: Line[] = [];
  let score = best?.dealScore ?? 60;
  if (h) {
    if (h.now <= h.min) reasons.push({ ar: `ده أقل سعر سجلناه (${fmt(h.min)} جنيه)`, en: `Lowest price we've recorded (${fmt(h.min)} EGP)` });
    else reasons.push({ ar: `أعلى من أقل سعر سجلناه (${fmt(h.min)}) بـ ${fmt(h.now - h.min)} جنيه`, en: `${fmt(h.now - h.min)} EGP above our recorded low (${fmt(h.min)})` });
    if (h.changePct <= -3) { score += 8; reasons.push({ ar: `السعر نزل ${Math.abs(h.changePct).toFixed(1)}% من آخر تحديث`, en: `Down ${Math.abs(h.changePct).toFixed(1)}% since last update` }); }
    if (h.changePct >= 3) { score -= 8; reasons.push({ ar: `السعر زاد ${h.changePct.toFixed(1)}% من آخر تحديث`, en: `Up ${h.changePct.toFixed(1)}% since last update` }); }
  }
  if (best?.fakeDiscount) score -= 20;
  if (spread > 0) score += 4;
  const kind: Summary['verdict']['kind'] = best?.fakeDiscount ? 'careful' : score >= 78 ? 'great' : score >= 62 ? 'good' : 'wait';
  const verdictText: Record<Summary['verdict']['kind'], Line> = {
    great: { ar: 'يستاهل سعره — صفقة قوية دلوقتي 🔥', en: 'Worth it — a strong deal right now 🔥' },
    good: { ar: 'سعر معقول يستاهل لو محتاجه دلوقتي 👍', en: 'Fair price — worth it if you need it now 👍' },
    wait: { ar: 'استنى شوية — غالبًا هتلاقي سعر أحسن ⏳', en: 'Wait a bit — a better price is likely ⏳' },
    careful: { ar: 'خلي بالك — الخصم مش حقيقي ⚠️', en: 'Careful — the discount is not real ⚠️' },
  };
  if (peerPrices.length > 2)
    reasons.push(pct <= 0.34
      ? { ar: `من أرخص ${Math.max(1, Math.round(pct * 100))}% في قسمه عندنا`, en: `Among the cheapest in its category here` }
      : pct >= 0.67 ? { ar: 'من الأغلى في قسمه عندنا (فئة أعلى)', en: 'Among the priciest in its category (higher tier)' } : { ar: 'في متوسط أسعار قسمه', en: 'Mid-priced for its category' });

  const basis: Line[] = [
    { ar: `${media?.specs.length ?? 0} مواصفة من صفحة المتجر`, en: `${media?.specs.length ?? 0} specs from the store page` },
    { ar: `${item.offers.length} عرض من ${new Set(item.offers.map((o) => o.store.slug)).size} متجر`, en: `${item.offers.length} offers from ${new Set(item.offers.map((o) => o.store.slug)).size} stores` },
    { ar: h ? `سجل أسعار ${h.days} يوم (${h.points} نقطة)` : 'لسه مفيش سجل أسعار', en: h ? `${h.days}-day price history (${h.points} points)` : 'No price history yet' },
  ];
  const confidence = Math.min(0.95, 0.35 + (media?.specs.length ? 0.2 : 0) + Math.min(0.3, (h?.days ?? 0) / 100) + (item.offers.length > 1 ? 0.1 : 0));
  return { what, pros: pros.slice(0, 6), cons: cons.slice(0, 5), verdict: { kind, ...verdictText[kind], reasons }, basis, confidence, historyDays: h?.days ?? 0 };
}

// --- Spec-grounded answers (Q&A auto-answer) --------------------------------
const topics: { words: string[]; keys: RegExp; canon?: (c: Canon) => string | undefined }[] = [
  { words: ['بطاريه', 'شحن', 'battery', 'mah'], keys: /battery|charging/i, canon: (c) => (c.batteryMah ? `${fmt(c.batteryMah)} mAh` : undefined) },
  { words: ['شاشه', 'بوصه', 'مقاس', 'screen', 'display', 'inch'], keys: /screen|display/i, canon: (c) => (c.screenIn ? `${c.screenIn}"` : undefined) },
  { words: ['كاميرا', 'تصوير', 'camera', 'ميجا'], keys: /camera/i, canon: (c) => (c.cameraMp ? `${c.cameraMp} MP` : undefined) },
  { words: ['رام', 'ram'], keys: /\bram\b/i, canon: (c) => (c.ramGB ? `${c.ramGB} GB` : undefined) },
  { words: ['مساحه', 'تخزين', 'ذاكره', 'storage', 'جيجا'], keys: /storage|memory|rom/i, canon: (c) => (c.storageGB ? `${c.storageGB} GB` : undefined) },
  { words: ['ضمان', 'warranty'], keys: /warranty/i, canon: (c) => (c.warrantyYears ? `${c.warrantyYears} years` : undefined) },
  { words: ['معالج', 'بروسيسور', 'chip', 'processor'], keys: /chip|processor|cpu/i, canon: (c) => c.chip },
  { words: ['نظام', 'اندرويد', 'ios', 'os'], keys: /operating|os\b/i, canon: (c) => c.os },
  { words: ['مياه', 'ميه', 'مايه', 'water', 'ip68', 'ip67'], keys: /water/i, canon: (c) => c.ip },
  { words: ['حصان', 'hp', 'قدره التبريد'], keys: /hp|horse|capacity/i, canon: (c) => (c.hp ? `${c.hp} HP` : undefined) },
  { words: ['انفرتر', 'inverter', 'كهربا', 'استهلاك'], keys: /inverter|energy|power|watt/i, canon: (c) => (c.inverter ? 'Inverter' : c.watts ? `${c.watts} W` : undefined) },
  { words: ['كيلو', 'سعه', 'kg', 'لتر'], keys: /capacity|kg|liter/i, canon: (c) => (c.kg ? `${c.kg} kg` : c.liters ? `${c.liters} L` : undefined) },
  { words: ['وزن', 'weight', 'تقيل'], keys: /weight/i },
  { words: ['ابعاد', 'dimensions', 'طول', 'عرض'], keys: /dimension/i },
  { words: ['5g', 'شبكه', 'network'], keys: /network|5g/i, canon: (c) => (c.net5g ? '5G' : undefined) },
  { words: ['هرتز', 'hz', 'ريفريش'], keys: /refresh|hz/i, canon: (c) => (c.refreshHz ? `${c.refreshHz} Hz` : undefined) },
  { words: ['دقه', 'resolution', '4k'], keys: /resolution/i, canon: (c) => c.resolution },
  { words: ['عزل', 'anc', 'ضوضاء', 'noise'], keys: /noise|anc/i, canon: (c) => (c.anc ? 'ANC ✓' : undefined) },
  { words: ['بلوتوث', 'bluetooth', 'واي فاي', 'wifi'], keys: /bluetooth|wi-?fi|connectivity/i },
  { words: ['لون', 'color', 'colour'], keys: /colou?r/i },
];

export function answerFromSpecs(question: string, item: ProductDetail, media: ProductMedia | null | undefined): { found: boolean; ar: string; en: string } {
  const q = normalizeAr(question);
  if (hasAny(q, ['سعر', 'بكام', 'price', 'ارخص', 'كام'])) {
    const b = item.bestOffer;
    if (b) return { found: true, ar: `أرخص سعر دلوقتي ${fmt(b.priceEgp)} جنيه في ${b.store.nameAr}${b.inStock ? '' : ' (غير متوفر حاليًا)'}.`, en: `Cheapest now: ${fmt(b.priceEgp)} EGP at ${b.store.nameEn}${b.inStock ? '' : ' (out of stock)'}.` };
  }
  const c = canonical(item, media);
  for (const t of topics) {
    if (!t.words.some((w) => q.includes(normalizeAr(w)))) continue;
    const rows = (media?.specs ?? []).filter((s) => t.keys.test(s.key)).slice(0, 3);
    const canon = t.canon?.(c);
    if (rows.length || canon) {
      const facts = rows.length ? rows.map((r) => `${r.key}: ${r.value}`).join(' · ') : canon;
      const src = rows[0]?.store ?? media?.description?.store;
      return { found: true, ar: `حسب مواصفات صفحة المتجر${src ? ` (${src})` : ''}: ${facts}`, en: `Per the store's spec sheet${src ? ` (${src})` : ''}: ${facts}` };
    }
  }
  // Fallback: keyword overlap with any spec row.
  const words = q.split(' ').filter((w) => w.length > 2);
  const hit = (media?.specs ?? []).find((s) => words.some((w) => normalizeAr(`${s.key} ${s.value}`).includes(w)));
  if (hit) return { found: true, ar: `أقرب معلومة في المواصفات: ${hit.key}: ${hit.value}`, en: `Closest spec: ${hit.key}: ${hit.value}` };
  return { found: false, ar: 'مش لاقي إجابة مؤكدة في مواصفات المتجر — سيبت السؤال للمجتمع يرد عليه 🙏', en: "No confirmed answer in the store specs — left it for the community 🙏" };
}

/** Rows for a spec diff between two products (canonical keys only). */
export const canonLabels: { key: keyof Canon; ar: string; en: string; better?: 'high' | 'low' }[] = [
  { key: 'screenIn', ar: 'الشاشة (بوصة)', en: 'Screen (in)', better: 'high' },
  { key: 'storageGB', ar: 'المساحة (جيجا)', en: 'Storage (GB)', better: 'high' },
  { key: 'ramGB', ar: 'الرام (جيجا)', en: 'RAM (GB)', better: 'high' },
  { key: 'batteryMah', ar: 'البطارية (mAh)', en: 'Battery (mAh)', better: 'high' },
  { key: 'refreshHz', ar: 'معدل التحديث (Hz)', en: 'Refresh (Hz)', better: 'high' },
  { key: 'cameraMp', ar: 'الكاميرا (MP)', en: 'Camera (MP)', better: 'high' },
  { key: 'resolution', ar: 'الدقة', en: 'Resolution' },
  { key: 'net5g', ar: '5G', en: '5G' },
  { key: 'ip', ar: 'مقاومة المية', en: 'Water resistance' },
  { key: 'hp', ar: 'القدرة (حصان)', en: 'Capacity (HP)', better: 'high' },
  { key: 'inverter', ar: 'إنفرتر', en: 'Inverter' },
  { key: 'kg', ar: 'السعة (كجم)', en: 'Load (kg)', better: 'high' },
  { key: 'liters', ar: 'السعة (لتر)', en: 'Volume (L)', better: 'high' },
  { key: 'watts', ar: 'القدرة (وات)', en: 'Power (W)' },
  { key: 'anc', ar: 'عزل ضوضاء', en: 'ANC' },
  { key: 'warrantyYears', ar: 'الضمان (سنة)', en: 'Warranty (yrs)', better: 'high' },
  { key: 'os', ar: 'النظام', en: 'OS' },
  { key: 'chip', ar: 'المعالج', en: 'Chip' },
];
