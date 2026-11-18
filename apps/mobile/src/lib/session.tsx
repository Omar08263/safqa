import { createSafqaClient, type SafqaClient } from '@safqa/api-client';
import type { Locale, User } from '@safqa/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:8787';

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string | null) {
  if (Platform.OS === 'web') {
    if (value) globalThis.localStorage?.setItem(key, value);
    else globalThis.localStorage?.removeItem(key);
    return;
  }
  if (value) await SecureStore.setItemAsync(key, value);
  else await SecureStore.deleteItemAsync(key);
}

interface MobileSession {
  ready: boolean;
  user: User | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  client: SafqaClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  registerPush: () => Promise<string | null>;
}

const SessionContext = createContext<MobileSession | null>(null);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocaleState] = useState<Locale>('ar');
  const [ready, setReady] = useState(false);

  const client = useMemo(
    () =>
      createSafqaClient({
        baseUrl: API_URL,
        getAccessToken: () => access,
      }),
    [access],
  );

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const [storedAccess, storedLocale] = await Promise.all([read('safqa.access'), read('safqa.locale')]);
      if (cancel) return;
      if (storedLocale === 'en' || storedLocale === 'ar') setLocaleState(storedLocale);
      setAccess(storedAccess);
      if (storedAccess) {
        try {
          const me = await createSafqaClient({
            baseUrl: API_URL,
            getAccessToken: () => storedAccess,
          }).me();
          if (!cancel) setUser(me);
        } catch {
          await write('safqa.access', null);
          if (!cancel) setAccess(null);
        }
      }
      if (!cancel) setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const value = useMemo<MobileSession>(
    () => ({
      ready,
      user,
      locale,
      client,
      setLocale(next) {
        setLocaleState(next);
        void write('safqa.locale', next);
      },
      async login(email, password) {
        const result = await client.login({ email, password });
        await write('safqa.access', result.accessToken);
        await write('safqa.refresh', result.refreshToken);
        setAccess(result.accessToken);
        setUser(result.user);
      },
      async logout() {
        await write('safqa.access', null);
        await write('safqa.refresh', null);
        setAccess(null);
        setUser(null);
      },
      async registerPush() {
        if (!Device.isDevice) return null;
        const current = await Notifications.getPermissionsAsync();
        const granted =
          current.granted || (await Notifications.requestPermissionsAsync()).granted;
        if (!granted) return null;
        try {
          const token = await Notifications.getExpoPushTokenAsync();
          await client.saveExpoPush(token.data);
          return token.data;
        } catch {
          return null;
        }
      },
    }),
    [client, locale, ready, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useMobileSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
