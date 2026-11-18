import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { PriceChart } from '../../components/chart';
import { useToast } from '../../components/toast';
import { Badge, Button, Card, Loading, ScorePill, SectionTitle, StateMessage, Tile } from '../../components/ui';
import { mediaUrl, SITE_URL } from '../../lib/data';
import { success, tap, warn } from '../../lib/feedback';
import { ago, egp, num, pct } from '../../lib/format';
import { useGrid } from '../../lib/layout';
import { ensurePermission } from '../../lib/notify';
import { useSnapshot } from '../../lib/snapshot';
import { useSettings, useWatch } from '../../lib/store';
import { radius, type as t, useColors } from '../../lib/theme';

const VERDICT: Record<string, { label: string; emoji: string }> = {
  buy_now: { label: 'اشتري دلوقتي', emoji: '✅' },
  wait: { label: 'استنى شوية', emoji: '⏳' },
  avoid: { label: 'بلاش دلوقتي', emoji: '✋' },
};

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { data, loading } = useSnapshot();
  const { width, gutter, tablet } = useGrid();
  const watch = useWatch();
  const { settings, update } = useSettings();
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(0);

  if (!data) return loading ? <Loading /> : <StateMessage emoji="📡" title="مقدرناش نجيب المنتج" body="اتأكد من النت وارجع تاني." />;
  const entry = data.snap.products[id];
  const p = entry?.detail ?? data.snap.all.find((x) => x.id === id);
  if (!p) return <StateMessage emoji="🧐" title="المنتج ده مش موجود" body="يمكن اتشال من الكتالوج. شوف العروض التانية." action={{ label: 'رجوع للرئيسية', onPress: () => router.replace('/') }} />;

  const o = p.bestOffer;
  const offers = [...(entry?.detail.offers ?? (o ? [o] : []))].sort((a, b) => a.priceEgp - b.priceEgp);
  const images = entry?.media?.images ?? [];
  const pred = entry?.prediction;
  const verdict = VERDICT[pred?.recommendation ?? entry?.debate?.recommendation ?? ''];
  const watching = watch.has(p.id);
  const galleryW = tablet ? Math.min(420, width * 0.45) : width - gutter * 2;
  const chartW = tablet ? width - gutter * 2 - galleryW - 24 : width - gutter * 2 - 32;

  const toggleWatch = async () => {
    if (watching) {
      const prev = watch.remove(p.id);
      toast({ text: 'بطّلنا نراقبه', action: prev ? { label: 'تراجع', onPress: () => watch.restore(prev) } : undefined });
      return;
    }
    const tgt = Number(target.replace(/[^\d.]/g, '')) || null;
    const r = watch.add(p.id, o?.priceEgp ?? null, tgt);
    if (r === 'full') { warn(); toast({ text: `باقتك بتسمح بـ ${watch.limit} منتج في المراقبة. رقّي باقتك أو شيل حاجة الأول.`, action: { label: 'الباقات', onPress: () => router.push('/account') } }); return; }
    success();
    toast({ text: tgt ? `هنقولك أول ما يوصل ${egp(tgt)} 🎯` : 'تمام، هنراقبه وهنقولك لو نزل 🔔', action: { label: 'تراجع', onPress: () => watch.remove(p.id) } });
    if (!settings.notifications) {
      const ok = await ensurePermission();
      update({ notifications: ok });
    }
  };

  const gallery = (
    <View style={{ width: galleryW }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / galleryW))}
        accessibilityLabel={`صور المنتج، ${images.length || 1} صورة`}
      >
        {(images.length ? images : [{ full: p.image ?? '', thumb: '', store: '' }]).map((img, i) => (
          <Tile key={i} uri={mediaUrl(img.full || img.thumb)} size={galleryW} label={`${p.titleAr} صورة ${i + 1}`} />
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {images.map((_, i) => <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? c.palm : c.line }} />)}
        </View>
      ) : null}
    </View>
  );

  const summary = (
    <View style={{ flex: 1, gap: 10 }}>
      <Text style={[t.meta, { color: c.muted }]}>{p.brand} · {p.category?.nameAr ?? ''}</Text>
      <Text style={[t.h2, { color: c.ink }]} selectable>{p.titleAr}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={[t.h1, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{egp(o?.priceEgp)}</Text>
        {o ? <ScorePill score={o.dealScore} /> : null}
        {o?.fakeDiscount ? <Badge text="⚠️ خصم وهمي" color={c.clay} /> : o?.discountPct ? <Badge text={`-${pct(o.discountPct)}`} color={c.palm} /> : null}
      </View>
      {o ? <Text style={[t.small, { color: c.muted }]}>أرخص سعر في {o.store.nameAr} · اتشاف {ago(o.lastSeenAt)}</Text> : null}
      {o?.fakeDiscountReason ? <Text style={[t.small, { color: c.clay }]}>{o.fakeDiscountReason}</Text> : null}
      {verdict ? (
        <Card style={{ padding: 12, gap: 4, backgroundColor: `${c.palm}12` }}>
          <Text style={[t.title, { color: c.ink }]}>{verdict.emoji} رأينا: {verdict.label}</Text>
          {pred?.reasonAr ? <Text style={[t.small, { color: c.ink }]}>{pred.reasonAr}</Text> : null}
          {pred ? <Text style={[t.meta, { color: c.muted }]}>الثقة {pct(pred.confidence * 100)} · محسوب من تاريخ السعر الحقيقي</Text> : null}
        </Card>
      ) : null}
      {!watching ? (
        <TextInput
          value={target}
          onChangeText={setTarget}
          keyboardType="number-pad"
          placeholder="السعر اللي عايزه (اختياري)"
          placeholderTextColor={c.muted}
          accessibilityLabel="السعر المستهدف بالجنيه"
          style={[t.body, { color: c.ink, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 48, textAlign: 'right', backgroundColor: c.card }]}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button label={watching ? 'بتراقبه ✓' : 'راقب السعر'} icon={watching ? undefined : '🔔'} kind={watching ? 'ghost' : 'palm'} onPress={() => void toggleWatch()} />
        <Button
          label="شارك"
          kind="ghost"
          icon="📤"
          onPress={() => void Share.share({ message: `${p.titleAr}\n${egp(o?.priceEgp)} في ${o?.store.nameAr ?? ''}${o?.fakeDiscount ? '\n⚠️ الخصم ده وهمي حسب صفقة' : ''}\n${SITE_URL}/#/product/${p.id}` })}
        />
      </View>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: p.brand || 'تفاصيل المنتج' }} />
      {tablet ? (
        <View style={{ flexDirection: 'row', gap: 24 }}>{gallery}{summary}</View>
      ) : (
        <View style={{ gap: 16 }}>{gallery}{summary}</View>
      )}

      <SectionTitle title="الأسعار في المتاجر" hint={`${offers.length} عرض · مرتبة من الأرخص`} />
      <View style={{ gap: 8 }}>
        {offers.map((of, i) => (
          <Pressable key={of.id} accessibilityRole="link" accessibilityLabel={`افتح ${of.store.nameAr}، ${egp(of.priceEgp)}`} onPress={() => { tap(); void WebBrowser.openBrowserAsync(of.url); }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderColor: i === 0 ? c.palm : c.line }}>
              <View style={{ flex: 1 }}>
                <Text style={[t.title, { color: c.ink }]}>{of.store.nameAr}{i === 0 ? ' · الأرخص' : ''}</Text>
                <Text style={[t.meta, { color: c.muted }]}>{of.inStock ? 'متوفر' : 'مش متوفر دلوقتي'}{of.listPriceEgp ? ` · كان ${egp(of.listPriceEgp)}` : ''}</Text>
              </View>
              <Text style={[t.price, { color: c.ink }]}>{egp(of.priceEgp)}</Text>
              <Text style={{ color: c.muted }}>↗</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="تاريخ السعر 📈" hint={entry?.history?.median30 ? `وسيط 30 يوم ${egp(entry.history.median30)} · أقل سعر 90 يوم ${egp(entry.history.min90)}` : undefined} />
      <Card>{entry?.history ? <PriceChart series={entry.history.series} width={Math.max(240, tablet ? width - gutter * 2 - 32 : chartW)} median={entry.history.median30} /> : <Text style={[t.small, { color: c.muted }]}>لسه مفيش تاريخ.</Text>}</Card>

      {entry?.media?.specs?.length ? (
        <>
          <SectionTitle title="المواصفات" />
          <Card style={{ gap: 6 }}>
            {entry.media.specs.slice(0, 14).map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, borderBottomWidth: i < Math.min(13, entry.media!.specs!.length - 1) ? 1 : 0, borderColor: c.line, paddingVertical: 6 }}>
                <Text style={[t.small, { color: c.muted, width: '38%' }]}>{s.key}</Text>
                <Text style={[t.small, { color: c.ink, flex: 1 }]} selectable>{s.value}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 20 }]}>
        الأسعار من صفحات المتاجر العامة وقت آخر تحديث ({num(offers.length)} متجر). السعر النهائي اللي في المتجر هو المرجع.
      </Text>
    </ScrollView>
  );
}
