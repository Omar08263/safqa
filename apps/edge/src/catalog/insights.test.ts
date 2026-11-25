import { describe, expect, it } from 'vitest';
import { dealDna, fakeDiscount, optimizeBasket, priceWars, seasonAdvice } from './insights';
import { scoreForUser } from './smart';

const m = (daysAgo: number) => Math.floor((Date.now() - daysAgo * 86400_000) / 60000);
describe('deal intelligence', () => {
  it('Deal DNA rewards a real low and cross-store savings, explains each factor', () => {
    const dna = dealDna({ price: 900, hot: 3, cold: 0, checkedAt: new Date().toISOString(), offers: [
      { s: 'a', p: 900, l: null, k: 1, h: [[m(20), 1100], [m(10), 1050], [m(1), 900]] },
      { s: 'b', p: 1000, l: null, k: 1, h: [[m(5), 1000]] },
    ] });
    expect(dna.score).toBeGreaterThan(70);
    expect(dna.factors.map((f) => f.key)).toEqual(expect.arrayContaining(['median', 'low', 'stores', 'votes', 'fresh']));
  });
  it('flags an inflated "was" price and a pump-then-sale', () => {
    expect(fakeDiscount({ s: 'a', p: 1000, l: 2000, k: 1, h: [[m(30), 1050], [m(2), 1000]] }).kind).toBe('inflated_was');
    expect(fakeDiscount({ s: 'a', p: 1000, l: 1300, k: 1, h: [[m(20), 1000], [m(10), 1300], [m(1), 1000]] }).kind).toBe('pump_then_sale');
    expect(fakeDiscount({ s: 'a', p: 900, l: 1000, k: 1, h: [[m(20), 1000], [m(1), 900]] }).flag).toBe(false);
  });
  it('detects price wars', () => {
    const d = (s: string) => ({ product_id: 'p1', store: s, at: new Date().toISOString(), new: 1 });
    expect(priceWars([d('a'), d('b'), d('a'), d('b')]).length).toBe(1);
    expect(priceWars([d('a'), d('a'), d('a')]).length).toBe(0);
  });
  it('optimises a basket including delivery fees', () => {
    const r = optimizeBasket([
      { id: 'x', offers: [{ s: 'a', p: 100, k: 1 }, { s: 'b', p: 90, k: 1 }] },
      { id: 'y', offers: [{ s: 'a', p: 200, k: 1 }, { s: 'b', p: 230, k: 1 }] },
    ], () => 50);
    expect(r.best!.stores).toEqual(['a']); // 300+50 beats split 90+200+100
    expect(r.best!.total).toBe(350);
  });
  it('season advice and interest scoring', () => {
    expect(seasonAdvice(Date.parse('2026-11-25T10:00:00Z')).active?.id).toBe('white-friday');
    const viewed = scoreForUser({ viewed: [['p1', 1200, '']] }, { id: 'p1', price: 1000, pct: 10 });
    const cold = scoreForUser({}, { id: 'p2', price: 1000, pct: 10 });
    expect(viewed.score).toBeGreaterThan(cold.score + 50);
  });
});
