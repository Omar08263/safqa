import { useColorScheme } from 'react-native';
import { useSettings } from './store';

import { brand, type SectionId } from './brand';

// Colors come from packages/brand/tokens.json (generated into ./brand.ts) — same as the site and the Hub.
const core = (m: 'light' | 'dark') => {
  const k = brand.core[m];
  return { bg: k.bg, card: k.elev, ink: k.ink, muted: k.muted, line: k.line, chip: k.chip, primary: k.brand, palm: k.palm, clay: k.clay, onPrimary: '#1C1915', tile: k.tile } as const;
};
const white = { bg: '#FFFFFF', card: '#F7F7F8', ink: '#161513', muted: '#5F5A54', line: '#E8E4DE', chip: '#F3F0EA', primary: '#C9840A', palm: '#0E6B52', clay: '#B8432F', onPrimary: '#1C1915', tile: '#FFFFFF' } as const;
const navy = { bg: '#0B1220', card: '#111A2E', ink: '#E7ECF6', muted: '#93A1BD', line: '#22304F', chip: '#16213A', primary: '#F0B429', palm: '#3DBE9A', clay: '#F07167', onPrimary: '#1C1915', tile: '#F3F6FB' } as const;
export const palette = { light: core('light'), white, dark: core('dark'), navy };
export type Skin = keyof typeof palette;
export type Colors = { [K in keyof ReturnType<typeof core>]: string };

export const faces = {
  regular: 'IBMPlexSansArabic',
  medium: 'IBMPlexSansArabic-Medium',
  semibold: 'IBMPlexSansArabic-SemiBold',
  bold: 'IBMPlexSansArabic-Bold',
} as const;

export function useSkin(): Skin {
  const system = useColorScheme();
  const { settings } = useSettings();
  const t = settings.theme;
  if (t === 'white' || t === 'navy' || t === 'dark' || t === 'light') return t;
  return system === 'dark' ? 'dark' : 'light';
}

export function useMode(): 'light' | 'dark' {
  const skin = useSkin();
  return skin === 'dark' || skin === 'navy' ? 'dark' : 'light';
}
/** Section accent (deals, radar, community, tools, plans, ai, coupons, account): gradient stops, ink on it, readable text. */
export function useAccent(section: SectionId = 'deals') {
  const s = brand.sections[section][useMode()];
  return { from: s.from, to: s.to, ink: s.ink, text: s.text, soft: `${s.from}24` };
}

export function useColors(): Colors {
  return palette[useSkin()];
}

/** Type scale shared by every screen: 12 / 13 / 15 / 17 / 20 / 24 / 30. */
export const type = {
  meta: { fontSize: 12, lineHeight: 16, fontFamily: faces.regular },
  small: { fontSize: 13, lineHeight: 18, fontFamily: faces.regular },
  body: { fontSize: 15, lineHeight: 23, fontFamily: faces.regular },
  title: { fontSize: 15, lineHeight: 20, fontFamily: faces.bold },
  h3: { fontSize: 17, lineHeight: 24, fontFamily: faces.bold },
  price: { fontSize: 18, lineHeight: 24, fontFamily: faces.bold, fontVariant: ['tabular-nums' as const] },
  h2: { fontSize: 20, lineHeight: 28, fontFamily: faces.bold },
  h1: { fontSize: 26, lineHeight: 34, fontFamily: faces.bold },
};
export const radius = { sm: 12, md: 18, lg: 24, xl: 28 };
