import { ChevronDown, HelpCircle, HeartHandshake, Database, Bot, ShieldCheck, Store, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Card, PageHeader, Reveal } from '../fx/fx';
import { allNav } from '../features/nav';
import { isStaticDemo } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

const faq: [string, string, string, string][] = [
  ['صفقة بتجيب الأسعار منين؟', 'Where do prices come from?', 'من صفحات المنتجات العامة في المتاجر المصرية (نون، أمازون مصر، بي.تك وغيرهم) عن طريق بيانات JSON-LD المنظّمة، من غير ما ندخل على أي حسابات.', 'From public product pages at Egyptian stores (Noon, Amazon.eg, B.TECH and more) via structured JSON-LD data, without logging into any account.'],
  ['يعني إيه "خصم مضروب"؟', 'What is a "fake discount"?', 'لما المتجر يكتب سعر "قبل الخصم" عمره ما اتباع بيه فعلًا، أو السعر بعد الخصم مش أقل من الوسيط. صفقة بتقارن بتاريخ السعر الحقيقي.', 'When a store shows a "was" price it never actually charged, or the "now" price is not below the median. Safqa checks real history.'],
  ['التقييم من ١٠٠ بيتحسب إزاي؟', 'How is the score out of 100 computed?', 'بيقارن السعر بوسيط ٣٠ يوم وقاع ٩٠ يوم، وبياخد في الاعتبار مصداقية الخصم والتوفر وحالة المنتج. صفحة كل منتج فيها تفسير مبسّط.', 'It compares price with the 30-day median and 90-day low and weighs discount honesty, stock and condition. Each product page explains it.'],
  ['التنبيهات بتوصل إزاي؟', 'How do alerts reach me?', 'حط سعر مستهدف في صفحة المنتج. التنبيه بيظهر في مركز التنبيهات، وتقدر تفعّل إشعارات المتصفح من الإعدادات.', 'Set a target on a product page. Alerts appear in the alert centre; enable browser notifications in settings.'],
  ['بياناتي محفوظة فين؟', 'Where is my data stored?', 'المجموعات والميزانية والتوفير والإعدادات محفوظة على جهازك. تقدر تصدّرها أو تمسحها من الإعدادات في أي وقت.', 'Collections, budget, savings and settings live on your device. Export or delete them from settings any time.'],
  ['تسجيل جوجل بياخد مني إيه؟', 'What does Google sign-in use?', 'الاسم والإيميل والصورة بس. في النسخة التجريبية الرمز بيتحلّ في المتصفح والحساب يتسجل على جهازك. التفاصيل في سياسة الخصوصية.', 'Only your name, email and picture. In the demo the token is decoded in the browser and the account stays on your device. Details are in the Privacy Policy.'],
  ['هل حاسبة التقسيط دي عرض بنك؟', 'Is the installment calculator a bank offer?', 'لا. هي حاسبة بالفايدة الثابتة والمصاريف اللي انت بتدخلها. الاختيارات الجاهزة أمثلة شائعة، مش عروض بنك معيّن.', 'No. It computes flat interest and the fees you enter. Presets are common examples, not a specific bank offer.'],
  ['أسعار العملات بتيجي منين؟', 'Where do exchange rates come from?', 'من open.er-api.com لما تضغط تحديث، والمصدر والوقت ظاهرين. لو مفيش نت بتستخدم آخر أسعار محفوظة وتقدر تعدّلها.', 'From open.er-api.com on refresh, with source and time shown. Offline, the last saved rates are used and are editable.'],
  ['ينفع أستخدم صفقة من غير نت؟', 'Can I use Safqa offline?', 'أيوه. الصفحات والبيانات اللي فتحتها قبل كده بتتحفظ، وثبّت صفقة كتطبيق من الإعدادات.', 'Yes. Pages and data you already opened are cached; install Safqa as an app from settings.'],
  ['إزاي أقارن منتجات؟', 'How do I compare products?', 'دوس أيقونة المقارنة على أي كارت (لحد ٤)، وبعدين "قارن دلوقتي" من الدرج اللي تحت.', 'Tap the compare icon on any card (up to 4), then "Compare now" in the bottom tray.'],
];

const glossary: [string, string, string, string][] = [
  ['وسيط ٣٠ يوم', '30-day median', 'السعر اللي في النص بين كل أسعار آخر ٣٠ يوم — أدق من المتوسط لأنه مش بيتأثر بالعروض الشاذة.', 'The middle price of the last 30 days — more robust than the average.'],
  ['قاع ٩٠ يوم', '90-day low', 'أقل سعر اتسجّل في آخر ٩٠ يوم.', 'The lowest price recorded in the last 90 days.'],
  ['التذبذب', 'Volatility', 'قد إيه السعر بيتغيّر؛ نسبة الانحراف المعياري للمتوسط.', 'How much the price moves; standard deviation as % of average.'],
  ['الخصم المركّب', 'Stacked discount', 'خصمين ورا بعض؛ التاني بيتحسب على السعر بعد الأول.', 'Two discounts in a row; the second applies to the reduced price.'],
  ['JSON-LD', 'JSON-LD', 'بيانات منظّمة جوه صفحة المنتج فيها السعر والتوفر؛ صفقة بتعتمد عليها بس للأسعار.', 'Structured data in the product page with price and stock; the only source Safqa trusts for prices.'],
];

export function HelpPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  const n = q.trim().toLowerCase();
  const items = faq.map((f, i) => ({ f, i })).filter(({ f }) => !n || f.join(' ').toLowerCase().includes(n));
  return (
    <div className="space-y-6">
      <PageHeader icon={<HelpCircle className="h-6 w-6" />} title={tr('مركز المساعدة', 'Help centre')} lede={tr('إجابات سريعة، قاموس مصطلحات، واختصارات الكيبورد.', 'Quick answers, a glossary, and keyboard shortcuts.')}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر في الأسئلة…', 'Search questions…')} aria-label={tr('دوّر في الأسئلة', 'Search questions')} className="h-11 w-72 rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          {items.map(({ f, i }) => (
            <Card key={i} className="p-0">
              <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-start font-semibold" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {locale === 'ar' ? f[0] : f[1]}<ChevronDown className={`h-5 w-5 flex-none transition ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i ? <p className="page-enter px-4 pb-4 text-sm leading-7 text-muted">{locale === 'ar' ? f[2] : f[3]}</p> : null}
            </Card>
          ))}
          {items.length === 0 ? <p className="text-muted">{tr('مفيش نتايج.', 'No results.')}</p> : null}
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold">{tr('قاموس المصطلحات', 'Glossary')}</h2>
            <dl className="mt-3 space-y-3 text-sm">{glossary.map((g) => <div key={g[1]}><dt className="font-semibold">{locale === 'ar' ? g[0] : g[1]}</dt><dd className="text-muted">{locale === 'ar' ? g[2] : g[3]}</dd></div>)}</dl>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{tr('اختصارات الكيبورد', 'Keyboard shortcuts')}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {[['Ctrl+K', tr('لوحة الأوامر', 'Palette')], ['/', tr('بحث', 'Search')], ['?', tr('الاختصارات', 'Shortcuts')], ['Shift+T', tr('الوضع الليلي', 'Dark mode')], ...allNav.filter((x) => x.key).slice(0, 8).map((x) => [`g ${x.key}`, locale === 'ar' ? x.ar : x.en])].map(([k, v]) => <li key={k} className="flex items-center gap-2"><kbd className="num rounded-md border border-border bg-accent px-1.5">{k}</kbd>{v}</li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  const tr = useTr();
  const steps = [
    { icon: Store, ar: 'المتاجر', en: 'Stores', d: tr('صفحات منتجات عامة', 'Public product pages') },
    { icon: Database, ar: 'JSON-LD', en: 'JSON-LD', d: tr('السعر الرسمي بس', 'Authoritative price only') },
    { icon: Workflow, ar: 'المطابقة', en: 'Matching', d: tr('نفس المنتج في كل المتاجر', 'Same product across stores') },
    { icon: ShieldCheck, ar: 'كشف الخصم', en: 'Fake check', d: tr('مقارنة بالتاريخ', 'Checked against history') },
    { icon: Bot, ar: 'الوكلاء', en: 'Agents', d: tr('نقاش وحكم', 'Debate and verdict') },
  ];
  return (
    <div className="space-y-8">
      <PageHeader icon={<HeartHandshake className="h-6 w-6" />} kicker={tr('صُنع في مصر', 'Made in Egypt')} title={tr('عن صفقة', 'About Safqa')} lede={tr('صفقة اتعملت عشان محدش يدفع زيادة بسبب خصم وهمي. بنتابع الأسعار، بنفهم تاريخها، وبنقولك الحقيقة.', 'Safqa exists so nobody overpays for a fake markdown. We track prices, understand their history, and tell you the truth.')} />
      <Card>
        <h2 className="text-lg font-bold">{tr('إزاي بنشتغل', 'How it works')}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-5">
          {steps.map((s, i) => (
            <Reveal key={s.en} delay={i * 120} as="li">
              <div className="relative text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[var(--saffron)] to-[var(--palm)] text-white shadow-lg"><s.icon className="h-7 w-7" /></span>
                <p className="mt-3 font-bold">{tr(s.ar, s.en)}</p>
                <p className="text-xs text-muted">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">{tr('بصراحة', 'Honestly')}</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-7 text-muted">
          <li>{isStaticDemo ? tr('النسخة دي تجريبية ثابتة: الأسعار لقطة من سيرفر صفقة حقيقي، والحسابات والمراقبة محفوظة في متصفحك بس.', 'This is a static demo: prices are a snapshot from a real Safqa server, and accounts and watchlists live only in your browser.') : tr('النسخة دي متوصلة بسيرفر صفقة حقيقي.', 'This build talks to a live Safqa server.')}</li>
          <li>{tr('صفقة مش تابعة لأي متجر ومش بتاخد عمولة على الأسعار اللي بتعرضها.', 'Safqa is not affiliated with any store and takes no commission on prices shown.')}</li>
          <li>{tr('المساعد الذكي بيقترح من المنتجات المتتبَّعة بس، ومش بيخترع أسعار.', 'The assistant only suggests tracked products and never invents prices.')}</li>
        </ul>
      </Card>
    </div>
  );
}
