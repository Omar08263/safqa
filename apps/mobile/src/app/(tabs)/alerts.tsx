import type { AlertItem } from '@safqa/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useMobileSession } from '../../lib/session';
import { Screen, useT } from '../../lib/ui';

export default function AlertsScreen() {
  const { client, user, registerPush } = useMobileSession();
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void client.alerts().then((result) => setItems(result.items));
  }, [client, user]);

  if (!user) {
    return (
      <Screen>
        <Pressable onPress={() => router.push('/login')}>
          <Text>{t('nav.login')}</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable
        onPress={() => {
          void registerPush().then((token) => setNote(token ?? t('alerts.expoHint')));
        }}
      >
        <Text style={{ fontWeight: '700', marginBottom: 8 }}>{t('alerts.expo')}</Text>
      </Pressable>
      {note ? <Text style={{ marginBottom: 8 }}>{note}</Text> : null}
      {items.length === 0 ? <Text>{t('alerts.empty')}</Text> : null}
      {items.map((alert) => (
        <Text key={alert.id} style={{ marginBottom: 10 }}>
          {alert.title}
          {'\n'}
          {alert.body}
        </Text>
      ))}
    </Screen>
  );
}
