import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Series } from '../lib/data';
import { cairoTime, egp } from '../lib/format';
import { type as t, useColors } from '../lib/theme';

const COLORS = ['#0E6B52', '#C9840A', '#B8432F', '#3D6FB4', '#7A4FB0'];

/** Price history: one line per store, real recorded points only. */
export function PriceChart({ series, width, median }: { series: Series[]; width: number; median?: number | null }) {
  const c = useColors();
  const [sel, setSel] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const pts = series.flatMap((s) => s.points);
  if (pts.length < 2) {
    return <Text style={[t.small, { color: c.muted }]}>لسه بنجمّع تاريخ السعر. ارجع بكرة هتلاقي الرسم اتملى 📈</Text>;
  }
  const times = pts.map((p) => Date.parse(p.t));
  const prices = pts.map((p) => p.priceEgp);
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const lo = Math.min(...prices, median ?? Infinity) * 0.98, hi = Math.max(...prices, median ?? -Infinity) * 1.02;
  const x = (tt: number) => pad.l + ((tt - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const flat = series.flatMap((s, si) => s.points.map((p) => ({ si, p })));
  const selected = sel != null ? flat[sel] : null;
  return (
    <View accessibilityLabel={`رسم تاريخ السعر لـ ${series.length} متجر`}>
      <Svg width={width} height={H} onPress={() => setSel(null)}>
        {median ? (
          <>
            <Line x1={pad.l} x2={width - pad.r} y1={y(median)} y2={y(median)} stroke={c.muted} strokeDasharray="4 5" strokeWidth={1} />
            <SvgText x={width - pad.r} y={y(median) - 4} fontSize={10} fill={c.muted} textAnchor="end">وسيط 30 يوم</SvgText>
          </>
        ) : null}
        {series.map((s, si) => {
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.t)).toFixed(1)},${y(p.priceEgp).toFixed(1)}`).join(' ');
          return <Path key={s.storeSlug} d={d} stroke={COLORS[si % COLORS.length]} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {flat.map(({ si, p }, i) => (
          <Circle key={i} cx={x(Date.parse(p.t))} cy={y(p.priceEgp)} r={sel === i ? 6 : 3.5} fill={COLORS[si % COLORS.length]} onPress={() => setSel(i)} />
        ))}
      </Svg>
      <View style={{ minHeight: 20 }}>
        {selected ? (
          <Text style={[t.small, { color: c.ink }]}>{series[selected.si].storeNameAr}: {egp(selected.p.priceEgp)} · {cairoTime(selected.p.t)} (القاهرة)</Text>
        ) : (
          <Text style={[t.meta, { color: c.muted }]}>اضغط على أي نقطة تشوف السعر والوقت</Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
        {series.map((s, si) => (
          <View key={s.storeSlug} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS[si % COLORS.length] }} />
            <Text style={[t.meta, { color: c.muted }]}>{s.storeNameAr}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
