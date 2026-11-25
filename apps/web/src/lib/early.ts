// LCP: on a product deep link, start the product request (and then its hero photo) before the router
// and page code download. useV5Product picks the in-flight promise up instead of asking again.
import { EDGE_URL } from './auth-tokens';

/** Same sizing rule as RemoteThumb (Shopify CDN resizes on the fly). */
export const imgSrc = (u?: string | null, w = 400) => {
  if (!u) return null;
  if (/cdn\.shopify\.com/.test(u)) return u.includes('?') ? `${u}&width=${w}` : `${u}?width=${w}`;
  return u;
};

const early = new Map<string, Promise<unknown>>();

export function startEarlyProduct(pathname: string) {
  const m = /^\/p\/(p[0-9a-f]{20})\/?$/.exec(pathname);
  if (!m) return;
  const id = m[1]!;
  const p = fetch(`${EDGE_URL}/api/v5/product/${id}`, { headers: { accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error(`v5 ${r.status}`); return r.json(); })
    .then((j: { image?: string | null }) => {
      const src = imgSrc(j.image, 800);
      if (src) { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'image'; l.href = src; l.setAttribute('fetchpriority', 'high'); l.referrerPolicy = 'no-referrer'; document.head.appendChild(l); }
      return j;
    });
  p.catch(() => early.delete(id));
  early.set(id, p);
}

/** One-shot: the first caller for this id gets the early promise. */
export function takeEarly<T>(id: string): Promise<T> | null {
  const p = early.get(id);
  if (!p) return null;
  early.delete(id);
  return p as Promise<T>;
}
