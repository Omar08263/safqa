import { formatEGP } from '@safqa/shared';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export function SeriesChart({ series, low }: { series: { at: string; price: number }[]; low?: number | null }) {
  const { locale } = usePrefs();
  const tr = useTr();
  if (series.length < 2) {
    return <div className="grid h-48 place-items-center rounded-2xl bg-accent/50 p-4 text-center text-sm text-muted">{tr('بدأنا نسجّل سعر المنتج ده — الرسم البياني هيظهر مع أول تغيير حقيقي في السعر 📈', 'We just started tracking this product; the chart appears with the first real price change')}</div>;
  }
  const pts = [...series, { at: new Date().toISOString(), price: series[series.length - 1]!.price }];
  const data = pts.map((p) => ({ t: new Date(p.at).toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }), price: p.price }));
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="v5fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56} domain={['dataMin - 100', 'dataMax + 100']} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
          <Tooltip formatter={(v: number) => [formatEGP(v, locale), tr('أحسن سعر', 'Best price')]} contentStyle={{ background: 'var(--elev)', border: '1px solid var(--line)', borderRadius: 12 }} />
          {low ? <ReferenceLine y={low} stroke="var(--palm)" strokeDasharray="4 4" label={{ value: tr('أقل سعر', 'Low'), fill: 'var(--palm)', fontSize: 11, position: 'insideTopLeft' }} /> : null}
          <Area type="stepAfter" dataKey="price" stroke="var(--accent)" strokeWidth={2.5} fill="url(#v5fill)" animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

