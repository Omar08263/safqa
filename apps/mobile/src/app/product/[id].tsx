import type { PriceHistory, ProductDetail } from '@safqa/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useMobileSession } from '../../lib/session';
import { Screen, Spark, useT } from '../../lib/ui';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, user } = useMobileSession();
  const { t, title, money, locale } = useT();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [debate, setDebate] = useState<string | null>(null);
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (!id) return;
    void client.product(id).then(setProduct);
    void client.history(id).then(setHistory);
    void client.debate(id).then((result) => {
      setDebate(locale === 'ar' ? result.explanationAr : result.explanationEn);
    });
  }, [client, id, locale]);

  if (!product) {
    return (
      <Screen>
        <Text>{t('common.loading')}</Text>
      </Screen>
    );
  }

  const points = history?.series[0]?.points.map((point) => point.priceEgp) ?? [];

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>{title(product)}</Text>
      <Text style={{ fontSize: 28, marginVertical: 8 }}>
        {product.bestOffer ? money(product.bestOffer.priceEgp) : '—'}
      </Text>
      <Text>
        {t('deal.median30')}: {product.median30 ? money(product.median30) : '—'}
      </Text>
      <Text>
        {t('deal.min90')}: {product.min90 ? money(product.min90) : '—'}
      </Text>
      <Spark points={points} />
      {debate ? (
        <Text style={{ marginVertical: 8 }}>
          {t('debate.title')}: {debate}
        </Text>
      ) : null}
      <TextInput
        value={target}
        onChangeText={setTarget}
        placeholder={t('product.target')}
        keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: '#e4d8c6', borderRadius: 12, padding: 10, marginBottom: 8 }}
      />
      <Pressable
        onPress={() => {
          if (!user) {
            router.push('/login');
            return;
          }
          void client.addWatch(product.id, target ? Number(target) : null);
        }}
        style={{ backgroundColor: '#1c1915', borderRadius: 999, padding: 12, alignItems: 'center' }}
      >
        <Text style={{ color: '#f6f0e6' }}>{t('action.watch')}</Text>
      </Pressable>
      {product.offers.map((offer) => (
        <Text key={offer.id} style={{ marginTop: 10 }}>
          {locale === 'ar' ? offer.store.nameAr : offer.store.nameEn} · {money(offer.priceEgp)} · {offer.dealScore}
          {offer.fakeDiscount ? ` · ${t('deal.fake')}` : ''}
        </Text>
      ))}
    </Screen>
  );
}
