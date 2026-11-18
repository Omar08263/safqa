import { formatEGP, type PriceHistory } from '@safqa/shared';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePrefs } from '../lib/prefs';

const palette = ['#c9840a', '#0e6b52', '#b8432f', '#3d5a80', '#7a5c3e', '#2a6f7f'];

export function PriceChart({ history }: { history: PriceHistory }) {
  const { locale } = usePrefs();
  const stamps = [...new Set(history.series.flatMap((series) => series.points.map((point) => point.t)))].sort();
  const data = stamps.map((stamp) => {
    const row: Record<string, string | number> = {
      t: new Date(stamp).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
      }),
    };
    for (const series of history.series) {
      const point = series.points.find((item) => item.t === stamp);
      if (point) row[series.storeSlug] = point.priceEgp;
    }
    return row;
  });

  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {history.series.map((series, index) => (
              <linearGradient key={series.storeSlug} id={`fill-${series.storeSlug}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[index % palette.length]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={palette[index % palette.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: 'var(--muted)', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            width={72}
            domain={[
              (min: number) => Math.max(0, Math.floor((min * 0.94) / 500) * 500),
              (max: number) => Math.ceil((max * 1.03) / 500) * 500,
            ]}
            tickFormatter={(value: number) => formatEGP(value, 'en')}
          />
          <Tooltip
            formatter={(value) => formatEGP(Number(value ?? 0), locale)}
            contentStyle={{ background: 'var(--elev)', border: '1px solid var(--line)', borderRadius: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
          {history.series.map((series, index) => (
            <Area
              key={series.storeSlug}
              type="monotone"
              dataKey={series.storeSlug}
              name={locale === 'ar' ? series.storeNameAr : series.storeNameEn}
              stroke={palette[index % palette.length]}
              fill={`url(#fill-${series.storeSlug})`}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
