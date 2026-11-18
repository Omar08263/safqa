import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DealRow, Screen } from '../../lib/ui';
import { useMobileSession } from '../../lib/session';
import type { ProductCard } from '@safqa/shared';

export default function DealsScreen() {
  const { client } = useMobileSession();
  const router = useRouter();
  const [items, setItems] = useState<ProductCard[]>([]);
  const [suspicious, setSuspicious] = useState<ProductCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    client
      .deals()
      .then((data) => {
        if (cancel) return;
        setItems(data.items);
        setSuspicious(data.suspicious);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : 'error');
      });
    return () => {
      cancel = true;
    };
  }, [client]);

  return (
    <Screen>
      <Text style={{ fontSize: 28, fontWeight: '700', marginBottom: 12 }}>صفقة</Text>
      {error ? <Text>{error}</Text> : null}
      {items.map((product) => (
        <DealRow key={product.id} product={product} onPress={() => router.push(`/product/${product.id}`)} />
      ))}
      {suspicious.length > 0 ? (
        <Text style={{ marginVertical: 8, fontWeight: '600' }}>خصومات شكلها مضخّم</Text>
      ) : null}
      {suspicious.map((product) => (
        <DealRow
          key={`${product.id}-${product.bestOffer?.id}`}
          product={product}
          onPress={() => router.push(`/product/${product.id}`)}
        />
      ))}
    </Screen>
  );
}
