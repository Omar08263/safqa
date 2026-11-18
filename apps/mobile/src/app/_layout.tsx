import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../lib/session';

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#f3eee4' }, headerTintColor: '#1c1915' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: 'صفقة' }} />
        <Stack.Screen name="login" options={{ title: 'دخول' }} />
      </Stack>
    </SessionProvider>
  );
}
