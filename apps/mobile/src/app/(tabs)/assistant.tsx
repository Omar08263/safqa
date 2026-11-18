import type { ProductCard } from '@safqa/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useMobileSession } from '../../lib/session';
import { DealRow, Screen, useT } from '../../lib/ui';

export default function AssistantScreen() {
  const { client } = useMobileSession();
  const { t } = useT();
  const router = useRouter();
  const [text, setText] = useState('لاقيلي أرخص سماعة نويز كانسلنج تحت 15000');
  const [reply, setReply] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductCard[]>([]);

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{t('nav.assistant')}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('chat.placeholder')}
        style={{ borderWidth: 1, borderColor: '#e4d8c6', borderRadius: 12, padding: 10, backgroundColor: '#fffaf3' }}
      />
      <Pressable
        onPress={() => {
          void client.chat(text).then((result) => {
            setReply(result.reply);
            setProducts(result.products);
          });
        }}
        style={{ marginTop: 8, backgroundColor: '#c9840a', borderRadius: 999, padding: 12, alignItems: 'center' }}
      >
        <Text style={{ fontWeight: '700' }}>{t('chat.send')}</Text>
      </Pressable>
      {reply ? <Text style={{ marginVertical: 12, lineHeight: 22 }}>{reply}</Text> : null}
      {products.map((product) => (
        <DealRow key={product.id} product={product} onPress={() => router.push(`/product/${product.id}`)} />
      ))}
    </Screen>
  );
}
