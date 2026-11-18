import type { NormalizedOffer } from './types';

interface JsonRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  const record = asRecord(value);
  if (!record) return undefined;
  return textOf(record.name) ?? textOf(record['@value']);
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function typeNames(node: JsonRecord): string[] {
  return asArray(node['@type']).flatMap((entry) => {
    const text = textOf(entry);
    return text ? [text.toLowerCase()] : [];
  });
}

function isType(node: JsonRecord, name: string): boolean {
  return typeNames(node).some((entry) => entry === name.toLowerCase() || entry.endsWith(`/${name.toLowerCase()}`));
}

function collectNodes(value: unknown, into: JsonRecord[]): void {
  const record = asRecord(value);
  if (record) {
    into.push(record);
    for (const child of asArray(record['@graph'])) collectNodes(child, into);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectNodes(child, into);
  }
}

function extractScripts(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // A broken block on an otherwise useful page is ignored.
    }
  }
  return blocks;
}

function availabilityInStock(value: unknown): boolean {
  const text = textOf(value) ?? '';
  if (/outofstock|soldout|discontinued/i.test(text)) return false;
  if (/instock|preorder|limitedavailability|onlineonly/i.test(text)) return true;
  return true;
}

function readPrice(offer: JsonRecord): { price: number; list?: number; currency?: string } | null {
  const specs = asArray(offer.priceSpecification)
    .map(asRecord)
    .filter((item): item is JsonRecord => item != null);
  let sale: number | null = null;
  let list: number | null = null;
  let currency = textOf(offer.priceCurrency);
  for (const spec of specs) {
    const price = numberOf(spec.price);
    const kind = `${textOf(spec.priceType) ?? ''} ${textOf(spec['@type']) ?? ''}`.toLowerCase();
    currency = currency ?? textOf(spec.priceCurrency);
    if (price == null) continue;
    if (kind.includes('listprice') || kind.includes('srp')) list = price;
    else sale = price;
  }
  const direct = numberOf(offer.price) ?? numberOf(offer.lowPrice) ?? sale;
  const high = numberOf(offer.highPrice);
  if (direct == null) return null;
  if (list == null && high != null && high > direct) list = high;
  if (list != null && list <= direct) list = null;
  return { price: direct, list: list ?? undefined, currency };
}

function imageOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageOf(value[0]);
  return textOf(asRecord(value)?.url) ?? textOf(asRecord(value)?.contentUrl);
}

/**
 * Default parser for schema.org Product / ProductGroup JSON-LD.
 * Store adapters call this first. Prices are accepted as EGP when the
 * currency is EGP or omitted (Egyptian storefronts). Other currencies are
 * skipped rather than mislabeled.
 */
export function parseJsonLdOffer(html: string, pageUrl: string): Omit<NormalizedOffer, 'store'> | null {
  const nodes: JsonRecord[] = [];
  for (const block of extractScripts(html)) collectNodes(block, nodes);
  const product = nodes.find((node) => isType(node, 'Product') || isType(node, 'ProductGroup'));
  if (!product) return null;
  const title = textOf(product.name);
  if (!title) return null;

  const offerNodes = asArray(product.offers)
    .map(asRecord)
    .filter((item): item is JsonRecord => item != null);
  const offer =
    offerNodes.find((node) => isType(node, 'Offer') || node.price != null || node.lowPrice != null) ??
    offerNodes[0];
  if (!offer) return null;
  const priced = readPrice(offer);
  if (!priced) return null;
  if (priced.currency && priced.currency.toUpperCase() !== 'EGP') return null;

  const ean =
    textOf(product.gtin13) ??
    textOf(product.gtin14) ??
    textOf(product.gtin12) ??
    textOf(product.gtin8) ??
    textOf(product.gtin);
  const ratingNode = asRecord(product.aggregateRating);
  const rating = numberOf(ratingNode?.ratingValue);
  const conditionText = `${textOf(offer.itemCondition) ?? ''} ${textOf(product.itemCondition) ?? ''}`;
  const condition = /used|refurbished/i.test(conditionText) ? 'used' : 'new';

  return {
    url: textOf(offer.url) ?? pageUrl,
    title,
    brand: textOf(product.brand),
    model: textOf(product.mpn) ?? textOf(product.model) ?? textOf(product.sku),
    ean,
    priceEGP: priced.price,
    listPriceEGP: priced.list,
    inStock: availabilityInStock(offer.availability),
    image: imageOf(product.image),
    rating: rating ?? undefined,
    condition,
  };
}
