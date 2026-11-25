import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from '../lib/theme';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function Root() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }} />
    </SafeAreaProvider>
  );
}
