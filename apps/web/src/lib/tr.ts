import { useCallback } from 'react';
import { usePrefs } from './prefs';

/** Inline bilingual strings for the new feature pages: tr('عربي', 'English'). */
export function useTr() {
  const { locale } = usePrefs();
  return useCallback((ar: string, en: string) => (locale === 'ar' ? ar : en), [locale]);
}
