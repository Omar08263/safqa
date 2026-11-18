import { createHtmlAdapter } from './html-adapter';
import { createAmazonCreatorsProvider } from './providers/amazon-creators';
import type { SiteAdapter } from './types';

const amazon = createAmazonCreatorsProvider();

/**
 * Status is honest:
 * - best-effort: JSON-LD is the parser, and these storefronts often publish it,
 *   but live fetches are frequently blocked. We do not work around that.
 * - stub: no verified selectors. JSON-LD is still attempted so a site that adds
 *   schema.org Product starts working without a new parser.
 */
export const adapters: SiteAdapter[] = [
  createHtmlAdapter({
    slug: 'amazon-eg',
    domains: ['amazon.eg'],
    displayName: { ar: 'أمازون مصر', en: 'Amazon.eg' },
    status: 'best-effort',
    minIntervalMs: 8000,
    officialApi: 'Amazon Creators API',
    provider: amazon,
    notes:
      'Best-effort JSON-LD only. Bot checks are treated as a stop. Prefer the Amazon Creators API (see providers/amazon-creators.ts) once partner credentials exist.',
  }),
  createHtmlAdapter({
    slug: 'noon',
    domains: ['noon.com'],
    displayName: { ar: 'نون', en: 'Noon' },
    status: 'best-effort',
    notes:
      'Best-effort JSON-LD for noon.com Egypt listings. No private Noon catalog API is called. A partner feed can replace fetchAndParse later.',
  }),
  createHtmlAdapter({
    slug: 'jumia',
    domains: ['jumia.com.eg'],
    displayName: { ar: 'جوميا', en: 'Jumia Egypt' },
    status: 'best-effort',
    notes: 'Best-effort JSON-LD. Jumia pages often include schema.org Product; when they do not, the adapter returns null.',
  }),
  createHtmlAdapter({
    slug: 'carrefour',
    domains: ['carrefour.com.eg'],
    displayName: { ar: 'كارفور', en: 'Carrefour Egypt' },
    status: 'best-effort',
    notes: 'Best-effort JSON-LD. No store-specific selectors and no attempt to read client-only state.',
  }),
  createHtmlAdapter({
    slug: 'btech',
    domains: ['btech.com'],
    displayName: { ar: 'بي.تك', en: 'B.TECH' },
    status: 'stub',
    notes:
      'Stub. Public pages are not known to expose stable schema.org Product. JSON-LD is attempted and otherwise the offer is skipped.',
  }),
  createHtmlAdapter({
    slug: '2b',
    domains: ['2b.com.eg'],
    displayName: { ar: 'تو بي', en: '2B' },
    status: 'stub',
    notes: 'Stub. No verified selectors. JSON-LD is the only parse path.',
  }),
  createHtmlAdapter({
    slug: 'raya',
    domains: ['raya.com'],
    displayName: { ar: 'راية', en: 'Raya' },
    status: 'stub',
    notes: 'Stub. Domain is the public Raya storefront and may need a narrower host when the adapter is promoted.',
  }),
  createHtmlAdapter({
    slug: 'elaraby',
    domains: ['elarabygroup.com'],
    displayName: { ar: 'العربي', en: 'Elaraby' },
    status: 'stub',
    notes: 'Stub. El Araby storefront host should be confirmed before a maintained adapter. JSON-LD only.',
  }),
  createHtmlAdapter({
    slug: 'hyperone',
    domains: ['hyperone.com.eg'],
    displayName: { ar: 'هايبر وان', en: 'Hyper One' },
    status: 'stub',
    notes: 'Stub. No verified selectors. JSON-LD is attempted.',
  }),
  createHtmlAdapter({
    slug: 'dubizzle',
    domains: ['dubizzle.com.eg'],
    displayName: { ar: 'دوبيزل', en: 'Dubizzle' },
    status: 'stub',
    notes:
      'Stub for classifieds. A listing is not a retail offer: keep condition=used when JSON-LD says so, and do not treat it as the best new price.',
  }),
];

export function adapterForUrl(url: string): SiteAdapter | null {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
  return (
    adapters.find((adapter) =>
      adapter.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
    ) ?? null
  );
}

export function adapterBySlug(slug: string): SiteAdapter | null {
  return adapters.find((adapter) => adapter.slug === slug) ?? null;
}
