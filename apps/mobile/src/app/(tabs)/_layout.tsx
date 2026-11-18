import { Tabs } from 'expo-router';
import { useMobileSession } from '../../lib/session';
import { translate } from '@safqa/shared';

export default function TabsLayout() {
  const { locale } = useMobileSession();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#c9840a',
        tabBarStyle: { backgroundColor: '#fffaf3' },
        headerStyle: { backgroundColor: '#f3eee4' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.deals') }} />
      <Tabs.Screen name="search" options={{ title: t('nav.search') }} />
      <Tabs.Screen name="watchlist" options={{ title: t('nav.watchlist') }} />
      <Tabs.Screen name="alerts" options={{ title: t('nav.alerts') }} />
      <Tabs.Screen name="assistant" options={{ title: t('nav.assistant') }} />
    </Tabs>
  );
}
