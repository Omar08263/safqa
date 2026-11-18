import type { Product } from './data';

/** Arabic-aware normalisation: alef/yaa/taa-marbuta forms, diacritics, digits. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchProducts(all: Product[], q: string): Product[] {
  const terms = norm(q).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return all
    .map((p) => {
      const hay = norm(`${p.titleAr} ${p.titleEn} ${p.brand} ${p.model} ${p.category?.nameAr ?? ''} ${p.category?.nameEn ?? ''}`);
      const hits = terms.filter((x) => hay.includes(x)).length;
      return { p, score: hits === terms.length ? hits * 10 + (p.bestOffer?.dealScore ?? 0) / 100 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
