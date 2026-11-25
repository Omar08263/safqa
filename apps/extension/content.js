// Safqa content script. Reads the public schema.org Product data of the page YOU are viewing,
// shows Safqa's cross-store prices, and — only if you press the button — shares this price
// with Safqa as a "user-reported" offer. It never crawls, never runs in the background, and
// does not touch store bot checks.
const SITE = 'https://safqa-eg-safqa.static.hf.space/#';

function readProduct() {
  const nodes = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const j = JSON.parse(s.textContent || ''); (Array.isArray(j) ? j : [j]).forEach((x) => nodes.push(...(x['@graph'] || [x]))); } catch { /* ignore */ }
  }
  const p = nodes.find((n) => /Product/.test(String(n['@type'])));
  const meta = (k) => document.querySelector(`meta[property="${k}"],meta[name="${k}"]`)?.getAttribute('content') || '';
  if (p) {
    const offers = [].concat(p.offers || []);
    const o = offers[0] || {};
    const price = Number(o.price || o.lowPrice || 0);
    return { url: location.href, title: String(p.name || '').trim(), brand: typeof p.brand === 'string' ? p.brand : p.brand?.name || '', price, currency: o.priceCurrency || 'EGP', image: [].concat(p.image || [])[0] || meta('og:image'), inStock: !/OutOfStock/i.test(String(o.availability || '')), gtin: p.gtin13 || p.gtin || '' };
  }
  const price = Number(meta('product:price:amount') || meta('og:price:amount'));
  if (price) return { url: location.href, title: meta('og:title') || document.title, price, currency: meta('product:price:currency') || 'EGP', image: meta('og:image'), inStock: true };
  return null;
}

const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));
const fmt = (n) => `${Math.round(n).toLocaleString('en')} ج.م`;

function panel() {
  const root = document.createElement('aside');
  root.setAttribute('dir', 'rtl');
  root.style.cssText = 'position:fixed;z-index:2147483646;bottom:16px;left:16px;width:300px;background:#1c1915;color:#f6f0e6;border-radius:18px;padding:14px;font:13px/1.55 Tahoma,sans-serif;box-shadow:0 20px 50px -20px #000';
  const close = document.createElement('button');
  close.textContent = '×'; close.setAttribute('aria-label', 'إغلاق');
  close.style.cssText = 'position:absolute;top:6px;left:10px;background:none;border:0;color:#f6f0e6;font-size:18px;cursor:pointer';
  close.onclick = () => root.remove();
  const body = document.createElement('div');
  root.append(close, body);
  document.body.append(root);
  return body;
}
function line(parent, text, style = '') { const d = document.createElement('div'); d.textContent = text; d.style.cssText = style; parent.append(d); return d; }

(async () => {
  const p = readProduct();
  if (!p || !p.title) return; // not a product page: stay silent
  const body = panel();
  line(body, '🔥 صفقة', 'font-weight:700;color:#f0b429;margin-bottom:4px');
  const res = await send({ type: 'search', q: p.title.split(/\s+/).slice(0, 7).join(' ') });
  const items = res?.data?.items || [];
  if (items.length) {
    line(body, 'أسعار نفس المنتج في متاجر تانية:', 'opacity:.8');
    for (const it of items.slice(0, 3)) {
      const a = document.createElement('a');
      a.href = `${SITE}/p/${it.id}`; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = `${fmt(it.bestOffer?.priceEgp || 0)} · ${(it.bestOffer?.store?.nameAr || '')} — ${String(it.titleEn || it.titleAr).slice(0, 48)}`;
      a.style.cssText = 'display:block;color:#f6f0e6;text-decoration:none;padding:4px 0;border-bottom:1px solid #ffffff1a';
      body.append(a);
    }
  } else line(body, 'المنتج ده لسه مش في كتالوج صفقة.', 'opacity:.8');
  if (p.price && /EGP|LE/i.test(p.currency)) {
    const b = document.createElement('button');
    b.textContent = `شارك السعر ده (${fmt(p.price)}) مع صفقة`;
    b.style.cssText = 'margin-top:10px;width:100%;border:0;border-radius:999px;padding:8px;background:#f0b429;color:#1c1915;font-weight:700;cursor:pointer';
    b.onclick = async () => {
      b.disabled = true; b.textContent = '…';
      const r = await send({ type: 'observe', product: p });
      b.textContent = r?.ok ? 'شكرًا! اتسجل كسعر «من المستخدمين» ✓' : (r?.data?.error?.message || 'المتجر ده مش مدعوم لسه');
    };
    body.append(b);
    line(body, 'بنبعت اسم المنتج والسعر والرابط بس، ولما تضغط إنت.', 'opacity:.6;font-size:11px;margin-top:6px');
  }
})();
