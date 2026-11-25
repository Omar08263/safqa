// 🪧 Share cards + Google rich results for product pages (Pages Function).
// WhatsApp/Facebook/X/Telegram/Google don't run our JS, so for /p/:id we rewrite
// the static index.html <head> with the real product title, photo and price, and add
// schema.org Product/AggregateOffer JSON-LD. The SPA itself is unchanged.
// Read-only: uses /api/v6/card/:id (edge-cached, never triggers recrawls or D1 writes).
// Idea from prerender (MIT) — but no headless browser: just HTMLRewriter.
interface Env { ASSETS: { fetch: (r: Request | string) => Promise<Response> } }
interface Card { found: boolean; id: string; title: string; titleEn: string; brand?: string | null; image?: string | null; price: number; listPrice?: number | null; low?: number | null; inStock: boolean; checkedAt?: string; offers: { store: string; storeAr: string; price: number; inStock: boolean; url: string }[] }
const API = 'https://safqa-api.safqaeg.workers.dev';
const SITE = 'https://safqaeg.pages.dev';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const egp = (n: number) => `${Math.round(n).toLocaleString('en-US')} ج.م`;

async function seoOn(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/api/v2/config`, { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
    const c = (await r.json()) as { flags?: Record<string, { on: boolean }> };
    return c.flags?.sys_seo?.on !== false;
  } catch { return true; }
}

export const onRequestGet = async (ctx: { request: Request; env: Env; params: { id: string } }) => {
  const url = new URL(ctx.request.url);
  const page = await ctx.env.ASSETS.fetch(new Request(new URL('/', url).toString(), { headers: ctx.request.headers }));
  const id = String(ctx.params.id || '');
  if (!/^p[0-9a-f]{20}$/.test(id) || !page.headers.get('content-type')?.includes('text/html')) return page;
  let card: Card | null = null;
  try {
    const [on, r] = await Promise.all([seoOn(), fetch(`${API}/api/v6/card/${id}`, { cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit)]);
    if (on && r.ok) card = (await r.json()) as Card;
  } catch { /* fall back to the plain shell */ }
  if (!card?.found) return page;
  const canonical = `${SITE}/p/${id}`;
  const title = `${card.title} بـ ${egp(card.price)} — صفقة`;
  const stores = [...new Set(card.offers.map((o) => o.storeAr))];
  const disc = card.listPrice && card.listPrice > card.price ? ` (خصم ${Math.round(((card.listPrice - card.price) / card.listPrice) * 100)}%)` : '';
  const desc = `${card.inStock ? 'أقل سعر دلوقتي' : 'آخر سعر (خلصان دلوقتي)'} ${egp(card.price)}${disc} في ${stores.slice(0, 3).join('، ') || 'متاجر مصر'}${card.low && card.low < card.price ? ` · أقل سعر شفناه ${egp(card.low)}` : ''}. تاريخ السعر الحقيقي وتنبيه لما ينزل.`;
  const prices = card.offers.filter((o) => o.inStock).map((o) => o.price);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: card.titleEn || card.title, image: card.image ? [card.image] : undefined, url: canonical,
    brand: card.brand ? { '@type': 'Brand', name: card.brand } : undefined,
    offers: card.offers.length > 1
      ? { '@type': 'AggregateOffer', priceCurrency: 'EGP', lowPrice: Math.min(...(prices.length ? prices : [card.price])), highPrice: Math.max(...(prices.length ? prices : [card.price])), offerCount: card.offers.length, availability: card.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' }
      : { '@type': 'Offer', priceCurrency: 'EGP', price: card.price, availability: card.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: card.offers[0]?.url ?? canonical },
  };
  const set = (sel: string, v: string) => ({ sel, h: { element(e: Element) { e.setAttribute('content', v); } } });
  let rw = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('link[rel="canonical"]', { element(e) { e.setAttribute('href', canonical); } })
    .on('head', { element(e) { e.append(`<meta property="product:price:amount" content="${card!.price}"><meta property="product:price:currency" content="EGP"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`, { html: true }); } });
  for (const x of [set('meta[name="description"]', desc), set('meta[property="og:type"]', 'product'), set('meta[property="og:title"]', title), set('meta[property="og:description"]', desc), set('meta[property="og:url"]', canonical), ...(card.image ? [set('meta[property="og:image"]', card.image), set('meta[name="twitter:image"]', card.image)] : [])]) rw = rw.on(x.sel, x.h);
  const out = rw.transform(page);
  const h = new Headers(out.headers);
  h.set('cache-control', 'public, max-age=300');
  h.set('x-safqa-seo', 'v6');
  return new Response(out.body, { status: 200, headers: h });
};
