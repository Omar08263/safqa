import { useEffect } from 'react';
import { useLocal } from './local';
import { usePrefs } from './prefs';

export interface Appearance {
  accent: 'saffron' | 'palm' | 'violet' | 'ocean' | 'rose';
  fontScale: number; // 0.9 – 1.3
  contrast: boolean;
  reduceMotion: boolean;
  readable: boolean; // wider letter/line spacing
  density: 'comfortable' | 'compact';
  followSystem: boolean;
  underlineLinks: boolean;
}
export const defaultAppearance: Appearance = {
  accent: 'saffron',
  fontScale: 1,
  contrast: false,
  reduceMotion: false,
  readable: false,
  density: 'comfortable',
  followSystem: false,
  underlineLinks: false,
};
export const accents: Record<Appearance['accent'], { light: string; dark: string; ar: string; en: string }> = {
  saffron: { light: '#c9840a', dark: '#f0b429', ar: 'زعفراني', en: 'Saffron' },
  palm: { light: '#0e6b52', dark: '#3dbe9a', ar: 'نخلة', en: 'Palm' },
  violet: { light: '#6d4ad8', dark: '#a78bfa', ar: 'بنفسجي', en: 'Violet' },
  ocean: { light: '#1f6fb2', dark: '#5fb0f5', ar: 'محيط', en: 'Ocean' },
  rose: { light: '#c2346b', dark: '#f472b6', ar: 'وردي', en: 'Rose' },
};

export function useAppearance() {
  return useLocal<Appearance>('safqa.appearance.v1', defaultAppearance);
}

/** Applies appearance settings to <html>. Mount once. */
export function AppearanceEffect() {
  const [a] = useAppearance();
  const { theme, setTheme } = usePrefs();
  useEffect(() => {
    const root = document.documentElement;
    const accent = accents[a.accent] ?? accents.saffron;
    root.style.setProperty('--saffron', theme === 'dark' ? accent.dark : accent.light);
    root.style.fontSize = `${Math.round(16 * a.fontScale)}px`;
    root.classList.toggle('hc', a.contrast);
    root.classList.toggle('calm', a.reduceMotion);
    root.classList.toggle('readable', a.readable);
    root.classList.toggle('compact', a.density === 'compact');
    root.classList.toggle('ul-links', a.underlineLinks);
  }, [a, theme]);
  useEffect(() => {
    if (!a.followSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setTheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [a.followSystem, setTheme]);
  return null;
}

export function prefersCalm(): boolean {
  return (
    document.documentElement.classList.contains('calm') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
