const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
const INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Longest phrases first. Keys are already Arabic-normalized (no diacritics, ة→ه, أ→ا). */
const PHRASES: Array<[string, string]> = [
  ['جيجابايت', 'gb'],
  ['بلايستيشن', 'playstation'],
  ['سامسونج', 'samsung'],
  ['جالاكسي', 'galaxy'],
  ['تورنيدو', 'tornado'],
  ['سماعات', 'headphones'],
  ['ايفون', 'iphone'],
  ['شاومي', 'xiaomi'],
  ['ريدمي', 'redmi'],
  ['لابتوب', 'laptop'],
  ['ثلاجه', 'refrigerator'],
  ['غساله', 'washer'],
  ['اديداس', 'adidas'],
  ['فريش', 'fresh'],
  ['اسود', 'black'],
  ['ابيض', 'white'],
  ['ازرق', 'blue'],
  ['سوني', 'sony'],
  ['انكر', 'anker'],
  ['جيجا', 'gb'],
  ['ابل', 'apple'],
  ['بوش', 'bosch'],
];

function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const indic = INDIC_DIGITS.indexOf(char);
    if (indic >= 0) return String(indic);
    const persian = PERSIAN_DIGITS.indexOf(char);
    return persian >= 0 ? String(persian) : char;
  });
}

function foldArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/**
 * Arabic + English product-title normalization.
 * Folds Arabic letter variants and Eastern digits, then maps a small commerce
 * glossary so "آيفون ١٦" and "iPhone 16" land in the same token space.
 */
export function normalizeTitle(input: string): string {
  let text = foldArabic(toAsciiDigits(input)).toLowerCase();
  for (const [from, to] of PHRASES) {
    text = text.replaceAll(from, ` ${to} `);
  }
  text = text
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .replace(/(\d+)\s*(gb|tb|kg|ml|l)\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function normalizeModel(input: string): string {
  return normalizeTitle(input).replace(/\s+/g, '');
}

export function normalizeEan(input: string): string {
  return input.replace(/\D/g, '');
}

export function tokensOf(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token.length > 0);
}
