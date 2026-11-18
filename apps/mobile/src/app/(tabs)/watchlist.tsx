import type { WatchItem } from '@safqa/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useMobileSession } from '../../lib/session';
import { Screen, useT } from '../../lib/ui';

export default function WatchlistScreen() {
  const { client, user } = useMobileSession();
  const { t, title, money } = useT();
  const router = useRouter();
  const [items, setItems] = useState<WatchItem[]>([]);

  const load = useCallback(() => {
    if (!user) return;
    void client.watchlist().then((result) => setItems(result.items));
  }, [client, user]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 12000);
    const stop = client.subscribe(() => load());
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [client, load]);

  if (!user) {
    return (
      <Screen>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={{ fontSize: 18 }}>{t('nav.login')}</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ marginBottom: 8, color: '#6e665b' }}>{t('watch.synced')}</Text>
      {items.length === 0 ? <Text>{t('watch.empty')}</Text> : null}
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => router.push(`/product/${item.product.id}`)} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '600' }}>{title(item.product)}</Text>
          <Text>{item.product.bestOffer ? money(item.product.bestOffer.priceEgp) : '—'}</Text>
          <Text style={{ color: '#6e665b' }}>
            {t('watch.target')}: {item.targetPriceEgp ?? '—'}
          </Text>
        </Pressable>
      ))}
    </Screen>
  );
}
