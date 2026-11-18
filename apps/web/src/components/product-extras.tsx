import { formatEGP, type PriceHistory, type ProductDetail } from '@safqa/shared';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Scale } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { PriceChart } from './price-chart';

export const ranges = [
  { id: '7', days: 7, ar: '٧ أيام', en: '7D' },
  { id: '30', days: 30, ar: '٣٠ يوم', en: '30D' },
  { id: '90', days: 90, ar: '٩٠ يوم', en: '90D' },
  { id: 'all', days: 100000, ar: 'الكل', en: 'All' },
] as const;

export function sliceHistory(history: PriceHistory, days: number): PriceHistory {
  const last = Math.max(...history.series.flatMap((s) => s.points.map((p) => new Date(p.t).getTime())));
  const from = last - days * 86_400_000;
  return { ...history, series: history.series.map((s) => ({ ...s, points: s.points.filter((p) => new Date(p.t).getTime() >= from) })).filter((s) => s.points.length) };
}

export function historyStats(history: PriceHistory) {
  const prices = history.series.flatMap((s) => s.points.map((p) => p.priceEgp));
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const sd = Math.sqrt(prices.reduce((a, b) => a + (b - avg) ** 2, 0) / prices.length);
  const firsts = history.series.map((s) => s.points[0]?.priceEgp ?? 0);
  const lasts = history.series.map((s) => s.points.at(-1)?.priceEgp ?? 0);
  const first = Math.min(...firsts);
  const lastMin = Math.min(...lasts);
  return { min, max, avg, volatility: (sd / avg) * 100, changePct: first ? ((lastMin - first) / first) * 100 : 0, points: prices.length };
}

export function RangeChart({ history }: { history: PriceHistory }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const [range, setRange] = useState<string>('90');
  const days = ranges.find((r) => r.id === range)?.days ?? 90;
  const sliced = useMemo(() => sliceHistory(history, days), [history, days]);
  const stats = historyStats(sliced);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-full bg-accent p-1 text-xs" role="tablist" aria-label={tr('المدة', 'Range')}>
        {ranges.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)} className={`rounded-full px-3 py-1.5 font-semibold transition ${range === r.id ? 'bg-card shadow' : 'text-muted'}`}>{locale === 'ar' ? r.ar : r.en}</button>
        ))}
      </div>
      <PriceChart history={sliced} />
      {stats ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            [tr('أقل سعر', 'Low'), formatEGP(stats.min, locale)],
            [tr('أعلى سعر', 'High'), formatEGP(stats.max, locale)],
            [tr('المتوسط', 'Average'), formatEGP(Math.round(stats.avg), locale)],
            [tr('التذبذب', 'Volatility'), `${stats.volatility.toFixed(1)}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-accent px-3 py-2"><dt className="text-muted">{k}</dt><dd className="num mt-0.5 font-semibold">{v}</dd></div>
          ))}
        </dl>
      ) : null}
      {stats ? (
        <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${stats.changePct <= 0 ? 'text-palm' : 'text-destructive'}`}>
          {stats.changePct <= 0 ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          {tr(`أقل سعر اتغيّر ${stats.changePct.toFixed(1)}% في المدة دي`, `Lowest price moved ${stats.changePct.toFixed(1)}% in this range`)}
        </p>
      ) : null}
    </div>
  );
}

/** Explains the deal score from visible data. Approximate, labelled as such. */
export function ScoreBreakdown({ item }: { item: ProductDetail }) {
  const tr = useTr();
  const best = item.bestOffer;
  if (!best) return null;
  const vsMedian = item.median30 ? (1 - best.priceEgp / item.median30) * 100 : null;
  const vsMin = item.min90 ? (best.priceEgp / item.min90 - 1) * 100 : null;
  const rows = [
    { label: tr('مقارنة بوسيط ٣٠ يوم', 'Versus 30-day median'), value: vsMedian, good: (vsMedian ?? 0) > 3, text: vsMedian == null ? '—' : tr(`${vsMedian >= 0 ? 'أرخص' : 'أغلى'} بـ ${Math.abs(vsMedian).toFixed(1)}%`, `${Math.abs(vsMedian).toFixed(1)}% ${vsMedian >= 0 ? 'cheaper' : 'pricier'}`), weight: Math.max(0, Math.min(100, 50 + (vsMedian ?? 0) * 3)) },
    { label: tr('قرب من أقل سعر في ٩٠ يوم', 'Closeness to 90-day low'), value: vsMin, good: (vsMin ?? 99) < 3, text: vsMin == null ? '—' : vsMin <= 0.01 ? tr('ده أقل سعر', 'This is the low') : tr(`أعلى بـ ${vsMin.toFixed(1)}%`, `${vsMin.toFixed(1)}% above`), weight: Math.max(0, 100 - (vsMin ?? 50) * 5) },
    { label: tr('مصداقية الخصم', 'Discount honesty'), value: 0, good: !best.fakeDiscount, text: best.fakeDiscount ? tr('خصم مشبوه', 'Suspicious') : tr('سليم', 'Clean'), weight: best.fakeDiscount ? 10 : 95 },
    { label: tr('التوفر', 'Availability'), value: 0, good: best.inStock, text: best.inStock ? tr('متوفر', 'In stock') : tr('غير متوفر', 'Out of stock'), weight: best.inStock ? 100 : 20 },
    { label: tr('تقييم المتجر للمنتج', 'Listing rating'), value: 0, good: (best.rating ?? 0) >= 4.3, text: best.rating ? `${best.rating}/5` : '—', weight: best.rating ? (best.rating / 5) * 100 : 50 },
  ];
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">{r.good ? <CheckCircle2 className="h-4 w-4 text-palm" /> : <AlertTriangle className="h-4 w-4 text-primary" />}{r.label}</span>
              <span className="num font-semibold">{r.text}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full" style={{ width: `${r.weight}%`, background: r.good ? 'var(--palm)' : 'var(--saffron)' }} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 flex-none" />{tr('ده تفسير مبسّط للتقييم من البيانات الظاهرة؛ الرقم النهائي بيحسبه محرك صفقة.', 'A simplified reading of the score from visible data; the final number comes from the Safqa engine.')}</p>
    </div>
  );
}

export function PercentileBar({ price, min, max }: { price: number; min: number; max: number }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const pct = max > min ? ((price - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <div className="relative mt-6 h-3 rounded-full" style={{ background: 'linear-gradient(90deg, var(--palm), var(--saffron), var(--clay))' }} dir="ltr">
        <span className="absolute -top-7 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background" style={{ left: `${pct}%` }}>{tr('دلوقتي', 'Now')}</span>
        <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-card bg-foreground shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted" dir="ltr">
        <span className="num">{formatEGP(min, locale)}</span>
        <span className="num">{formatEGP(max, locale)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{pct < 20 ? tr('السعر في أرخص خُمس من مداه.', 'Price sits in the cheapest fifth of its range.') : pct > 70 ? tr('السعر قريب من أغلى نقطة — استنى لو تقدر.', 'Price is near its high — wait if you can.') : tr('السعر في نص مداه تقريبًا.', 'Price is mid-range.')}</p>
    </div>
  );
}

export function StoreSpread({ item }: { item: ProductDetail }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const fresh = item.offers.filter((o) => o.condition === 'new');
  const used = item.offers.filter((o) => o.condition === 'used');
  if (!fresh.length) return null;
  const lo = Math.min(...fresh.map((o) => o.priceEgp));
  const hi = Math.max(...fresh.map((o) => o.priceEgp));
  const usedLo = used.length ? Math.min(...used.map((o) => o.priceEgp)) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-accent p-4"><p className="flex items-center gap-1 text-xs text-muted"><Scale className="h-3.5 w-3.5" />{tr('الفرق بين المتاجر', 'Spread across stores')}</p><p className="num mt-1 text-xl font-bold">{formatEGP(hi - lo, locale)}</p><p className="text-xs text-muted">{hi > lo ? tr(`${(((hi - lo) / hi) * 100).toFixed(1)}% توفير لو اشتريت من الأرخص`, `${(((hi - lo) / hi) * 100).toFixed(1)}% saved buying from the cheapest`) : tr('نفس السعر في كل مكان', 'Same price everywhere')}</p></div>
      <div className="rounded-2xl bg-accent p-4"><p className="text-xs text-muted">{tr('أرخص جديد', 'Cheapest new')}</p><p className="num mt-1 text-xl font-bold text-palm">{formatEGP(lo, locale)}</p><p className="text-xs text-muted">{fresh.length} {tr('عرض جديد', 'new offers')}</p></div>
      <div className="rounded-2xl bg-accent p-4"><p className="flex items-center gap-1 text-xs text-muted"><Activity className="h-3.5 w-3.5" />{tr('مستعمل مقابل جديد', 'Used vs new')}</p><p className="num mt-1 text-xl font-bold">{usedLo != null ? formatEGP(usedLo, locale) : '—'}</p><p className="text-xs text-muted">{usedLo != null ? tr(`أرخص بـ ${(((lo - usedLo) / lo) * 100).toFixed(0)}% من الجديد — افحصه كويس`, `${(((lo - usedLo) / lo) * 100).toFixed(0)}% below new — inspect carefully`) : tr('مفيش عروض مستعملة', 'No used offers')}</p></div>
    </div>
  );
}

export function ChangeLog({ history }: { history: PriceHistory }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const changes = history.series
    .flatMap((s) => s.points.slice(1).map((p, i) => ({ store: locale === 'ar' ? s.storeNameAr : s.storeNameEn, t: p.t, from: s.points[i]?.priceEgp ?? p.priceEgp, to: p.priceEgp })))
    .filter((c) => Math.abs(c.to - c.from) / c.from >= 0.02)
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, 8);
  if (!changes.length) return <p className="text-sm text-muted">{tr('مفيش تغييرات كبيرة (أكتر من ٢٪).', 'No big changes (over 2%).')}</p>;
  return (
    <ol className="relative space-y-3 border-s-2 border-border ps-5">
      {changes.map((c) => (
        <li key={`${c.store}-${c.t}`} className="relative text-sm">
          <span className={`absolute -start-[27px] top-1 h-3 w-3 rounded-full ${c.to < c.from ? 'bg-[var(--palm)]' : 'bg-[var(--clay)]'}`} />
          <span className="text-xs text-muted">{new Date(c.t).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })} · {c.store}</span>
          <p className="num font-semibold">{formatEGP(c.from, locale)} → <span className={c.to < c.from ? 'text-palm' : 'text-destructive'}>{formatEGP(c.to, locale)}</span> <span className="text-xs">({(((c.to - c.from) / c.from) * 100).toFixed(1)}%)</span></p>
        </li>
      ))}
    </ol>
  );
}
