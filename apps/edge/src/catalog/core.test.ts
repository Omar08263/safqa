import { describe, expect, it } from 'vitest';
import { canonicalUrl, categorize, condition, extractProduct, guessBrand, heat, matchKey, normQuery, parseSpecs, plausibleEgp, predict, productId } from './core';

describe('v5 catalog core', () => {
  it('normalises Arabic queries to brand tokens', () => {
    expect(normQuery('ايفون 15 برو')).toContain('iphone');
    expect(normQuery('سامسونج')).toContain('samsung');
  });
  it('parses storage / ram specs', () => {
    const s = parseSpecs('Samsung Galaxy S24 Ultra 12GB RAM 256GB Titanium');
    expect(s.storageGb).toBe(256);
    expect(s.ramGb).toBe(12);
  });
  it('matches the same model across stores and keeps different storage apart', () => {
    const a = matchKey({ title: 'Apple iPhone 15 Pro 256GB Natural Titanium' });
    const b = matchKey({ title: 'iPhone 15 Pro, 256 GB - Natural Titanium', brand: 'Apple' });
    const c = matchKey({ title: 'Apple iPhone 15 Pro 512GB Natural Titanium' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('prefers GTIN when present', () => {
    expect(matchKey({ title: 'x', gtin: '0194253401234' })).toBe(matchKey({ title: 'something else', gtin: '0194253401234' }));
  });
  it('detects condition and brand', () => {
    expect(condition('Used iPhone 13 128GB')).toBe('used');
    expect(condition('Refurbished MacBook Air')).toBe('refurbished');
    expect(condition('Galaxy A55')).toBe('new');
    expect(guessBrand('Galaxy A55 5G 8/256')).toBe('samsung');
  });
  it('categorises by rules', () => {
    expect(categorize('Lenovo IdeaPad Slim 3 Laptop i5')).toBe('laptops');
    expect(categorize('Sony PlayStation 5 Slim')).toBe('gaming');
    expect(categorize('Anker USB-C charger 20W')).toBe('accessories');
  });
  it('extracts JSON-LD products', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Xiaomi Redmi Note 13 8GB 256GB","brand":{"@type":"Brand","name":"Xiaomi"},"image":"https://x.test/a.jpg","gtin13":"6941812761234","offers":{"@type":"Offer","price":"10999.00","priceCurrency":"EGP","availability":"https://schema.org/InStock"}}</script></head></html>`;
    const p = extractProduct(html)!;
    expect(p.title).toContain('Redmi');
    expect(p.price).toBe(10999);
    expect(p.currency).toBe('EGP');
    expect(p.inStock).toBe(true);
  });
  it('filters implausible prices and canonicalises URLs', () => {
    expect(plausibleEgp(1, 'phones')).toBe(false);
    expect(plausibleEgp(15000, 'phones')).toBe(true);
    expect(canonicalUrl('https://Store.test/p/x?utm_source=a&variant=2#top')).not.toContain('utm_source');
  });
  it('stable product ids', async () => {
    expect(await productId('k')).toMatch(/^p[0-9a-f]{20}$/);
    expect(await productId('k')).toBe(await productId('k'));
  });
  it('heat grows with votes and drops', () => {
    expect(heat({ hot: 10, cold: 0 })).toBeGreaterThan(heat({ hot: 0, cold: 0 }));
    expect(heat({ hot: 0, cold: 0, dropPct: 20 })).toBeGreaterThan(heat({ hot: 0, cold: 0 }));
  });
  it('predicts honestly with little data', () => {
    expect(predict([], 1000).verdict).toBe('unknown');
    const pts = Array.from({ length: 40 }, (_, i) => ({ at: new Date(Date.now() - (40 - i) * 86400_000).toISOString(), price: 1200 }));
    expect(predict(pts, 950).verdict).toBe('buy');
  });
});

import { rowHeat } from './core';
describe('rowHeat', () => {
  it('weights price signals by money at stake, votes stay absolute', () => {
    const base = { hot: 0, cold: 0, dropPct: 10, vsMedian: 5 };
    expect(rowHeat({ ...base, price: 40000 })).toBeGreaterThan(rowHeat({ ...base, price: 300 }));
    expect(rowHeat({ hot: 5, cold: 0, price: 300 }) - rowHeat({ hot: 0, cold: 0, price: 300 })).toBe(60);
    expect(rowHeat({ hot: 0, cold: 9, price: 300 })).toBe(0);
  });
});
