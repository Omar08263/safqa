import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, HomeIcon, MenuIcon, RadarIcon, SearchIcon } from '../../components/icons';
import { tap } from '../../lib/feedback';
import { useColors } from '../../lib/theme';

export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.palm,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarLabelPosition: tablet ? 'beside-icon' : 'below-icon',
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, height: 60 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية', tabBarAccessibilityLabel: 'الرئيسية: أحسن العروض', tabBarIcon: ({ color }) => <HomeIcon color={String(color)} /> }} />
      <Tabs.Screen name="search" options={{ title: 'بحث', tabBarAccessibilityLabel: 'دوّر على منتج', tabBarIcon: ({ color }) => <SearchIcon color={String(color)} /> }} />
      <Tabs.Screen name="radar" options={{ title: 'الرادار', tabBarAccessibilityLabel: 'رادار الخصومات الحقيقية والوهمية', tabBarIcon: ({ color }) => <RadarIcon color={String(color)} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: 'المراقبة', tabBarAccessibilityLabel: 'المنتجات اللي بتراقبها', tabBarIcon: ({ color }) => <BellIcon color={String(color)} /> }} />
      <Tabs.Screen name="more" options={{ title: 'المزيد', tabBarAccessibilityLabel: 'أدوات وإعدادات', tabBarIcon: ({ color }) => <MenuIcon color={String(color)} /> }} />
    </Tabs>
  );
}
