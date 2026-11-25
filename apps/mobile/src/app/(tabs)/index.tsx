import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { V5Card } from '../../components/v5';
import { tap } from '../../lib/feedback';
import { useLoad, v5 } from '../../lib/v5';
import { FreshnessBar, Header } from '../../components/screen';
import { Card, Chip, DealCard, SectionTitle, SkeletonGrid, StateMessage } from '../../components/ui';
import { greeting, num } from '../../lib/format';
import { useGrid } from '../../lib/layout';
import { useSnapshot } from '../../lib/snapshot';
import { type as t, useColors } from '../../lib/theme';

export default function Home() {
  const c = useColors();
  const { data, loading, refresh } = useSnapshot();
  const { columns, gutter } = useGrid();
  const [cat, setCat] = useState<string | null>(null);
  const snap = data?.snap;

  const cats = useMemo(() => {
    const m = new Map<string, { slug: string; name: string; n: number }>();
    snap?.all.forEach((p) => {
      if (!p.category) return;
      const e = m.get(p.category.slug) ?? { slug: p.category.slug, name: p.category.nameAr, n: 0 };
      e.n += 1;
      m.set(p.category.slug, e);
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [snap]);

  const deals = useMemo(
    () =>
      (snap?.all ?? [])
        .filter((p) => p.bestOffer?.inStock && (!cat || p.category?.slug === cat))
        .sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0)),
    [snap, cat],
  );
  const fakes = snap?.all.filter((p) => p.bestOffer?.fakeDiscount).length ?? 0;
  const stores = new Set(snap?.all.flatMap((p) => (p.bestOffer ? [p.bestOffer.store.slug] : []))).size;

  const meta = useLoad(() => v5.meta(), []);
  const hot = useLoad(() => v5.deals({ sort: 'heat' }), []);
  const head = (
    <View>
      <Header title={greeting()} subtitle="صفقة بتدوّرلك على السعر الحقيقي" />
      <FreshnessBar />
      {snap ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {[
            { v: num(snap.all.length), l: 'منتج بنتابعه' },
            { v: num(stores), l: 'متجر مصري' },
            { v: num(fakes), l: 'خصم وهمي اتكشف' },
          ].map((s) => (
            <Card key={s.l} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
              <Text style={[t.h2, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{s.v}</Text>
              <Text style={[t.meta, { color: c.muted, textAlign: 'center' }]}>{s.l}</Text>
            </Card>
          ))}
        </View>
      ) : null}
      {meta.data?.products ? (
        <Pressable accessibilityRole="button" accessibilityLabel="افتح الصفقات السخنة" onPress={() => { tap(); router.push('/hot'); }}>
          <Card style={{ marginTop: 12, padding: 14, backgroundColor: '#1C1915', borderColor: '#E8590C88' }}>
            <Text style={[t.h3, { color: '#FFC233' }]}>🔥 {num(meta.data.products)} منتج من {meta.data.stores.filter((x) => x.products).length} متاجر</Text>
            <Text style={[t.small, { color: '#F6F0E6' }]}>كتالوج صفقة 5: أسعار بتتحدّث تلقائي، تصويت المجتمع، ونزول الأسعار مباشر ‹</Text>
          </Card>
        </Pressable>
      ) : null}
      {hot.data?.items.length ? (
        <>
          <SectionTitle title="الأسخن دلوقتي في كل المتاجر" hint="بتصويت المجتمع ونزول السعر الحقيقي" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
            {hot.data.items.slice(0, 10).map((p) => <View key={p.id} style={{ width: 180 }}><V5Card p={p} /></View>)}
          </ScrollView>
        </>
      ) : null}
      <SectionTitle title="أحسن صفقات النهارده 🔥" hint="مرتبة بتقييم الصفقة: السعر مقارنة بتاريخه وباقي المتاجر" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        <Chip label="الكل" active={!cat} onPress={() => setCat(null)} />
        {cats.map((x) => (
          <Chip key={x.slug} label={`${x.name} · ${x.n}`} active={cat === x.slug} onPress={() => setCat(x.slug)} />
        ))}
      </ScrollView>
    </View>
  );

  if (!snap) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter }}>
        {head}
        {loading ? <SkeletonGrid columns={columns} /> : (
          <StateMessage emoji="📡" title="مقدرناش نوصل للأسعار" body="اتأكد من النت وجرّب تاني. أول ما تفتح مرة بنحفظ نسخة تشتغل من غير نت." action={{ label: 'جرّب تاني', onPress: () => void refresh() }} />
        )}
      </ScrollView>
    );
  }

  return (
    <FlatList
      key={`cols-${columns}`}
      style={{ backgroundColor: c.bg }}
      data={deals}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={head}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32 }}
      columnWrapperStyle={{ gap: 12 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} colors={[c.palm]} tintColor={c.palm} />}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / columns }}>
          <DealCard p={item} snap={snap} />
        </View>
      )}
      ListEmptyComponent={<StateMessage emoji="🧺" title="مفيش عروض في القسم ده دلوقتي" body="جرّب قسم تاني أو شوف كل العروض." action={{ label: 'كل العروض', onPress: () => setCat(null) }} />}
      ListFooterComponent={
        <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 20 }]} onPress={() => router.push('/radar')}>
          الأسعار بتتجمع من صفحات المتاجر نفسها مع احترام robots.txt. شوف الرادار ←
        </Text>
      }
    />
  );
}
