import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, FlameIcon, HomeIcon, MenuIcon, SearchIcon } from '../../components/icons';
import { tap } from '../../lib/feedback';
import { brand } from '../../lib/brand';
import { useColors, useMode } from '../../lib/theme';

export default function TabsLayout() {
  const c = useColors();
  const mode = useMode();
  // Each tab lights up in its own section hue (same tokens as the site).
  const tint = (s: keyof typeof brand.sections) => brand.sections[s][mode].text;
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
      <Tabs.Screen name="index" options={{ tabBarActiveTintColor: tint('deals'), title: 'الرئيسية', tabBarAccessibilityLabel: 'الرئيسية: أحسن العروض', tabBarIcon: ({ color }) => <HomeIcon color={String(color)} /> }} />
      <Tabs.Screen name="search" options={{ tabBarActiveTintColor: tint('deals'), title: 'بحث', tabBarAccessibilityLabel: 'دوّر على منتج', tabBarIcon: ({ color }) => <SearchIcon color={String(color)} /> }} />
      <Tabs.Screen name="hot" options={{ tabBarActiveTintColor: mode === 'dark' ? '#FB923C' : '#C2410C', title: 'السخن', tabBarAccessibilityLabel: 'الصفقات السخنة من كل المتاجر', tabBarIcon: ({ color }) => <FlameIcon color={String(color)} /> }} />
      <Tabs.Screen name="radar" options={{ href: null }} />
      <Tabs.Screen name="watchlist" options={{ tabBarActiveTintColor: tint('radar'), title: 'المراقبة', tabBarAccessibilityLabel: 'المنتجات اللي بتراقبها', tabBarIcon: ({ color }) => <BellIcon color={String(color)} /> }} />
      <Tabs.Screen name="more" options={{ tabBarActiveTintColor: tint('tools'), title: 'المزيد', tabBarAccessibilityLabel: 'أدوات وإعدادات', tabBarIcon: ({ color }) => <MenuIcon color={String(color)} /> }} />
    </Tabs>
  );
}
