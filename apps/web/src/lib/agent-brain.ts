// Offline response engine for the AI agents. Intent rules over Arabic/English
// text, answered from Safqa's real catalog. Each agent wraps the answer in its
// own voice (catchphrases, emoji, mood). No network and no LLM.
import type { ProductCard } from '@safqa/shared';
import Fuse from 'fuse.js';
import { type Agent, type Mood, teamById } from './agents';
import { hasAny, hash32, normalizeAr, pick } from './arabic';
import { allRules } from './rules';

export interface BrainCtx { products: ProductCard[]; mood: Mood; userName?: string; seed?: string }
export interface Reply { text: string; productIds: string[]; link?: { to: string; label: string } }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const catWords: [string, string[]][] = [
  ['phones', ['موبايل', 'تليفون', 'فون', 'ايفون', 'سامسونج', 'شاومي', 'هونر', 'phone', 'iphone', 'galaxy']],
  ['audio', ['سماعه', 'سماعات', 'ايربودز', 'earbuds', 'headphones', 'airpods']],
  ['tvs', ['شاشه', 'تلفزيون', 'تليفزيون', 'tv', 'شاشات']],
  ['appliances', ['تكييف', 'غساله', 'مايكرويف', 'ميكرويف', 'تلاجه', 'مكنه قهوه', 'ac', 'washer', 'microwave', 'اجهزه']],
  ['lifestyle', ['ساعه', 'ساعات', 'باند', 'watch', 'band']],
];

function parseBudget(n: string): number | null {
  const m = n.match(/(\d+(?:\.\d+)?)\s*(الف|ألف|الاف|k|ك)?/);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2]) v *= 1000;
  return v >= 100 ? v : null;
}

function voice(a: Agent, mood: Mood, core: string, seed: string): string {
  const h = hash32(seed + a.id);
  const opener = mood === 'sleepy' ? '😴 (بصحى أهو)…' : pick(a.catch, h);
  const emo = pick(a.emoji, h >> 3);
  const tail = mood === 'excited' ? ' 🚀' : mood === 'strict' ? '' : mood === 'happy' ? ' 😊' : '';
  return `${opener} ${emo}\n${core}${tail}`;
}

const card = (p: ProductCard) => `• ${p.titleAr} — ${fmt(p.lowestPriceEgp ?? p.bestOffer?.priceEgp ?? 0)} ج${p.bestOffer ? ` (${p.bestOffer.store.nameAr})` : ''}`;

export function think(a: Agent, input: string, ctx: BrainCtx): Reply {
  const n = normalizeAr(input);
  const seed = ctx.seed ?? input;
  const products = ctx.products.filter((p) => p.bestOffer);
  const say = (core: string, ids: string[] = [], link?: Reply['link']): Reply => ({ text: voice(a, ctx.mood, core, seed), productIds: ids, link });

  if (hasAny(n, ['انت مين', 'مين انت', 'who are you', 'بتعمل ايه', 'انت بني ادم', 'انت روبوت', 'انت بوت'])) {
    const t = teamById(a.team);
    return say(`أنا ${a.name} — ${a.title} في ${t.ar}. أنا وكيل ذكي 🤖 مش بني آدم، بشتغل أوفلاين على بيانات صفقة الحقيقية. شخصيتي: ${a.persona}.`);
  }
  if (hasAny(n, ['قوانين', 'قانون', 'عقوبه', 'حظر', 'كتم', 'انذار', 'rules', 'ban'])) {
    return say(`عندنا ${allRules.length} قاعدة في 5 أبواب، وكل عقوبة بتذكر رقم المادة. التصعيد: إنذار ← كتم 10 دقايق ← كتم ساعة ← حظر 24 ساعة ← حظر 7 أيام. وتقدر تتظلم من أي عقوبة.`, [], { to: '/rules', label: 'اقرا القوانين' });
  }
  if (hasAny(n, ['خصم وهمي', 'مضروب', 'مضخم', 'fake', 'خصم حقيقي', 'نصب'])) {
    const fakes = products.filter((p) => p.bestOffer?.fakeDiscount);
    return say(fakes.length ? `الخصومات المشبوهة دلوقتي:\n${fakes.slice(0, 4).map(card).join('\n')}` : 'في آخر تحديث مفيش ولا خصم مشبوه على المنتجات اللي بنتابعها ✅ — ومش بنخترع إنذارات.', fakes.map((p) => p.id));
  }
  if (hasAny(n, ['تنبيه', 'اشعار', 'نوتيفيكيشن', 'notification', 'alert'])) {
    return say('تقدر تفعل إشعارات المتصفح أو تشترك في الملخص بالإيميل من «رادار العروض». وتقدر كمان تحط سعر مستهدف لأي منتج من صفحته.', [], { to: '/radar', label: 'رادار العروض' });
  }
  if (hasAny(n, ['تطبيق', 'ابلكيشن', 'app', 'apk', 'تحميل'])) return say('تطبيق صفقة للأندرويد والآيفون (PWA) موجود في صفحة التطبيق 📲', [], { to: '/app', label: 'نزّل التطبيق' });
  if (hasAny(n, ['شكرا', 'تسلم', 'متشكر', 'thanks', 'thank you', 'حبيبي'])) return say(pick(['العفو يا باشا 🙏', 'تحت أمرك في أي وقت', 'ده واجبي 😄'], seed));
  if (hasAny(n, ['اهلا', 'السلام', 'سلام عليكم', 'ازيك', 'هاي', 'hi', 'hello', 'صباح', 'مساء'])) {
    return say(`${ctx.userName ? `أهلًا يا ${ctx.userName}! ` : 'أهلًا بيك! '}اسألني: «أرخص موبايل»، «أحسن عرض النهارده»، «سماعة تحت 3000»، أو اكتب اسم أي منتج.`);
  }

  const cat = catWords.find(([, ws]) => hasAny(n, ws))?.[0];
  const pool = cat ? products.filter((p) => p.category?.slug === cat) : products;
  const budget = /تحت|اقل من|ب\s?اقل|حدود|ميزانيه|under|below|budget/.test(n) ? parseBudget(n) : null;

  if (budget) {
    const fit = pool.filter((p) => (p.lowestPriceEgp ?? 0) <= budget).sort((x, y) => (y.bestOffer?.dealScore ?? 0) - (x.bestOffer?.dealScore ?? 0));
    return say(fit.length ? `في حدود ${fmt(budget)} ج لقيت ${fit.length}:\n${fit.slice(0, 4).map(card).join('\n')}` : `مفيش حاجة${cat ? ' في القسم ده' : ''} تحت ${fmt(budget)} ج في اللي بنتابعه حاليًا. أرخص حاجة: ${pool.length ? card([...pool].sort((x, y) => (x.lowestPriceEgp ?? 0) - (y.lowestPriceEgp ?? 0))[0] as ProductCard) : '—'}`, fit.slice(0, 4).map((p) => p.id));
  }
  if (hasAny(n, ['ارخص', 'اقل سعر', 'cheapest', 'رخيص'])) {
    const sorted = [...pool].sort((x, y) => (x.lowestPriceEgp ?? 0) - (y.lowestPriceEgp ?? 0));
    return say(`أرخص ${cat ? 'حاجات في القسم' : 'حاجات'} عندنا دلوقتي:\n${sorted.slice(0, 3).map(card).join('\n')}`, sorted.slice(0, 3).map((p) => p.id));
  }
  if (hasAny(n, ['احسن عرض', 'افضل عرض', 'احسن صفقه', 'عرض النهارده', 'best deal', 'صفقه اليوم', 'ايه الجديد'])) {
    const sorted = [...pool].sort((x, y) => (y.bestOffer?.dealScore ?? 0) - (x.bestOffer?.dealScore ?? 0));
    return say(`أعلى «درجة صفقة» دلوقتي:\n${sorted.slice(0, 3).map((p) => `${card(p)} · ${p.bestOffer?.dealScore}/100`).join('\n')}`, sorted.slice(0, 3).map((p) => p.id));
  }
  // Product lookup with fuzzy search.
  const fuse = new Fuse(products, { keys: ['titleAr', 'titleEn', 'brand', 'model'], threshold: 0.38, ignoreLocation: true });
  const hits = fuse.search(input).slice(0, 3).map((r) => r.item);
  if (hits.length) {
    const top = hits[0] as ProductCard;
    const o = top.bestOffer;
    return say(`${top.titleAr}: أرخص سعر ${fmt(o?.priceEgp ?? 0)} ج في ${o?.store.nameAr}${o?.inStock ? '' : ' (غير متوفر حاليًا)'} · درجة الصفقة ${o?.dealScore}/100${o?.fakeDiscount ? ' · ⚠️ الخصم مشبوه' : ''}.${hits.length > 1 ? `\nكمان: ${hits.slice(1).map((h) => h.titleAr).join('، ')}` : ''}`, hits.map((h) => h.id), { to: `/product/${top.id}`, label: 'افتح المنتج' });
  }
  if (cat) {
    return say(`في قسم ده بنتابع ${pool.length} منتج حقيقي. أحسنهم:\n${[...pool].sort((x, y) => (y.bestOffer?.dealScore ?? 0) - (x.bestOffer?.dealScore ?? 0)).slice(0, 3).map(card).join('\n')}`, pool.slice(0, 3).map((p) => p.id));
  }
  return say(pick([
    'مش متأكد فهمتك 🤔 جرّب: «أرخص سماعة»، «شاشة تحت 20 ألف»، «هل خصم X حقيقي؟»',
    'وضّحلي أكتر؟ ممكن تكتب اسم المنتج أو ميزانيتك وأنا أدوّرلك.',
    'السؤال ده برّه تخصصي شوية 😅 بس لو عن سعر أو عرض أنا موجود!',
  ], seed));
}

/** Short agent line for moderation notices (cites the rule). */
export function modNotice(a: Agent, action: string, rules: string[], until: string | null): string {
  const u = until ? ` لحد ${new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(until))} (القاهرة)` : '';
  return `${a.emoji[0]} ${pick(a.catch, rules.join(''))} — ${action} بسبب مخالفة المادة ${rules.join('، ')}${u}. تقدر تتظلم من صفحة القوانين.`;
}
