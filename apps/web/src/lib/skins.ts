/** Font + palette ids. Keep in sync with public/appearance.js. */
export const FONT_KEY = 'safqa.font';
export const SKIN_KEY = 'safqa.skin';

export type FontId = 'plex' | 'cairo' | 'tajawal' | 'kufi' | 'readex' | 'system';
export type SkinId = 'sand' | 'white' | 'dark' | 'navy';

export const FONTS: Record<FontId, { ar: string; en: string; family: string; lazy?: string }> = {
  plex: { ar: 'خط صفقة (IBM Plex Sans Arabic)', en: 'Safqa font (IBM Plex Sans Arabic)', family: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif' },
  cairo: { ar: 'القاهرة (Cairo)', en: 'Cairo', family: '"Cairo", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/cairo.css' },
  tajawal: { ar: 'تجوّال (Tajawal)', en: 'Tajawal', family: '"Tajawal", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/tajawal.css' },
  kufi: { ar: 'كوفي (Noto Kufi Arabic)', en: 'Noto Kufi Arabic', family: '"Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/kufi.css' },
  readex: { ar: 'ريدكس (Readex Pro)', en: 'Readex Pro', family: '"Readex Pro", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/readex.css' },
  system: { ar: 'الافتراضي للنظام', en: 'System default', family: 'system-ui, "Segoe UI", Tahoma, sans-serif' },
};

export const SKINS: Record<SkinId, { ar: string; en: string; dark: boolean; swatch: string; icon: string }> = {
  sand: { ar: 'رملي (صفقة)', en: 'Sand (Safqa)', dark: false, swatch: '#F3EEE4', icon: '🏜️' },
  white: { ar: 'أبيض', en: 'White', dark: false, swatch: '#FFFFFF', icon: '🤍' },
  dark: { ar: 'داكن', en: 'Dark', dark: true, swatch: '#12110E', icon: '🌙' },
  navy: { ar: 'ليلي كحلي', en: 'Navy night', dark: true, swatch: '#0B1220', icon: '🌌' },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const SKIN_IDS = Object.keys(SKINS) as SkinId[];

export const PREVIEW = 'Aa أفضل سعر 6,500 ج.م';

export function isFontId(v: string | null | undefined): v is FontId {
  return !!v && v in FONTS;
}
export function isSkinId(v: string | null | undefined): v is SkinId {
  return !!v && v in SKINS;
}

export function readFont(): FontId {
  try {
    const v = window.localStorage.getItem(FONT_KEY);
    return isFontId(v) ? v : 'plex';
  } catch {
    return 'plex';
  }
}

export function readSkin(): SkinId {
  try {
    const v = window.localStorage.getItem(SKIN_KEY);
    if (isSkinId(v)) return v;
    return window.localStorage.getItem('safqa.theme') === 'dark' ? 'dark' : 'sand';
  } catch {
    return 'sand';
  }
}

export function loadFont(id: FontId) {
  const href = FONTS[id].lazy;
  if (!href || document.querySelector(`link[data-safqa-font="${id}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.dataset.safqaFont = id;
  document.head.appendChild(l);
}

export function applyAppearance(skin: SkinId, font: FontId) {
  const root = document.documentElement;
  root.dataset.theme = skin;
  root.dataset.font = font;
  root.classList.toggle('dark', SKINS[skin].dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', SKINS[skin].swatch);
  loadFont(font);
}
