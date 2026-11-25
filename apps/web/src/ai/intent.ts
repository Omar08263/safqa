// Egyptian-Arabic shopping intent: budget ("تحت ١٥ ألف"), cheap/premium hints,
// and Arabic → English term expansion so Arabic queries find English titles.
const DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const WORD_NUM: Record<string, number> = { واحد: 1, اتنين: 2, تلاتة: 3, ثلاثة: 3, اربعة: 4, أربعة: 4, خمسة: 5, ستة: 6, سبعة: 7, تمانية: 8, ثمانية: 8, تسعة: 9, عشرة: 10, عشرين: 20, تلاتين: 30, خمسين: 50, مية: 100 };

const EXPAND: [RegExp, string][] = [
  [/سماع|هيدفون|ايربود|إيربود/, 'headphones earbuds headset'], [/سبيكر|مكبر صوت|سماعة بلوتوث/, 'bluetooth speaker'],
  [/موبايل|تليفون|فون|محمول/, 'smartphone mobile phone'], [/لاب ?توب|لابتوب|نوت ?بوك/, 'laptop notebook'], [/تابلت|ايباد|آيباد/, 'tablet ipad'],
  [/شاحن|اشحن|أشحن|شحن/, 'charger power bank fast charging'], [/باور ?بانك|باوربانك/, 'power bank'], [/كابل|سلك/, 'cable usb-c'],
  [/ساع[هة] ذكي|سمارت ووتش|ساعة/, 'smartwatch watch'], [/تلفزيون|تليفزيون|شاشة|تي ?في/, 'smart tv led screen monitor'], [/شاش[هة] كمبيوتر|مونيتور/, 'monitor display'],
  [/ماوس/, 'mouse'], [/كيبورد|لوحة مفاتيح/, 'keyboard'], [/طابع[هة]|برنتر/, 'printer'], [/راوتر|واي ?فاي|نت/, 'router wifi'],
  [/هارد|فلاش|ميموري|ذاكرة|كارت ميموري/, 'ssd hard drive flash memory card'], [/رامات?|رام/, 'ram ddr memory'], [/كارت شاشة|جرافيك/, 'graphics card gpu'],
  [/بلايستيشن|بلاي ?ستيشن|اكس ?بوكس|جيمنج|ألعاب|العاب|جيم\b/, 'gaming console controller'], [/دراع|يد تحكم/, 'controller gamepad'],
  [/كاميرا|تصوير/, 'camera'], [/خلاط|كبة|محضر[هة]/, 'blender food processor'], [/غسال[هة]/, 'washing machine'], [/تلاج[هة]|ثلاج[هة]/, 'refrigerator fridge'],
  [/تكييف|مكيف/, 'air conditioner'], [/مكنس[هة]/, 'vacuum cleaner'], [/مكوا[هة]|مكو[هة]/, 'iron steam'], [/قلاي[هة]|اير ?فراير/, 'air fryer'], [/ميكروويف|مايكرويف/, 'microwave'],
  [/سخان/, 'water heater kettle'], [/بوتاجاز|فرن/, 'cooker oven gas hob'], [/مروح[هة]/, 'fan'], [/ماكين[هة] قهو[هة]|قهو[هة]/, 'coffee machine'],
  [/مذاكر|طالب|جامع[هة]|دراس/, 'student study office'], [/جيم|رياض|جري/, 'sport fitness running'], [/سفر|رحل/, 'travel portable'], [/عربي[هة]|سيار[هة]/, 'car'],
  [/أطفال|اطفال|عيال/, 'kids'], [/هدي[هة]/, 'gift'], [/ستات|حريمي|بنات/, 'women'], [/رجالي/, 'men'], [/ألعاب فيديو/, 'video games'],
  [/لاسلك|وايرلس|بلوتوث/, 'wireless bluetooth'], [/عازل|عزل الضوضاء|نويز/, 'noise cancelling anc'], [/مية|ماء|ووتر ?بروف/, 'waterproof'],
  [/ابل|أبل|آبل|ايفون|آيفون/, 'apple iphone'], [/سامسونج|سامسونغ/, 'samsung'], [/شاومي/, 'xiaomi redmi'], [/انكر|أنكر/, 'anker'], [/لينوفو/, 'lenovo'], [/اتش ?بي/, 'hp'], [/ديل\b/, 'dell'], [/اسوس|أسوس/, 'asus'],
];

export interface Intent { text: string; expanded: string; maxPrice: number | null; minPrice: number | null; cheap: boolean; premium: boolean }

function num(raw: string): number | null {
  const s = raw.replace(/[٠-٩]/g, (d) => DIGITS[d]!).replace(/[,٬]/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(ألف|الف|آلاف|ك|k)?/i);
  if (m) return Number(m[1]) * (m[2] ? 1000 : 1);
  const w = Object.keys(WORD_NUM).find((k) => s.includes(k));
  if (w) return WORD_NUM[w]! * (/(ألف|الف|آلاف)/.test(s) ? 1000 : 1);
  return null;
}

export function parseIntent(q: string): Intent {
  const text = q.trim();
  let maxPrice: number | null = null, minPrice: number | null = null;
  const under = text.match(/(?:تحت|أقل من|اقل من|مش أكتر من|ميزانيت?ي?|بحدود|في حدود|لحد)\s*([^\s]+(?:\s*(?:ألف|الف|آلاف))?)/);
  if (under) maxPrice = num(under[1]!);
  const over = text.match(/(?:فوق|أكتر من|اكتر من|أكثر من)\s*([^\s]+(?:\s*(?:ألف|الف|آلاف))?)/);
  if (over) minPrice = num(over[1]!);
  const cheap = /رخيص|أرخص|ارخص|اقتصادي|على قد/.test(text);
  const premium = /أحسن|احسن|أقوى|اقوى|فخم|بريميوم|توب|برو\b/.test(text);
  const extra = EXPAND.filter(([re]) => re.test(text)).map(([, en]) => en);
  return { text, expanded: extra.length ? `${text} | ${extra.join(' ')}` : text, maxPrice, minPrice, cheap, premium };
}
