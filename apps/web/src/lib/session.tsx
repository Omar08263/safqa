import { createSafqaClient, type SafqaClient } from '@safqa/api-client';
import type { User } from '@safqa/shared';
import { accessTtl, cachedUser, onTokens, refreshAccess, saveTokens, startSilentRefresh, USER } from './auth-tokens';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface SessionValue {
  user: User | null;
  ready: boolean;
  client: SafqaClient;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  acceptTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Authenticated JSON call for endpoints the typed client does not cover. */
  raw: <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;
  setUser: (user: User) => void;
}

export class RawError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const SessionContext = createContext<SessionValue | null>(null);

const baseUrl = import.meta.env.VITE_API_URL || '';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<string | null>(() => window.localStorage.getItem('safqa.access'));
  const [refresh, setRefresh] = useState<string | null>(() => window.localStorage.getItem('safqa.refresh'));
  // Signed-in UI shows instantly (and offline) from the last known profile.
  const [user, setUserState] = useState<User | null>(() => cachedUser<User>());
  const [ready, setReady] = useState(false);
  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) window.localStorage.setItem(USER, JSON.stringify(u));
  }, []);

  const store = useCallback((nextAccess: string | null, nextRefresh: string | null) => {
    saveTokens(nextAccess, nextRefresh);
  }, []);

  // Keep React state in sync with the token store (refresh, other tabs, sign-out elsewhere).
  useEffect(
    () =>
      onTokens(() => {
        const a = window.localStorage.getItem('safqa.access');
        const r = window.localStorage.getItem('safqa.refresh');
        setAccess(a);
        setRefresh(r);
        if (!a && !r) setUserState(null);
      }),
    [],
  );
  useEffect(() => startSilentRefresh(), []);

  const client = useMemo(
    () =>
      createSafqaClient({
        baseUrl,
        getAccessToken: () => window.localStorage.getItem('safqa.access'),
        refresh: refreshAccess,
      }),
    [],
  );

  useEffect(() => {
    let cancel = false;
    if (!access && !refresh) {
      setUserState(null);
      setReady(true);
      return;
    }
    const ttl = accessTtl();
    // Expired (or missing) access token: refresh first instead of collecting a 401.
    const ready$ = refresh && (ttl === null ? !access : ttl < 60) ? refreshAccess() : Promise.resolve(null);
    ready$
      .then(() => client.me())
      .then((me) => {
        if (!cancel) setUser(me);
      })
      .catch(() => {
        // Never sign out on a network/server hiccup: only a rejected refresh token
        // (handled in auth-tokens) ends the session. Keep the cached profile.
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, [access, refresh, client, setUser]);

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
      async raw<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
        const call = (token: string | null) =>
          fetch(baseUrl + path, {
            method,
            headers: {
              ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          });
        let res = await call(window.localStorage.getItem('safqa.access'));
        if (res.status === 401 && window.localStorage.getItem('safqa.refresh')) {
          const next = await refreshAccess();
          if (next) res = await call(next);
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new RawError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText);
        return data as T;
      },
      setUser,
      async logout() {
        if (refresh) await client.logout(refresh).catch(() => undefined);
        store(null, null);
        setUser(null);
      },
    }),
    [client, ready, refresh, setUser, store, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider missing');
  return value;
}
