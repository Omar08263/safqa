// Sources for the v5 catalog. Every source is either a public feed the store publishes
// (Shopify storefront /products.json) or sitemap + schema.org JSON-LD on a store whose
// robots.txt allows it. Stores that answer bots with 403/429 (Dubai Phone, HyperOne) or
// time out (Carrefour, Noon) are not crawled; Amazon/Noon come through official/affiliate APIs.
export interface StoreSrc {
  id: string; nameAr: string; nameEn: string; domain: string; base: string;
  kind: 'shopify' | 'sitemap';
  /** Why this store is not crawled (e.g. it refuses our honestly-identified bot). Explicit --stores still runs it. */
  disabled?: string;
  sitemaps?: string[];
  /** Product URL test for sitemap stores. */
  product?: RegExp;
  /** Big marketplaces: only take product URLs whose slug mentions an electronics brand/term. */
  focus?: boolean;
  /** Max product pages fetched per run (sitemap stores). */
  budget?: number;
  note?: string;
}

export const STORES: StoreSrc[] = [
  { id: 'kimo', nameAr: 'كيمو ستور', nameEn: 'Kimo Store', domain: 'kimostore.net', base: 'https://kimostore.net', kind: 'shopify' },
  { id: 'compumarts', nameAr: 'كمبيومارتس', nameEn: 'Compumarts', domain: 'compumarts.com', base: 'https://www.compumarts.com', kind: 'shopify' },
  { id: 'tradeline', nameAr: 'تريدلاين', nameEn: 'Tradeline', domain: 'tradelinestores.com', base: 'https://tradelinestores.com', kind: 'shopify' },
  { id: 'btech', nameAr: 'بي.تك', nameEn: 'B.TECH', domain: 'btech.com', base: 'https://btech.com', kind: 'sitemap', sitemaps: ['https://btech.com/sitemap.xml'], product: /\/p\/[^/]+$/, budget: 900 },
  { id: '2b', nameAr: 'تو بي', nameEn: '2B', domain: '2b.com.eg', base: 'https://2b.com.eg', kind: 'sitemap', sitemaps: ['https://2b.com.eg/en_sitemap.xml'], product: /\/en\/[a-z0-9-]*\d[a-z0-9-]*(\.html)?$/, budget: 700 },
  { id: 'raya', nameAr: 'راية شوب', nameEn: 'Raya Shop', domain: 'rayashop.com', base: 'https://www.rayashop.com', kind: 'sitemap', sitemaps: ['https://www.rayashop.com/en-sitemap.xml'], product: /\/en\/(?=[^/]*\d)[a-z0-9]+(?:-[a-z0-9]+){4,}$/, budget: 700 },
  { id: 'elaraby', nameAr: 'العربي جروب', nameEn: 'El Araby', domain: 'elarabygroup.com', base: 'https://www.elarabygroup.com', kind: 'sitemap', disabled: 'answers HTTP 404 to every request from SafqaBot (Nov 2026) — not evading', sitemaps: ['https://www.elarabygroup.com/pub/media/sitemap/en.xml'], product: /\/en\/(?=[^/]*\d)[a-z0-9-]{12,}(\.html)?$/, budget: 600 },
  { id: 'sigma', nameAr: 'سيجما كمبيوتر', nameEn: 'Sigma Computer', domain: 'sigma-computer.com', base: 'https://sigma-computer.com', kind: 'sitemap', sitemaps: ['https://sigma-computer.com/en/item/sitemap.xml'], product: /\/en\/item\?id=/, budget: 600 },
  { id: 'elbadr', nameAr: 'البدر جروب', nameEn: 'El Badr Group', domain: 'elbadrgroupeg.store', base: 'https://elbadrgroupeg.store', kind: 'sitemap', sitemaps: ['https://elbadrgroupeg.store/sitemap-product-1.xml', 'https://elbadrgroupeg.store/sitemap-product-2.xml', 'https://elbadrgroupeg.store/sitemap-product-3.xml', 'https://elbadrgroupeg.store/sitemap-product-4.xml', 'https://elbadrgroupeg.store/sitemap-product-5.xml'], product: /./, budget: 500 },
  { id: 'jumia', nameAr: 'جوميا', nameEn: 'Jumia Egypt', domain: 'jumia.com.eg', base: 'https://www.jumia.com.eg', kind: 'sitemap', sitemaps: ['https://static.jumia.com.eg/products-sitemap-1.xml.gz', 'https://static.jumia.com.eg/products-sitemap-2.xml.gz', 'https://static.jumia.com.eg/products-sitemap-3.xml.gz'], product: /-\d+\.html$/, focus: true, budget: 700 },
];

export const FOCUS = /(samsung|apple|iphone|ipad|xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|infinix|tecno|nokia|lenovo|dell|hp-|asus|acer|msi|sony|playstation|xbox|nintendo|lg-|toshiba|sharp|tornado|fresh|beko|zanussi|anker|jbl|philips|braun|tp-link|logitech|kenwood|moulinex|tefal|black-decker|panasonic|tcl|hisense|laptop|smart-watch|earbuds|headphone|power-bank|router|monitor|tv|air-fryer|blender|washing|refrigerator|vacuum)/;
