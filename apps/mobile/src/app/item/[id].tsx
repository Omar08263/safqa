import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { PriceChart } from '../../components/chart';
import { useToast } from '../../components/toast';
import { Badge, Button, Card, Loading, SectionTitle, StateMessage, Tile } from '../../components/ui';
import { V5Card, VoteBar } from '../../components/v5';
import { SITE_URL } from '../../lib/data';
import { success, tap, warn } from '../../lib/feedback';
import { ago, egp, pct } from '../../lib/format';
import { useGrid } from '../../lib/layout';
import { useWatch } from '../../lib/store';
import { radius, type as t, useColors } from '../../lib/theme';
import { shopifyThumb, useLoad, v5 } from '../../lib/v5';

const VERDICT = { buy: { e: '✅', l: 'وقت كويس تشتري', k: 'palm' }, wait: { e: '⏳', l: 'استنى شوية', k: 'primary' }, fair: { e: '⚖️', l: 'سعر عادي', k: 'muted' }, unknown: { e: '🔍', l: 'لسه بنجمع بيانات', k: 'muted' } } as const;

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const toast = useToast();
  const watch = useWatch();
  const { width, gutter, tablet, columns } = useGrid();
  const { data: p, error, loading, refresh } = useLoad(() => v5.product(id), [id]);
  if (!p) return loading ? <Loading /> : <StateMessage emoji="📡" title={error?.includes('404') ? 'المنتج ده مش موجود' : 'مقدرناش نجيب المنتج'} body="اتأكد من النت وجرّب تاني." action={{ label: 'جرّب تاني', onPress: () => void refresh() }} />;
  const o = p.bestOffer;
  const offers = [...p.offers].sort((a, b) => a.priceEgp - b.priceEgp);
  const v = VERDICT[p.prediction.verdict];
  const watching = watch.has(p.id);
  const imgW = tablet ? Math.min(380, width * 0.4) : width - gutter * 2;
  const chartW = tablet ? width - gutter * 2 - imgW - 56 : width - gutter * 2 - 32;
  const series = [{ storeSlug: 'best', storeNameAr: 'أقل سعر', points: p.series.map((s) => ({ t: s.at, priceEgp: s.price })) }];
  const toggleWatch = () => {
    if (watching) { watch.remove(p.id); toast({ text: 'بطّلنا نراقبه' }); return; }
    const r = watch.add(p.id, o?.priceEgp ?? null, null, { title: p.titleAr || p.titleEn, image: p.image ?? undefined });
    if (r === 'full') { warn(); toast({ text: `باقتك بتسمح بـ ${watch.limit} منتج في المراقبة.`, action: { label: 'الباقات', onPress: () => router.push('/account') } }); return; }
    success(); toast({ text: 'هنراقبه وهنقولك لو نزل 🔔' });
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingBottom: 40, gap: 14 }}>
      <Stack.Screen options={{ title: p.brand ? p.brand.toUpperCase() : 'المنتج' }} />
      <View style={{ flexDirection: tablet ? 'row' : 'column', gap: 18 }}>
        <Tile uri={shopifyThumb(p.image, 800)} size={imgW} label={p.titleAr} />
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={[t.meta, { color: c.muted }]}>{p.category?.nameAr ?? ''}{p.offerCount > 1 ? ` · في ${p.offerCount} متاجر` : ''}</Text>
          <Text style={[t.h2, { color: c.ink }]} accessibilityRole="header">{p.titleAr || p.titleEn}</Text>
          {p.titleEn && p.titleEn !== p.titleAr ? <Text style={[t.small, { color: c.muted, writingDirection: 'ltr', textAlign: 'left' }]}>{p.titleEn}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <Text style={[t.h1, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{egp(o?.priceEgp)}</Text>
            {o?.listPriceEgp && o.listPriceEgp > o.priceEgp ? <Text style={[t.small, { color: c.muted, textDecorationLine: 'line-through' }]}>{egp(o.listPriceEgp)}</Text> : null}
            {p.v5?.dropPct ? <Badge text={`↓ ${pct(p.v5.dropPct)} آخر نزول`} color={c.palm} /> : null}
          </View>
          <Text style={[t.meta, { color: c.muted }]}>{o?.store.nameAr} · اتأكدنا {p.v5?.checkedAt ? ago(p.v5.checkedAt) : 'مؤخرًا'}</Text>
          <VoteBar id={p.id} hot={p.votes.hot} cold={p.votes.cold} heat={p.v5?.heat ?? 0} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {o ? <Button label={`اشتري من ${o.store.nameAr}`} icon="🛒" onPress={() => void WebBrowser.openBrowserAsync(o.url)} /> : null}
            <Button label={watching ? 'بتراقبه ✓' : 'راقب السعر'} icon="🔔" kind={watching ? 'palm' : 'ghost'} onPress={toggleWatch} />
            <Button label="شارك" kind="ghost" onPress={() => void Share.share({ message: `${p.titleAr || p.titleEn} بـ ${egp(o?.priceEgp)} على صفقة\n${SITE_URL}/p/${p.id}` })} />
          </View>
        </View>
      </View>

      <Card style={{ borderColor: c[v.k], borderWidth: 2, gap: 6 }}>
        <Text style={[t.h3, { color: c.ink }]}>{v.e} {v.l}</Text>
        <Text style={[t.small, { color: c.ink }]}>{p.prediction.reasonAr}</Text>
        <Text style={[t.meta, { color: c.muted }]}>تقدير إحصائي من تاريخ السعر الحقيقي، مش ضمان.</Text>
      </Card>

      <SectionTitle title="الأسعار في المتاجر" hint="مرتبة من الأرخص · بتتحدّث تلقائي" />
      {offers.map((x, i) => (
        <Pressable key={x.url} accessibilityRole="link" accessibilityLabel={`${x.store.nameAr} ${egp(x.priceEgp)}`} onPress={() => { tap(); void WebBrowser.openBrowserAsync(x.url); }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderColor: i === 0 ? c.palm : c.line }}>
            <View style={{ flex: 1 }}>
              <Text style={[t.title, { color: c.ink }]}>{x.store.nameAr}{i === 0 ? ' · الأرخص' : ''}</Text>
              <Text style={[t.meta, { color: c.muted }]}>{x.inStock ? 'متوفر' : 'نفد'} · {ago(x.checkedAt)}{x.userReported ? ' · من المستخدمين' : ''}</Text>
            </View>
            <Text style={[t.price, { color: i === 0 ? c.palm : c.ink }]}>{egp(x.priceEgp)}</Text>
          </Card>
        </Pressable>
      ))}

      <SectionTitle title="تاريخ السعر" hint={p.v5?.low ? `أقل سعر متسجل ${egp(p.v5.low)}` : undefined} />
      <Card style={{ borderRadius: radius.lg }}><PriceChart series={series} width={chartW} median={p.v5?.med30 ?? null} /></Card>

      {p.similar.length ? (
        <>
          <SectionTitle title="منتجات شبهه" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {p.similar.slice(0, columns * 2).map((s) => <View key={s.id} style={{ width: (width - gutter * 2 - 12 * (columns - 1)) / columns }}><V5Card p={s} /></View>)}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
