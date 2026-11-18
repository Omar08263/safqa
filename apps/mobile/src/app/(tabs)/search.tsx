import type { ProductCard } from '@safqa/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { useMobileSession } from '../../lib/session';
import { DealRow, Screen, useT } from '../../lib/ui';

export default function SearchScreen() {
  const { client } = useMobileSession();
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState<ProductCard[]>([]);

  return (
    <Screen>
      <TextInput
        placeholder={t('search.placeholder')}
        placeholderTextColor="#6e665b"
        style={{
          backgroundColor: '#fffaf3',
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: '#e4d8c6',
        }}
        onSubmitEditing={(event) => {
          void client.search({ q: event.nativeEvent.text, hideFake: false }).then((result) => setItems(result.items));
        }}
      />
      {items.map((product) => (
        <DealRow key={product.id} product={product} onPress={() => router.push(`/product/${product.id}`)} />
      ))}
    </Screen>
  );
}
