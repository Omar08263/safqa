import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { adapterBySlug, adapters } from './registry';
import { parseJsonLdOffer } from './jsonld';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), 'utf8');
}

describe('parseJsonLdOffer', () => {
  it('reads a Product node, sale price, list price, and GTIN', () => {
    const offer = parseJsonLdOffer(fixture('noon-iphone.html'), 'https://www.noon.com/egypt-ar/iphone-16');
    expect(offer).toMatchObject({
      title: 'Apple iPhone 16 128GB Black',
      brand: 'Apple',
      ean: '6221000000018',
      priceEGP: 54999,
      listPriceEGP: 61999,
      inStock: true,
      rating: 4.7,
    });
  });

  it('walks @graph and marks an out-of-stock offer', () => {
    const offer = parseJsonLdOffer(fixture('jumia-washer.html'), 'https://www.jumia.com.eg/washer');
    expect(offer).toMatchObject({
      title: 'Tornado غسالة 10 كجم',
      priceEGP: 18999,
      inStock: false,
      ean: '6221000000032',
    });
  });

  it('ignores a non-EGP currency instead of mislabeling it', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Import","offers":{"@type":"Offer","price":"10","priceCurrency":"USD"}}
    </script>`;
    expect(parseJsonLdOffer(html, 'https://example.com/p')).toBeNull();
  });

  it('returns null when the page has no structured product', () => {
    expect(parseJsonLdOffer(fixture('btech-empty.html'), 'https://btech.com/p')).toBeNull();
  });

  it('skips a broken JSON block and still reads a later one', () => {
    const html = `<script type="application/ld+json">{not json}</script>
      <script type="application/ld+json">{"@type":"Product","name":"Anker 737","offers":{"price":"5299","priceCurrency":"EGP"}}</script>`;
    expect(parseJsonLdOffer(html, 'https://www.noon.com/p')?.priceEGP).toBe(5299);
  });
});

describe('store adapters', () => {
  it('registers ten Egyptian storefronts and stamps the store slug', () => {
    expect(adapters).toHaveLength(10);
    const parsed = adapterBySlug('noon')?.parse(
      fixture('noon-iphone.html'),
      'https://www.noon.com/egypt-ar/iphone-16',
    );
    expect(parsed?.store).toBe('noon');
  });

  it('marks stubs and still lets them parse JSON-LD when a site adds it', () => {
    const stubs = adapters.filter((adapter) => adapter.status === 'stub').map((adapter) => adapter.slug);
    expect(stubs).toEqual(['btech', '2b', 'raya', 'elaraby', 'hyperone', 'dubizzle']);
    expect(adapterBySlug('btech')?.parse(fixture('btech-empty.html'), 'https://btech.com/p')).toBeNull();
    const recovered = adapterBySlug('btech')?.parse(
      fixture('noon-iphone.html'),
      'https://btech.com/iphone',
    );
    expect(recovered?.store).toBe('btech');
    expect(recovered?.priceEGP).toBe(54999);
  });

  it('keeps Amazon on the Creators API seam', () => {
    expect(adapterBySlug('amazon-eg')?.officialApi).toMatch(/Creators API/);
    expect(adapterBySlug('amazon-eg')?.status).toBe('best-effort');
  });
});
