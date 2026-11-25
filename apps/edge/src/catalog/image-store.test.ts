import { describe, expect, it } from 'vitest';
import { imageStore, MAX_SANE_PRICE } from './api';

describe('imageStore (whose photo is this?)', () => {
  it('maps Shopify shop file ids to stores', () => {
    expect(imageStore('https://cdn.shopify.com/s/files/1/0622/7050/5109/files/x.jpg?v=1')).toBe('compumarts');
    expect(imageStore('https://cdn.shopify.com/s/files/1/0554/5594/0776/products/y.jpg')).toBe('kimo');
    expect(imageStore('https://cdn.shopify.com/s/files/1/0647/8000/9538/files/z.webp')).toBe('tradeline');
  });
  it('maps store image hosts', () => {
    expect(imageStore('https://eg.jumia.is/unsafe/fit-in/500x500/a.jpg')).toBe('jumia');
    expect(imageStore('https://prod-fastly.rayashop.com/a.png')).toBe('raya');
    expect(imageStore('https://api.sigma-computer.com/a.png')).toBe('sigma');
    expect(imageStore('https://2b.com.eg/media/a.jpg')).toBe('2b');
  });
  it('is null when unknown', () => {
    expect(imageStore(null)).toBeNull();
    expect(imageStore('https://example.com/a.jpg')).toBeNull();
    expect(imageStore('not a url')).toBeNull();
  });
  it('rejects placeholder prices', () => expect(MAX_SANE_PRICE).toBe(1_000_000));
});
