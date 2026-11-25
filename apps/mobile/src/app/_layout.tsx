import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { I18nManager, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../components/toast';
import { SnapshotProvider } from '../lib/snapshot';
import { hydrate, setSyncErrorHandler, syncWatchlist, useSettings } from '../lib/store';
import { hydrateAuth } from '../lib/api';
import { useToast } from '../components/toast';
import { faces, useColors, useMode } from '../lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { flagOn, initRemote } from '../lib/remote';
import { initSfx } from '../lib/sfx';
import { startOta } from '../lib/ota';
import { fetchChangelog, WHATS_NEW_SEEN } from './whats-new';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const PLEX = {
  IBMPlexSansArabic: require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  'IBMPlexSansArabic-Medium': require('../../assets/fonts/IBMPlexSansArabic-Medium.ttf'),
  'IBMPlexSansArabic-SemiBold': require('../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf'),
  'IBMPlexSansArabic-Bold': require('../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts(PLEX);
  const { ready, settings } = useSettings();
  const c = useColors();
  const dark = useMode() === 'dark';

  useEffect(() => {
    if (!fontsLoaded) return;
    const style = { fontFamily: faces.regular };
    const patch = (C: typeof Text | typeof TextInput) => {
      const Comp = C as typeof Text & { defaultProps?: { style?: unknown } };
      Comp.defaultProps = { ...Comp.defaultProps, style: [style, Comp.defaultProps?.style] };
    };
    patch(Text);
    patch(TextInput);
  }, [fontsLoaded]);

  useEffect(() => {
    void initSfx();
    void initRemote();
    void hydrate().then(async () => {
      await hydrateAuth();
      await syncWatchlist();
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.productId;
      if (typeof id === 'string') router.push(`/product/${id}`);
    });
    const stopOta = startOta();
    return () => { sub.remove(); stopOta(); };
  }, []);

  useEffect(() => {
    if (!ready || !fontsLoaded) return;
    void SplashScreen.hideAsync().catch(() => undefined);
    if (!settings.onboarded) router.replace('/onboarding');
    // «الجديد في صفقة»: once per release (new users get the onboarding instead and see the next one).
    void (async () => {
      const [cl, seen] = await Promise.all([fetchChangelog(), AsyncStorage.getItem(WHATS_NEW_SEEN)]);
      if (!cl?.latest || seen === cl.latest) return;
      if (!settings.onboarded) { await AsyncStorage.setItem(WHATS_NEW_SEEN, cl.latest); return; }
      if (flagOn('whats_new', true)) setTimeout(() => router.push('/whats-new'), 900);
    })();
  }, [ready, fontsLoaded, settings.onboarded]);

  return (
    <SafeAreaProvider>
      <SnapshotProvider>
        <ToastProvider>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <SyncErrors />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerTintColor: c.ink,
              headerTitleStyle: { fontFamily: faces.bold },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: c.bg },
              animation: 'slide_from_left',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="whats-new" options={{ headerShown: false, animation: 'fade_from_bottom', presentation: 'fullScreenModal' }} />
            <Stack.Screen name="product/[id]" options={{ title: 'تفاصيل المنتج' }} />
            <Stack.Screen name="item/[id]" options={{ title: 'المنتج' }} />
            <Stack.Screen name="drops" options={{ title: 'نزول الأسعار مباشر' }} />
            <Stack.Screen name="add" options={{ title: 'الصق رابط منتج' }} />
            <Stack.Screen name="tools" options={{ title: 'أدوات الشراء الذكي' }} />
            <Stack.Screen name="settings" options={{ title: 'الإعدادات' }} />
            <Stack.Screen name="account" options={{ title: 'حسابي وباقتي' }} />
          </Stack>
        </ToastProvider>
      </SnapshotProvider>
    </SafeAreaProvider>
  );
}

/** Shows server-side refusals (e.g. tier limit) as a toast with a path to the plans. */
function SyncErrors() {
  const toast = useToast();
  useEffect(() => {
    setSyncErrorHandler((msg) => toast({ text: msg, action: { label: 'الباقات', onPress: () => router.push('/account') } }));
    return () => setSyncErrorHandler(null);
  }, [toast]);
  return null;
}
