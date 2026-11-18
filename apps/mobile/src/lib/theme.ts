import { useColorScheme } from 'react-native';
import { useSettings } from './store';

export const palette = {
  light: { bg: '#F3EEE4', card: '#FFFAF3', ink: '#1C1915', muted: '#6E665B', line: '#E4D8C6', chip: '#EFE4D2', primary: '#C9840A', palm: '#0E6B52', clay: '#B8432F', onPrimary: '#1C1915', tile: '#FFFFFF' },
  dark: { bg: '#12110E', card: '#1C1915', ink: '#F6F0E6', muted: '#B7AB9C', line: '#322C25', chip: '#2A251E', primary: '#F0B429', palm: '#3DBE9A', clay: '#F07167', onPrimary: '#1C1915', tile: '#F7F5F1' },
};
export type Colors = typeof palette.light;

export function useColors(): Colors {
  const system = useColorScheme();
  const { settings } = useSettings();
  const mode = settings.theme === 'system' ? (system ?? 'light') : settings.theme;
  return mode === 'dark' ? palette.dark : palette.light;
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
