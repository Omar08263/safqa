import { Locale, MessageKey, translate } from '@safqa/shared';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

interface Prefs {
  locale: Locale;
  theme: 'light' | 'dark';
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
  t: (key: MessageKey) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    window.localStorage.getItem('safqa.locale') === 'en' ? 'en' : 'ar',
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.localStorage.getItem('safqa.theme') === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    window.localStorage.setItem('safqa.locale', locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('safqa.theme', theme);
  }, [theme]);

  const value = useMemo<Prefs>(
    () => ({
      locale,
      theme,
      setLocale: setLocaleState,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      t: (key) => translate(locale, key),
    }),
    [locale, theme],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('PrefsProvider missing');
  return value;
}
