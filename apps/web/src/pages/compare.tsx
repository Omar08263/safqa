import { formatEGP, localized } from '@safqa/shared';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Crown, GitCompare, Plus, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { appUrl, ShareBar } from '../components/share';
import { Button } from '../components/ui/button';
import { ProductThumb } from '../features/visuals';
import { Card, PageHeader } from '../fx/fx';
import { track } from '../lib/activity';
import { useCatalog } from '../lib/catalog';
import { COMPARE_MAX, useCompare } from '../lib/compare';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

const colors = ['#c9840a', '#0e6b52', '#6d4ad8', '#c2346b'];

export function ComparePage({ ids: fromUrl }: { ids?: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const { client } = useSession();
  const compare = useCompare();
  const catalog = useCatalog();
  useEffect(() => {
    if (fromUrl) compare.set(fromUrl.split(',').filter(Boolean).slice(0, COMPARE_MAX));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);
  useEffect(() => {
    if (compare.ids.length >= 2) track.compare();
  }, [compare.ids.length]);

  const details = useQueries({ queries: compare.ids.map((id) => ({ queryKey: ['product', id], queryFn: () => client.product(id) })) });
  const histories = useQueries({ queries: compare.ids.map((id) => ({ queryKey: ['history', id], queryFn: () => client.history(id) })) });
  const preds = useQueries({ queries: compare.ids.map((id) => ({ queryKey: ['prediction', id], queryFn: () => client.prediction(id) })) });
  const items = details.map((d) => d.data).filter((d): d is NonNullable<typeof d> => Boolean(d));

  type Row = { label: string; values: (number | null)[]; fmt: (v: number | null, i: number) => string; best?: 'min' | 'max' };
  const money = (v: number | null) => (v == null ? '—' : formatEGP(v, locale));
  const rows: Row[] = [
    { label: tr('أحسن سعر', 'Best price'), values: items.map((p) => p.bestOffer?.priceEgp ?? null), fmt: money, best: 'min' },
    { label: tr('تقييم الصفقة', 'Deal score'), values: items.map((p) => p.bestOffer?.dealScore ?? null), fmt: (v) => (v == null ? '—' : `${v}/100`), best: 'max' },
    { label: tr('الخصم', 'Discount'), values: items.map((p) => p.bestOffer?.discountPct ?? null), fmt: (v, i) => (v == null ? '—' : `${v.toFixed(1)}%${items[i]?.bestOffer?.fakeDiscount ? ' ⚠️' : ''}`), best: 'max' },
    { label: tr('وسيط 30 يوم', '30-day median'), values: items.map((p) => p.median30 ?? null), fmt: money },
    { label: tr('أقل سعر 90 يوم', '90-day low'), values: items.map((p) => p.min90 ?? null), fmt: money, best: 'min' },
    { label: tr('أرخص من الوسيط بـ', 'Below median by'), values: items.map((p) => (p.median30 && p.bestOffer ? (1 - p.bestOffer.priceEgp / p.median30) * 100 : null)), fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`), best: 'max' },
    { label: tr('عدد العروض', 'Offers'), values: items.map((p) => p.offers.length), fmt: (v) => String(v ?? '—'), best: 'max' },
    { label: tr('التقييم', 'Rating'), values: items.map((p) => p.bestOffer?.rating ?? null), fmt: (v) => (v == null ? '—' : `★ ${v}`), best: 'max' },
    { label: tr('متوفر', 'In stock'), values: items.map((p) => (p.offers.some((o) => o.inStock) ? 1 : 0)), fmt: (v) => (v ? '✓' : '✗') },
    { label: tr('التوصية', 'Advice'), values: items.map(() => null), fmt: (_v, i) => (preds[i]?.data ? (preds[i]?.data?.recommendation === 'buy_now' ? tr('اشتري دلوقتي', 'Buy now') : tr('استنى', 'Wait')) : '—') },
  ];
  const winner = (r: Row) => {
    if (!r.best) return -1;
    const vals = r.values.map((v) => (v == null ? null : v));
    const valid = vals.filter((v): v is number => v != null);
    if (valid.length < 2) return -1;
    const target = r.best === 'min' ? Math.min(...valid) : Math.max(...valid);
    return vals.indexOf(target);
  };

  // Overlay: each product's lowest price per date, indexed to 100 at the start.
  const series = histories.map((h, i) => {
    const byDay = new Map<string, number>();
    for (const s of h.data?.series ?? []) for (const p of s.points) {
      const d = p.t.slice(0, 10);
      byDay.set(d, Math.min(byDay.get(d) ?? Number.POSITIVE_INFINITY, p.priceEgp));
    }
    const days = [...byDay.keys()].sort();
    const first = byDay.get(days[0] ?? '') ?? 1;
    return { key: `p${i}`, points: days.map((d) => ({ d, v: ((byDay.get(d) ?? first) / first) * 100 })) };
  });
  const allDays = [...new Set(series.flatMap((s) => s.points.map((p) => p.d)))].sort();
  const chart = allDays.map((d) => {
    const row: Record<string, string | number> = { d: new Date(d).toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }) };
    for (const s of series) {
      const hit = s.points.find((p) => p.d === d);
      if (hit) row[s.key] = Number(hit.v.toFixed(1));
    }
    return row;
  });
  const available = (catalog.data?.items ?? []).filter((p) => !compare.ids.includes(p.id));

  return (
    <div>
      <PageHeader icon={<GitCompare className="h-6 w-6" />} kicker={tr('قارن قبل ما تقرر', 'Compare before you decide')} title={tr('مقارنة المنتجات', 'Product comparison')} lede={tr('ضيف لحد 4 منتجات. الخلية الخضرا هي الأحسن في كل صف، والرسم بيوضح مين سعره نزل أكتر.', 'Add up to 4 products. The green cell wins each row, and the chart shows whose price fell most.')}>
        {compare.ids.length ? <ShareBar url={appUrl(`/compare?ids=${compare.ids.join(',')}`)} title={tr('مقارنة صفقة', 'Safqa comparison')} /> : null}
      </PageHeader>

      {compare.ids.length < COMPARE_MAX ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <select aria-label={tr('ضيف منتج', 'Add a product')} className="h-10 min-w-64 rounded-full border border-border bg-card px-4 text-sm" value="" onChange={(e) => { if (e.target.value) compare.toggle(e.target.value); }}>
            <option value="">{tr('ضيف منتج للمقارنة…', 'Add a product to compare…')}</option>
            {available.map((p) => <option key={p.id} value={p.id}>{localized(locale, { ar: p.titleAr, en: p.titleEn })}</option>)}
          </select>
          {compare.ids.length ? <Button variant="ghost" size="sm" onClick={compare.clear}><Trash2 className="h-4 w-4" />{tr('مسح الكل', 'Clear all')}</Button> : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <Card className="text-center"><p className="py-8 text-muted">{tr('لسه مفيش منتجات. دوس على أيقونة المقارنة في أي كارت، أو اختار من فوق.', 'Nothing yet. Tap the compare icon on any card, or pick above.')}</p></Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="w-40 p-3" />
                  {items.map((p, i) => (
                    <th key={p.id} className="p-3 text-start align-top">
                      <div className="relative">
                        <ProductThumb id={p.id} slug={p.category?.slug} className="mx-auto w-full max-w-[120px]" seed={i} />
                        <button type="button" onClick={() => compare.remove(p.id)} className="absolute end-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white" aria-label={tr('شيل', 'Remove')}><X className="h-4 w-4" /></button>
                      </div>
                      <Link to="/product/$id" params={{ id: p.id }} className="mt-2 line-clamp-2 block font-semibold hover:text-primary"><span className="me-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} />{localized(locale, { ar: p.titleAr, en: p.titleEn })}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const w = winner(r);
                  return (
                    <tr key={r.label} className="border-t border-border">
                      <th className="p-3 text-start font-medium text-muted">{r.label}</th>
                      {items.map((p, i) => (
                        <td key={p.id} className={`num p-3 font-semibold ${w === i ? 'bg-[var(--palm)]/12 text-palm' : ''}`}>{w === i ? <Crown className="me-1 inline h-3.5 w-3.5" /> : null}{r.fmt(r.values[i] ?? null, i)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {chart.length ? (
            <Card className="mt-6">
              <h2 className="text-lg font-bold">{tr('مين سعره نزل أكتر؟ (100 = أول يوم)', 'Whose price fell most? (100 = first day)')}</h2>
              <div className="mt-3 h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                    <XAxis dataKey="d" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} domain={['auto', 'auto']} width={40} />
                    <Tooltip contentStyle={{ background: 'var(--elev)', border: '1px solid var(--line)', borderRadius: 12 }} />
                    <Legend formatter={(v: string) => { const i = Number(v.slice(1)); const p = items[i]; return p ? localized(locale, { ar: p.titleAr, en: p.titleEn }).slice(0, 28) : v; }} wrapperStyle={{ fontSize: 12 }} />
                    {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2.5} dot={false} connectNulls />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
