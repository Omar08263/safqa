import { describe, expect, it } from 'vitest';
import { matchProducts, titleSimilarity } from './matcher';
import { normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  it('folds Arabic variants, Eastern digits, and commerce words into the same space as English', () => {
    expect(normalizeTitle('أبل آيفون ١٦ ١٢٨ جيجا أسود')).toBe('apple iphone 16 128 gb black');
    expect(normalizeTitle('Apple iPhone 16 128GB Black')).toBe('apple iphone 16 128 gb black');
  });
});

describe('matchProducts', () => {
  it('matches on EAN even when the titles differ', () => {
    const result = matchProducts(
      { title: 'Galaxy A56', ean: '6221-0000-0002-5' },
      { title: 'جالاكسي', ean: '6221000000025' },
    );
    expect(result).toMatchObject({ matched: true, method: 'ean', score: 1 });
  });

  it('matches an Arabic listing to an English one by model and brand', () => {
    const result = matchProducts(
      { title: 'Apple iPhone 16 128GB Black', brand: 'Apple', model: 'iPhone 16' },
      { title: 'أبل آيفون ١٦ ١٢٨ جيجا أسود', brand: 'أبل', model: 'آيفون 16' },
    );
    expect(result.matched).toBe(true);
    expect(result.method).toBe('model');
  });

  it('fuzzy-matches close bilingual titles when the model field is absent', () => {
    const result = matchProducts(
      { title: 'Sony WH-1000XM5 headphones black', brand: 'Sony' },
      { title: 'سوني سماعات WH-1000XM5 أسود', brand: 'سوني' },
    );
    expect(result.matched).toBe(true);
    expect(result.method).toBe('fuzzy');
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('does not match different appliances that share only a number', () => {
    const result = matchProducts(
      { title: 'Tornado washer 10 kg', brand: 'Tornado', model: 'TW-10' },
      { title: 'Fresh refrigerator 450 L', brand: 'Fresh', model: 'F-450' },
    );
    expect(result.matched).toBe(false);
    expect(titleSimilarity('غسالة تورنيدو', 'ثلاجة فريش')).toBeLessThan(0.8);
  });
});
