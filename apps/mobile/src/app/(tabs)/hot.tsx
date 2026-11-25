import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Header } from '../../components/screen';
import { Chip, SkeletonGrid, StateMessage } from '../../components/ui';
import { LiveDot, V5Card } from '../../components/v5';
import { tap } from '../../lib/feedback';
import { egp, pct } from '../../lib/format';
import { useGrid } from '../../lib/layout';
import { radius, type as t, useColors } from '../../lib/theme';
import { useLiveDrops, useLoad, usePaged, v5 } from '../../lib/v5';

const SORTS = [
  { id: 'heat', label: '🔥 الأسخن' },
  { id: 'new', label: '🆕 الأحدث' },
  { id: 'drop', label: '📉 أكبر نزول' },
  { id: 'price', label: '💸 الأرخص' },
];

export default function Hot() {
  const c = useColors();
  const { columns, gutter } = useGrid();
  const [cat, setCat] = useState<string | undefined>();
  const [sort, setSort] = useState('heat');
  const meta = useLoad(() => v5.meta(), []);
  const feed = usePaged((page) => v5.deals({ cat, sort, page }), [cat, sort]);
  const drops = useLiveDrops();
  const latest = drops[0];
  return (
    <FlatList
      key={`h-${columns}`}
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32 }}
      data={feed.items}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      columnWrapperStyle={{ gap: 12 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      refreshControl={<RefreshControl refreshing={feed.loading && feed.items.length > 0} onRefresh={() => { void feed.refresh(); void meta.refresh(); }} tintColor={c.palm} />}
      onEndReached={feed.next}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 12 }}>
          <Header title="الصفقات السخنة 🔥" subtitle={meta.data?.products ? `${meta.data.products.toLocaleString('en')} منتج من ${meta.data.stores.filter((s) => s.products).length} متاجر مصرية · بتتحدّث تلقائي` : 'أسعار حقيقية من المتاجر المصرية'} />
          {latest ? (
            <Pressable accessibilityRole="button" accessibilityLabel="نزول الأسعار المباشر" onPress={() => { tap(); router.push('/drops'); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <LiveDot />
              <Text style={[t.small, { color: c.ink, flex: 1 }]} numberOfLines={1}>مباشر: {latest.product.titleAr} نزل {pct(latest.pct)} ← {egp(latest.new)}</Text>
              <Text style={{ color: c.muted }}>‹</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {SORTS.map((s) => <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />)}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="الكل" active={!cat} onPress={() => setCat(undefined)} />
            {(meta.data?.categories ?? []).filter((x) => x.n).map((x) => <Chip key={x.slug} label={`${x.emoji} ${x.nameAr}`} active={cat === x.slug} onPress={() => setCat(x.slug)} />)}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => { tap(); router.push('/add'); }} style={{ padding: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.primary }}>
            <Text style={[t.small, { color: c.ink, textAlign: 'center' }]}>🔗 لقيت منتج مش عندنا؟ الصق رابطه وإحنا نتابع سعره</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => <View style={{ flex: 1 / columns }}><V5Card p={item} /></View>}
      ListFooterComponent={feed.loading && feed.items.length ? <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 16 }]}>بنجيب كمان…</Text> : undefined}
      ListEmptyComponent={
        feed.error ? <StateMessage emoji="📡" title="مش قادرين نوصل لسيرفر الأسعار" body="اتأكد من النت. العروض المحفوظة لسه في الرئيسية." action={{ label: 'جرّب تاني', onPress: () => void feed.refresh() }} />
          : feed.loading ? <SkeletonGrid columns={columns} /> : <StateMessage emoji="🌙" title="مفيش صفقات في القسم ده دلوقتي" />
      }
    />
  );
}
