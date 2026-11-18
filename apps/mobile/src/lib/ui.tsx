import { formatEGP, localized, translate, type ProductCard } from '@safqa/shared';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMobileSession } from './session';

export function useT() {
  const { locale } = useMobileSession();
  return {
    locale,
    t: (key: Parameters<typeof translate>[1]) => translate(locale, key),
    title: (item: { titleAr: string; titleEn: string }) => localized(locale, { ar: item.titleAr, en: item.titleEn }),
    money: (value: number) => formatEGP(value, locale),
  };
}

export function Screen({ children }: { children: ReactNode }) {
  const { locale } = useMobileSession();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ direction: locale === 'ar' ? 'rtl' : 'ltr' }}>{children}</View>
    </ScrollView>
  );
}

export function DealRow({ product, onPress }: { product: ProductCard; onPress: () => void }) {
  const { title, money, t, locale } = useT();
  const offer = product.bestOffer;
  if (!offer) return null;
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {localized(locale, { ar: offer.store.nameAr, en: offer.store.nameEn })}
          </Text>
          <Text style={styles.title}>{title(product)}</Text>
          <Text style={styles.price}>{money(offer.priceEgp)}</Text>
          {offer.fakeDiscount ? <Text style={styles.warn}>{t('deal.fake')}</Text> : null}
        </View>
        <View style={[styles.score, { borderColor: offer.dealScore >= 80 ? '#0e6b52' : '#c9840a' }]}>
          <Text style={styles.scoreText}>{offer.dealScore}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function Spark({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  return (
    <View style={styles.spark}>
      {points.map((point, index) => (
        <View
          key={`${index}-${point}`}
          style={[styles.bar, { height: 8 + ((point - min) / span) * 72 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3eee4' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fffaf3',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e4d8c6',
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  kicker: { color: '#6e665b', fontSize: 12 },
  title: { color: '#1c1915', fontSize: 16, fontWeight: '600', marginTop: 2 },
  price: { color: '#1c1915', fontSize: 18, marginTop: 6, fontVariant: ['tabular-nums'] },
  warn: { color: '#b8432f', marginTop: 4, fontSize: 12 },
  score: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontWeight: '700', color: '#1c1915' },
  spark: { height: 88, flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginVertical: 12 },
  bar: { width: 6, backgroundColor: '#c9840a', borderRadius: 3 },
});
