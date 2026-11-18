/** Arabic-aware text normalisation for offline matching (search, Q&A, moderation). */
export function normalizeAr(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s.%]/gu, ' ')
    .replace(/(.)\1{2,}/g, '$1$1') // "حلووووو" -> "حلوو"
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasAny(text: string, words: string[]): boolean {
  const t = ` ${normalizeAr(text)} `;
  return words.some((w) => t.includes(normalizeAr(w)));
}

/** Deterministic 32-bit hash for seeded "random" choices (same input -> same output). */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function pick<T>(list: readonly T[], seed: string | number): T {
  const n = typeof seed === 'number' ? seed : hash32(seed);
  return list[n % list.length] as T;
}
