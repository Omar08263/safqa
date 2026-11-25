import { Stack, router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Card, StateMessage, Tile } from '../components/ui';
import { LiveDot } from '../components/v5';
import { tap } from '../lib/feedback';
import { ago, egp, pct } from '../lib/format';
import { useGrid } from '../lib/layout';
import { type as t, useColors } from '../lib/theme';
import { shopifyThumb, useLiveDrops } from '../lib/v5';

export default function Drops() {
  const c = useColors();
  const { gutter } = useGrid();
  const items = useLiveDrops();
  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: gutter, gap: 10, paddingBottom: 32 }}
      data={items}
      keyExtractor={(d) => String(d.dropId)}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Stack.Screen options={{ title: 'نزول الأسعار مباشر' }} />
          <LiveDot />
          <Text style={[t.small, { color: c.muted, flex: 1 }]}>بيتحدّث كل 20 ثانية من فحص الأسعار الحقيقي في المتاجر.</Text>
        </View>
      }
      renderItem={({ item: d }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`${d.product.titleAr} نزل ${pct(d.pct)}`} onPress={() => { tap(); router.push(`/item/${d.product.id}`); }}>
          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 }}>
            <Tile uri={shopifyThumb(d.product.image, 200)} size={64} label={d.product.titleAr} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[t.title, { color: c.ink }]} numberOfLines={2}>{d.product.titleAr || d.product.titleEn}</Text>
              <Text style={[t.meta, { color: c.muted }]}>{d.store.nameAr} · {ago(d.at)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                <Text style={[t.price, { color: c.palm }]}>{egp(d.new)}</Text>
                <Text style={[t.meta, { color: c.muted, textDecorationLine: 'line-through' }]}>{egp(d.old)}</Text>
                <Text style={[t.meta, { color: c.palm, fontWeight: '800' }]}>↓ {pct(d.pct)}</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={<StateMessage emoji="⏱️" title="مستنيين أول نزول سعر" body="أول ما سعر ينزل في أي متجر بنتابعه هيظهر هنا فورًا." />}
    />
  );
}
