import { Locale, MessageKey, translate } from '@safqa/shared';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { applyAppearance, FONTS, FONT_KEY, isFontId, isSkinId, readFont, readSkin, SKIN_KEY, SKINS, type FontId, type SkinId } from './skins';

interface Prefs {
  locale: Locale;
  theme: 'light' | 'dark';
  skin: SkinId;
  font: FontId;
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSkin: (skin: SkinId) => void;
  setFont: (font: FontId) => void;
  t: (key: MessageKey) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

function lastOfMode(mode: 'light' | 'dark', fallback: SkinId): SkinId {
  try {
    const k = mode === 'dark' ? 'safqa.skin.dark' : 'safqa.skin.light';
    const v = window.localStorage.getItem(k);
    if (isSkinId(v) && SKINS[v].dark === (mode === 'dark')) return v;
  } catch {}
  return fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    window.localStorage.getItem('safqa.locale') === 'en' ? 'en' : 'ar',
  );
  const [skin, setSkinState] = useState<SkinId>(readSkin);
  const [font, setFontState] = useState<FontId>(readFont);
  const theme: 'light' | 'dark' = SKINS[skin].dark ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    window.localStorage.setItem('safqa.locale', locale);
  }, [locale]);

  useEffect(() => {
    applyAppearance(skin, font);
    try {
      window.localStorage.setItem(SKIN_KEY, skin);
      window.localStorage.setItem('safqa.theme', theme);
      window.localStorage.setItem(skin && SKINS[skin].dark ? 'safqa.skin.dark' : 'safqa.skin.light', skin);
      window.localStorage.setItem(FONT_KEY, font);
    } catch {}
  }, [skin, font, theme]);

  const setSkin = (id: SkinId) => setSkinState(isSkinId(id) ? id : 'sand');
  const setFont = (id: FontId) => {
    if (!isFontId(id)) id = 'plex';
    const href = FONTS[id].lazy;
    if (href && typeof window.SafqaAppearance?.loadFont === 'function') window.SafqaAppearance.loadFont(id);
    setFontState(id);
  };
  const setTheme = (next: 'light' | 'dark') => {
    setSkin(lastOfMode(next, next === 'dark' ? 'dark' : 'sand'));
  };

  const value = useMemo<Prefs>(
    () => ({
      locale,
      theme,
      skin,
      font,
      setLocale: setLocaleState,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      setTheme,
      setSkin,
      setFont,
      t: (key) => translate(locale, key),
    }),
    [locale, theme, skin, font],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('PrefsProvider missing');
  return value;
}

declare global {
  interface Window {
    SafqaAppearance?: { loadFont: (id: string) => void };
  }
}
