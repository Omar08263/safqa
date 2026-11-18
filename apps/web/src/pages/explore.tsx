import { formatEGP, localized } from '@safqa/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BarChart3, CalendarDays, CalendarPlus, LayoutGrid, Lightbulb, ShieldAlert, Store, TrendingDown, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DealCard } from '../components/bits';
import { Countdown } from '../components/countdown';
import { Button } from '../components/ui/button';
import { visualFor } from '../features/visuals';
import { Card, CountUp, PageHeader, Reveal, Spotlight } from '../fx/fx';
import { useCatalog } from '../lib/catalog';
import { downloadFile } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

const tips: Record<string, [string, string][]> = {
  'white-friday': [
    ['راقب المنتج من دلوقتي عشان تعرف سعره الحقيقي قبل الموسم.', 'Watch the product now so you know its real pre-season price.'],
    ['متصدقش "كان بـ" — صفقة بتكشف لو السعر اتنفخ قبل الخصم.', 'Ignore "was" prices — Safqa flags prices inflated before the sale.'],
    ['جمّع كوبون المتجر مع عرض البنك؛ الخصم بيتحسب على مرحلتين.', 'Stack the store coupon with a bank offer; discounts compound.'],
  ],
  'year-end': [
    ['المتاجر بتصفّي موديلات السنة، دوّر على الموديل اللي قبل الجديد.', 'Stores clear this year\'s models — look at last-gen.'],
    ['قارن سعر الجيجا في الموبايلات بأداة سعر الوحدة.', 'Compare price per GB on phones with the unit-price tool.'],
  ],
  ramadan: [
    ['الأجهزة المنزلية بتنزل قبل رمضان بأسبوعين عادةً.', 'Home appliances usually drop about two weeks before Ramadan.'],
    ['اعمل مجموعة "تجهيزات رمضان" وتابع إجماليها.', 'Make a "Ramadan prep" collection and track its total.'],
  ],
};

function ics(name: string, date: string) {
  const d = date.replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Safqa//Sale calendar//AR', 'BEGIN:VEVENT', `UID:${d}-${encodeURIComponent(name)}@safqa`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${name} — Safqa`, 'DESCRIPTION:Check real prices on Safqa before you buy.', 'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', `DESCRIPTION:${name}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export function CalendarPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { client } = useSession();
  const calendar = useQuery({ queryKey: ['calendar'], queryFn: () => client.calendar() });
  return (
    <div>
      <PageHeader icon={<CalendarDays className="h-6 w-6" />} kicker={tr('مواسم التخفيضات في مصر', 'Egyptian sale seasons')} title={tr('تقويم المواسم', 'Sale calendar')} lede={tr('عدّ تنازلي حي لكل موسم، نصايح قبل كل موسم، وتقدر تضيفه لتقويمك بملف ics.', 'A live countdown to each season, tips for each, and one-tap .ics export to your calendar.')} />
      <div className="space-y-5">
        {(calendar.data?.items ?? []).map((ev, i) => (
          <Reveal key={ev.id} delay={i * 90}>
            <Card className="relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div>
                  <p className="text-sm text-muted">{new Date(ev.date).toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <h2 className="text-2xl font-bold">{locale === 'ar' ? ev.nameAr : ev.nameEn}</h2>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => downloadFile(`safqa-${ev.id}.ics`, ics(locale === 'ar' ? ev.nameAr : ev.nameEn, ev.date), 'text/calendar')}><CalendarPlus className="h-4 w-4" />{tr('ضيف لتقويمي', 'Add to my calendar')}</Button>
                </div>
                <Countdown date={ev.date} />
              </div>
              {tips[ev.id] ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-3">
                  {tips[ev.id]?.map(([ar, en]) => <li key={en} className="flex gap-2 rounded-2xl bg-accent p-3 text-sm"><Lightbulb className="h-4 w-4 flex-none text-primary" />{locale === 'ar' ? ar : en}</li>)}
                </ul>
              ) : null}
            </Card>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { client } = useSession();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => client.categories() });
  const catalog = useCatalog();
  return (
    <div>
      <PageHeader icon={<LayoutGrid className="h-6 w-6" />} title={tr('الأقسام', 'Categories')} lede={tr('تصفّح حسب القسم، وشوف عدد المنتجات وأرخص سعر ومتوسط التقييم في كل قسم.', 'Browse by category with product counts, lowest price, and average score.')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(cats.data?.items ?? []).map((c, i) => {
          const v = visualFor(c.slug);
          const items = (catalog.data?.items ?? []).filter((p) => p.category?.slug === c.slug);
          const low = items.length ? Math.min(...items.map((p) => p.lowestPriceEgp ?? p.bestOffer?.priceEgp ?? 0)) : 0;
          const avg = items.length ? items.reduce((s, p) => s + (p.bestOffer?.dealScore ?? 0), 0) / items.length : 0;
          return (
            <Reveal key={c.slug} delay={(i % 3) * 80}>
              <Link to="/search" search={{ category: c.slug }}>
                <Spotlight className="lift overflow-hidden rounded-3xl border border-border bg-card">
                  <div className="relative h-36" style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }}><v.icon className="float absolute inset-0 m-auto h-16 w-16 text-white" strokeWidth={1.3} /></div>
                  <div className="p-4">
                    <h2 className="text-lg font-bold">{localized(locale, { ar: c.nameAr, en: c.nameEn })}</h2>
                    <p className="mt-1 text-sm text-muted">{items.length} {tr('منتج', 'products')} · {tr('من', 'from')} <span className="num">{formatEGP(low, locale)}</span> · {tr('متوسط التقييم', 'avg score')} <span className="num">{avg.toFixed(0)}</span></p>
                  </div>
                </Spotlight>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

function useAllDetails() {
  const { client } = useSession();
  const catalog = useCatalog();
  const ids = (catalog.data?.items ?? []).map((p) => p.id);
  const details = useQueries({ queries: ids.map((id) => ({ queryKey: ['product', id], queryFn: () => client.product(id) })) });
  const preds = useQueries({ queries: ids.map((id) => ({ queryKey: ['prediction', id], queryFn: () => client.prediction(id) })) });
  return { catalog, details: details.map((d) => d.data).filter((d): d is NonNullable<typeof d> => Boolean(d)), preds: preds.map((p) => p.data) };
}

export function StoresPage() {
  const tr = useTr();
  const { locale, t } = usePrefs();
  const { client } = useSession();
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => client.stores() });
  const { details } = useAllDetails();
  const offers = details.flatMap((d) => d.offers.map((o) => ({ ...o, product: d })));
  const rows = (stores.data?.items ?? []).map((s) => {
    const mine = offers.filter((o) => o.store.slug === s.slug);
    const cheapest = mine.filter((o) => o.condition === 'new' && Math.min(...o.product.offers.filter((x) => x.condition === 'new').map((x) => x.priceEgp)) === o.priceEgp).length;
    return {
      s,
      count: mine.length,
      avgScore: mine.length ? mine.reduce((a, o) => a + o.dealScore, 0) / mine.length : 0,
      fake: mine.filter((o) => o.fakeDiscount).length,
      stock: mine.length ? (mine.filter((o) => o.inStock).length / mine.length) * 100 : 0,
      cheapest,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);
  return (
    <div>
      <PageHeader icon={<Store className="h-6 w-6" />} title={tr('مقارنة المتاجر', 'Store comparison')} lede={tr('مين المتجر اللي بيدّي أحسن صفقات؟ ومين خصوماته مشبوهة أكتر؟ محسوبة من كل العروض اللي صفقة متابعاها.', 'Which store gives the best deals, and whose discounts are most suspicious? Computed from every offer Safqa tracks.')} />
      <div className="overflow-x-auto rounded-3xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-accent/60 text-muted"><tr>{[tr('المتجر', 'Store'), tr('العروض', 'Offers'), tr('متوسط التقييم', 'Avg score'), tr('الأرخص في', 'Cheapest on'), tr('خصومات مشبوهة', 'Suspicious'), tr('التوفر', 'In stock'), tr('حالة الربط', 'Adapter')].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.s.slug} className="border-t border-border">
                <td className="p-3 font-semibold">{i === 0 && r.count ? <Trophy className="me-1 inline h-4 w-4 text-primary" /> : null}<Link to="/search" search={{ store: r.s.slug }} className="hover:text-primary">{localized(locale, { ar: r.s.nameAr, en: r.s.nameEn })}</Link></td>
                <td className="num p-3">{r.count}</td>
                <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-[var(--palm)]" style={{ width: `${r.avgScore}%` }} /></div><span className="num">{r.avgScore.toFixed(0)}</span></div></td>
                <td className="num p-3">{r.cheapest} {tr('منتج', 'items')}</td>
                <td className={`num p-3 ${r.fake ? 'font-bold text-destructive' : ''}`}>{r.fake}</td>
                <td className="num p-3">{r.count ? `${r.stock.toFixed(0)}%` : '—'}</td>
                <td className="p-3 text-xs text-muted">{t(`status.${r.s.adapterStatus}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { catalog, details, preds } = useAllDetails();
  const items = catalog.data?.items ?? [];
  const belowMedian = details
    .filter((d) => d.median30 && d.bestOffer)
    .map((d) => ({ d, pct: (1 - (d.bestOffer?.priceEgp ?? 0) / (d.median30 ?? 1)) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const buyNow = preds.filter((p) => p?.recommendation === 'buy_now').length;
  const wait = preds.filter((p) => p && p.recommendation !== 'buy_now').length;
  const byCat = Object.values(
    items.reduce<Record<string, { name: string; slug: string; sum: number; n: number }>>((acc, p) => {
      const slug = p.category?.slug ?? 'other';
      const e = acc[slug] ?? { name: p.category ? localized(locale, { ar: p.category.nameAr, en: p.category.nameEn }) : slug, slug, sum: 0, n: 0 };
      e.sum += p.bestOffer?.dealScore ?? 0;
      e.n += 1;
      acc[slug] = e;
      return acc;
    }, {}),
  ).map((c) => ({ name: c.name, slug: c.slug, score: Math.round(c.sum / c.n) }));
  const fake = details.reduce((n, d) => n + d.offers.filter((o) => o.fakeDiscount).length, 0);
  const totalOffers = details.reduce((n, d) => n + d.offers.length, 0);
  return (
    <div className="space-y-6">
      <PageHeader icon={<BarChart3 className="h-6 w-6" />} kicker={tr('نظرة على السوق كله', 'The whole market at a glance')} title={tr('تحليلات السوق', 'Market insights')} lede={tr('ترتيب المنتجات حسب نزولها تحت الوسيط، توزيع توصيات "اشتري/استنى"، ومتوسط التقييم لكل قسم.', 'Products ranked by how far below median they are, the buy/wait split, and average score per category.')} />
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-muted">{tr('توصية: اشتري دلوقتي', 'Advice: buy now')}</p><p className="mt-1 text-3xl font-bold text-palm"><CountUp value={buyNow} /></p></Card>
        <Card><p className="text-sm text-muted">{tr('توصية: استنى', 'Advice: wait')}</p><p className="mt-1 text-3xl font-bold text-primary"><CountUp value={wait} /></p></Card>
        <Card><p className="text-sm text-muted">{tr('عروض مشبوهة', 'Suspicious offers')}</p><p className="mt-1 text-3xl font-bold text-destructive"><CountUp value={fake} /></p></Card>
        <Card><p className="text-sm text-muted">{tr('نسبة المشبوه', 'Suspicious rate')}</p><p className="mt-1 text-3xl font-bold"><CountUp value={totalOffers ? (fake / totalOffers) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} /></p></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><TrendingDown className="h-5 w-5 text-primary" />{tr('لوحة الصدارة: أكتر نزول تحت الوسيط', 'Leaderboard: furthest below median')}</h2>
          <ol className="mt-3 space-y-2">
            {belowMedian.slice(0, 8).map(({ d, pct }, i) => (
              <li key={d.id}>
                <Link to="/product/$id" params={{ id: d.id }} className="flex items-center gap-3 rounded-2xl bg-accent px-3 py-2 text-sm hover:ring-2 hover:ring-primary/40">
                  <span className="num grid h-7 w-7 place-items-center rounded-full bg-card font-bold">{i + 1}</span>
                  <span className="flex-1 truncate">{localized(locale, { ar: d.titleAr, en: d.titleEn })}</span>
                  <span className={`num font-bold ${pct > 0 ? 'text-palm' : 'text-destructive'}`}>{pct > 0 ? '▼' : '▲'} {Math.abs(pct).toFixed(1)}%</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{tr('متوسط تقييم الصفقات لكل قسم', 'Average deal score by category')}</h2>
          <div className="mt-3 h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCat}><CartesianGrid stroke="var(--line)" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={30} /><Tooltip contentStyle={{ background: 'var(--elev)', borderRadius: 12, border: '1px solid var(--line)' }} /><Bar dataKey="score" radius={[10, 10, 0, 0]}>{byCat.map((c) => <Cell key={c.slug} fill={visualFor(c.slug).from} />)}</Bar></BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><ShieldAlert className="h-5 w-5 text-destructive" />{tr('خلي بالك من دول', 'Be careful with these')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.filter((p) => details.find((d) => d.id === p.id)?.offers.some((o) => o.fakeDiscount)).map((p, i) => <DealCard key={p.id} product={p} index={i} />)}</div>
      </section>
    </div>
  );
}
