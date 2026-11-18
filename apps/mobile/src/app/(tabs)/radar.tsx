import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Header } from '../../components/screen';
import { Card, Chip, DealCard, StateMessage } from '../../components/ui';
import { useGrid } from '../../lib/layout';
import { useSnapshot } from '../../lib/snapshot';
import { type as t, useColors } from '../../lib/theme';

type Mode = 'real' | 'fake' | 'multi';

export default function Radar() {
  const c = useColors();
  const { data } = useSnapshot();
  const { columns, gutter } = useGrid();
  const [mode, setMode] = useState<Mode>('real');
  const list = useMemo(() => {
    const all = data?.snap.all ?? [];
    if (mode === 'fake') return all.filter((p) => p.bestOffer?.fakeDiscount);
    if (mode === 'multi') return all.filter((p) => p.offerCount > 1).sort((a, b) => b.offerCount - a.offerCount);
    return all.filter((p) => p.bestOffer && !p.bestOffer.fakeDiscount && p.bestOffer.dealScore >= 70).sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0));
  }, [data, mode]);
  const blurb: Record<Mode, string> = {
    real: 'خصومات حقيقية: السعر أقل فعلاً من وسيط آخر 30 يوم أو أرخص من باقي المتاجر.',
    fake: 'السعر «قبل الخصم» اتنفخ قبلها بأيام أو مش مكتوب أصلاً. ما تتخدعش.',
    multi: 'منتجات موجودة في أكتر من متجر، قارن واختار الأرخص.',
  };
  return (
    <FlatList
      key={`r-${columns}`}
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32 }}
      data={list}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      columnWrapperStyle={{ gap: 12 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 12 }}>
          <Header title="رادار الخصومات 📡" subtitle="بنفرز الحقيقي من الوهمي" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="✅ حقيقية" active={mode === 'real'} onPress={() => setMode('real')} />
            <Chip label="⚠️ وهمية" active={mode === 'fake'} onPress={() => setMode('fake')} />
            <Chip label="🏪 في أكتر من متجر" active={mode === 'multi'} onPress={() => setMode('multi')} />
          </View>
          <Card style={{ padding: 12 }}><Text style={[t.small, { color: c.ink }]}>{blurb[mode]}</Text></Card>
        </View>
      }
      renderItem={({ item }) => (data ? <View style={{ flex: 1 / columns }}><DealCard p={item} snap={data.snap} /></View> : null)}
      ListEmptyComponent={
        <StateMessage
          emoji={mode === 'fake' ? '🕵️' : '🌙'}
          title={mode === 'fake' ? 'مفيش خصومات وهمية النهارده' : 'الرادار هادي دلوقتي'}
          body={mode === 'fake' ? 'المتاجر محترمة النهارده 😄 هنفضل نراقب.' : 'مع كل تحديث للأسعار هيظهر هنا الجديد.'}
        />
      }
    />
  );
}
