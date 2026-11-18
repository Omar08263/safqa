import { createSafqaClient, type SafqaClient } from '@safqa/api-client';
import type { User } from '@safqa/shared';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface SessionValue {
  user: User | null;
  ready: boolean;
  client: SafqaClient;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  acceptTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const baseUrl = import.meta.env.VITE_API_URL || '';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<string | null>(() => window.localStorage.getItem('safqa.access'));
  const [refresh, setRefresh] = useState<string | null>(() => window.localStorage.getItem('safqa.refresh'));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const store = useCallback((nextAccess: string | null, nextRefresh: string | null) => {
    setAccess(nextAccess);
    setRefresh(nextRefresh);
    if (nextAccess) window.localStorage.setItem('safqa.access', nextAccess);
    else window.localStorage.removeItem('safqa.access');
    if (nextRefresh) window.localStorage.setItem('safqa.refresh', nextRefresh);
    else window.localStorage.removeItem('safqa.refresh');
  }, []);

  const client = useMemo(
    () =>
      createSafqaClient({
        baseUrl,
        getAccessToken: () => window.localStorage.getItem('safqa.access'),
        refresh: async () => {
          const token = window.localStorage.getItem('safqa.refresh');
          if (!token) return null;
          const anonymous = createSafqaClient({ baseUrl, getAccessToken: () => null });
          try {
            const next = await anonymous.refresh(token);
            store(next.accessToken, next.refreshToken);
            setUser(next.user);
            return next.accessToken;
          } catch {
            store(null, null);
            setUser(null);
            return null;
          }
        },
      }),
    [store],
  );

  useEffect(() => {
    let cancel = false;
    if (!access) {
      setUser(null);
      setReady(true);
      return;
    }
    client
      .me()
      .then((me) => {
        if (!cancel) setUser(me);
      })
      .catch(() => {
        if (!cancel) store(null, null);
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [access, client, store]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      client,
      async login(email, password) {
        const result = await client.login({ email, password });
        store(result.accessToken, result.refreshToken);
        setUser(result.user);
      },
      async register(name, email, password) {
        const result = await client.register({ name, email, password });
        store(result.accessToken, result.refreshToken);
        setUser(result.user);
      },
      async acceptTokens(accessToken, refreshToken) {
        store(accessToken, refreshToken);
        const me = await createSafqaClient({ baseUrl, getAccessToken: () => accessToken }).me();
        setUser(me);
      },
      async logout() {
        if (refresh) await client.logout(refresh).catch(() => undefined);
        store(null, null);
        setUser(null);
      },
    }),
    [client, ready, refresh, store, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
