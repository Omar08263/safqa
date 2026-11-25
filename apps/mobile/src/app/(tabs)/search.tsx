import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Header } from '../../components/screen';
import { Chip, DealCard, StateMessage } from '../../components/ui';
import { V5Card } from '../../components/v5';
import { usePaged, v5, type V5Card as V5Item } from '../../lib/v5';
import { useGrid } from '../../lib/layout';
import { searchProducts } from '../../lib/search';
import { useSnapshot } from '../../lib/snapshot';
import { radius, type as t, useColors } from '../../lib/theme';

const SUGGEST = ['آيفون', 'سامسونج', 'سماعة', 'لابتوب', 'تكييف', 'غسالة', 'شاومي', 'ساعة'];
const RECENT_KEY = 'safqa.recent.v1';
type Sort = 'match' | 'cheap' | 'deal';

export default function Search() {
  const c = useColors();
  const { data } = useSnapshot();
  const { columns, gutter } = useGrid();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('match');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    void AsyncStorage.getItem(RECENT_KEY).then((r) => r && setRecent(JSON.parse(r)));
  }, []);
  const remember = (term: string) => {
    const v = term.trim();
    if (!v) return;
    const next = [v, ...recent.filter((x) => x !== v)].slice(0, 6);
    setRecent(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };
  // Server search over the full v5 catalog (thousands of products, typo-tolerant, Arabic ⇄ English),
  // debounced; the bundled snapshot search is the offline fallback.
  const [dq, setDq] = useState('');
  useEffect(() => { const h = setTimeout(() => setDq(q.trim()), 250); return () => clearTimeout(h); }, [q]);
  const serverSort = sort === 'cheap' ? 'price' : sort === 'deal' ? 'heat' : 'relevance';
  const server = usePaged((page) => (dq.length >= 2 ? v5.search(dq, page, serverSort) : Promise.resolve({ items: [], page: 0, more: false, total: 0, fuzzy: false })), [dq, serverSort]);
  const online = dq.length >= 2 && !server.error;
  const results = useMemo(() => {
    const r = data ? searchProducts(data.snap.all, q) : [];
    if (sort === 'cheap') return [...r].sort((a, b) => (a.bestOffer?.priceEgp ?? 1e12) - (b.bestOffer?.priceEgp ?? 1e12));
    if (sort === 'deal') return [...r].sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0));
    return r;
  }, [data, q, sort]);

  return (
    <FlatList
      key={`s-${columns}`}
      style={{ backgroundColor: c.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: gutter, paddingBottom: 32 }}
      data={(online ? server.items : results) as (V5Item | (typeof results)[number])[]}
      numColumns={columns}
      keyExtractor={(p) => p.id}
      onEndReached={online ? server.next : undefined}
      onEndReachedThreshold={0.6}
      columnWrapperStyle={{ gap: 12 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 12 }}>
          <Header title="دوّر على أي حاجة" subtitle="بالعربي أو بالإنجليزي، اسم أو ماركة أو موديل" />
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => remember(q)}
              placeholder="مثلاً: آيفون 16، سماعة سوني، تكييف…"
              placeholderTextColor={c.muted}
              returnKeyType="search"
              accessibilityLabel="خانة البحث"
              style={[t.body, { flex: 1, color: c.ink, minHeight: 52, textAlign: 'right' }]}
            />
            {q ? (
              <Pressable accessibilityRole="button" accessibilityLabel="امسح البحث" hitSlop={12} onPress={() => setQ('')}>
                <Text style={{ fontSize: 18, color: c.muted }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {q ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[t.small, { color: c.muted }]}>{online ? `${server.total ?? server.items.length} نتيجة من كل المتاجر` : `${results.length} نتيجة`} · رتّب:</Text>
              <Chip label="الأقرب" active={sort === 'match'} onPress={() => setSort('match')} />
              <Chip label="الأرخص" active={sort === 'cheap'} onPress={() => setSort('cheap')} />
              <Chip label="أحسن صفقة" active={sort === 'deal'} onPress={() => setSort('deal')} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {recent.length ? (
                <>
                  <Text style={[t.small, { color: c.muted }]}>دوّرت قبل كده على:</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {recent.map((r) => <Chip key={r} label={`🕘 ${r}`} onPress={() => setQ(r)} />)}
                  </View>
                </>
              ) : null}
              <Text style={[t.small, { color: c.muted }]}>اقتراحات سريعة:</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SUGGEST.map((s) => <Chip key={s} label={s} onPress={() => { setQ(s); remember(s); }} />)}
              </View>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (online ? <View style={{ flex: 1 / columns }}><V5Card p={item as V5Item} /></View> : data ? <View style={{ flex: 1 / columns }}><DealCard p={item as (typeof results)[number]} snap={data.snap} /></View> : null)}
      ListFooterComponent={online && server.fuzzy && server.items.length ? <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 12 }]}>ملقيناش تطابق حرفي، دي أقرب نتايج (بنستحمل الأخطاء الإملائية)</Text> : undefined}
      ListEmptyComponent={
        online && server.loading ? <StateMessage emoji="⏳" title="بندوّر في كل المتاجر…" /> : q ? <StateMessage emoji="🔍" title={`مفيش نتايج لـ «${q}»`} body="جرّب كلمة أقصر أو اسم الماركة بس. لو المنتج مش عندنا لسه، هنضيفه قريب." /> : undefined
      }
    />
  );
}
