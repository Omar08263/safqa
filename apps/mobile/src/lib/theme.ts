import { useColorScheme } from 'react-native';
import { useSettings } from './store';

import { brand, type SectionId } from './brand';

// Colors come from packages/brand/tokens.json (generated into ./brand.ts) — same as the site and the Hub.
const core = (m: 'light' | 'dark') => {
  const k = brand.core[m];
  return { bg: k.bg, card: k.elev, ink: k.ink, muted: k.muted, line: k.line, chip: k.chip, primary: k.brand, palm: k.palm, clay: k.clay, onPrimary: '#1C1915', tile: k.tile } as const;
};
export const palette = { light: core('light'), dark: core('dark') };
export type Colors = { [K in keyof ReturnType<typeof core>]: string };

export function useMode(): 'light' | 'dark' {
  const system = useColorScheme();
  const { settings } = useSettings();
  const mode = settings.theme === 'system' ? (system ?? 'light') : settings.theme;
  return mode === 'dark' ? 'dark' : 'light';
}
/** Section accent (deals, radar, community, tools, plans, ai, coupons, account): gradient stops, ink on it, readable text. */
export function useAccent(section: SectionId = 'deals') {
  const s = brand.sections[section][useMode()];
  return { from: s.from, to: s.to, ink: s.ink, text: s.text, soft: `${s.from}24` };
}

export function useColors(): Colors {
  return palette[useMode()];
}

/** Type scale shared by every screen: 12 / 13 / 15 / 17 / 20 / 24 / 30. */
export const type = {
  meta: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 23 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700' as const },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
  price: { fontSize: 18, lineHeight: 24, fontWeight: '800' as const, fontVariant: ['tabular-nums' as const] },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '800' as const },
  h1: { fontSize: 26, lineHeight: 34, fontWeight: '800' as const },
};
export const radius = { sm: 12, md: 18, lg: 24, xl: 28 };
