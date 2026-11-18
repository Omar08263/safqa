import { normalizeEan, normalizeModel, normalizeTitle, tokensOf } from './normalize';

export interface MatchInput {
  title: string;
  brand?: string | null;
  model?: string | null;
  ean?: string | null;
}

export interface MatchResult {
  matched: boolean;
  method: 'ean' | 'model' | 'fuzzy' | 'none';
  score: number;
}

function dice(a: string, b: string): number {
  const left = a.replace(/\s/g, '');
  const right = b.replace(/\s/g, '');
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const have = counts.get(gram) ?? 0;
    if (have > 0) {
      overlap += 1;
      counts.set(gram, have - 1);
    }
  }
  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

function jaccard(a: string, b: string): number {
  const left = new Set(tokensOf(a));
  const right = new Set(tokensOf(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  return dice(left, right) * 0.55 + jaccard(left, right) * 0.45;
}

function canonicalBrand(brand: string): string {
  return tokensOf(normalizeTitle(brand))[0] ?? '';
}

/**
 * Cross-store identity.
 * EAN wins, then a normalized model within the same brand, then fuzzy title
 * similarity. Brand conflicts block fuzzy matches so a washer is not paired
 * with a fridge that happens to share a capacity token.
 */
export function matchProducts(a: MatchInput, b: MatchInput): MatchResult {
  if (a.ean && b.ean) {
    const left = normalizeEan(a.ean);
    const right = normalizeEan(b.ean);
    if (left.length >= 8 && left === right) {
      return { matched: true, method: 'ean', score: 1 };
    }
  }

  const brandA = a.brand ? canonicalBrand(a.brand) : '';
  const brandB = b.brand ? canonicalBrand(b.brand) : '';
  const brandsOk = brandA.length === 0 || brandB.length === 0 || brandA === brandB;

  if (a.model && b.model && brandsOk) {
    const left = normalizeModel(a.model);
    const right = normalizeModel(b.model);
    if (left.length >= 3 && left === right) {
      return { matched: true, method: 'model', score: 0.96 };
    }
  }

  const score = titleSimilarity(a.title, b.title);
  const threshold = brandsOk && brandA && brandB ? 0.62 : 0.8;
  if (score >= threshold && brandsOk) {
    return { matched: true, method: 'fuzzy', score };
  }
  return { matched: false, method: 'none', score };
}
