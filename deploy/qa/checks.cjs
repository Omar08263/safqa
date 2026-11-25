// Shared in-page layout checks (run via page.evaluate) used by deep.cjs and the visual regression suite.
// Returns overflowX, overlapping text, badges covering product photos, clipped text, broken images,
// bare 0/NaN/undefined, Arabic left in EN mode, fonts in use, and tiny tap targets.
/* eslint-disable */
function checks() {
  const vw = innerWidth, vh = innerHeight; const R = { overflowX: document.documentElement.scrollWidth - vw, overlaps: [], covers: [], clipped: [], brokenImg: [], bare: [], arInEn: [], fonts: {}, small: 0 };
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const inFixed = (el) => { for (let e = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const skip = (el) => el.closest('[aria-hidden="true"], .ticker-track, .sr-only, svg, [data-qa-ignore], .overflow-x-auto, .no-scrollbar') || (el.closest('details:not([open])') && !el.closest('summary'));
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} "${(el.innerText || el.alt || '').trim().slice(0, 40)}"`;
  // text leaves
  const leaves = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; const txt = t.textContent.trim(); if (!txt) continue;
    const el = t.parentElement; if (!el || seen.has(el) || skip(el) || !vis(el)) continue; seen.add(el);
    const r = document.createRange(); r.selectNodeContents(t); let b = r.getBoundingClientRect(); for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflow !== 'visible' || cs.overflowY !== 'visible' || (a === el && cs.webkitLineClamp !== 'none')) { const e = a.getBoundingClientRect(); const L = Math.max(b.left, e.left), T = Math.max(b.top, e.top), Rr = Math.min(b.right, e.right), B = Math.min(b.bottom, e.bottom); b = { left: L, top: T, right: Rr, bottom: B, width: Math.max(0, Rr - L), height: Math.max(0, B - T) }; } } if (!b.width || !b.height) continue; if (!b.width || b.bottom < 0 || b.top > document.documentElement.scrollHeight) continue;
    leaves.push({ el, b, txt, fixed: inFixed(el) });
    const ff = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); R.fonts[ff] = (R.fonts[ff] || 0) + 1;
    if (/^(0|0%|0 ?ج\.م|NaN|undefined|null|\[object Object\]|Invalid Date|-?Infinity)$/.test(txt) || /\b(NaN|undefined|Invalid Date)\b/.test(txt)) R.bare.push(desc(el));
    if (document.documentElement.lang === 'en' && /[\u0600-\u06FF]{3,}/.test(txt) && !el.closest('[lang="ar"], [dir="rtl"], [data-qa-ar]')) R.arInEn.push(desc(el));
    const s = getComputedStyle(el);
    if ((s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis' && !s.webkitLineClamp?.match(/\d/) && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0) R.clipped.push(desc(el));
  }
  // overlapping text (non-ancestor pairs, same fixed-ness)
  for (let i = 0; i < leaves.length && R.overlaps.length < 12; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], c = leaves[j]; if (a.fixed !== c.fixed || a.el.contains(c.el) || c.el.contains(a.el)) continue;
    const x = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), y = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
    if (x > 4 && y > 4 && x * y > 0.25 * Math.min(a.b.width * a.b.height, c.b.width * c.b.height)) { R.overlaps.push(`${desc(a.el)} ⟂ ${desc(c.el)}`); if (R.overlaps.length >= 12) break; }
  }
  // badges / overlays covering product images: absolutely positioned non-button boxes over an <img>'s drawn area
  for (const img of document.querySelectorAll('img')) {
    if (!vis(img) || skip(img)) continue;
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) R.brokenImg.push(img.getAttribute('src').slice(0, 120));
    const tile = img.closest('.media-tile'); if (!tile) continue;
    const box = tile.parentElement; const ib = img.getBoundingClientRect();
    // drawn content rect (object-fit: contain + padding)
    const s = getComputedStyle(img); const pad = parseFloat(s.paddingTop) || 0; const cw = ib.width - 2 * pad, ch = ib.height - 2 * pad;
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1; let dw = cw, dh = cw / ratio; if (dh > ch) { dh = ch; dw = ch * ratio; }
    const drawn = { left: ib.left + (ib.width - dw) / 2, top: ib.top + (ib.height - dh) / 2, right: ib.left + (ib.width + dw) / 2, bottom: ib.top + (ib.height + dh) / 2 };
    for (const o of box.querySelectorAll(':scope > .absolute, :scope > div > .absolute, :scope .badge-stack > *')) {
      if (o.contains(img) || o.tagName === 'BUTTON' || o.tagName === 'A' || !vis(o)) continue;
      const b = o.getBoundingClientRect(); const x = Math.min(b.right, drawn.right) - Math.max(b.left, drawn.left), y = Math.min(b.bottom, drawn.bottom) - Math.max(b.top, drawn.top);
      if (x > 6 && y > 6 && x * y > 0.08 * b.width * b.height) R.covers.push(`${desc(o)} covers ${Math.round(x)}×${Math.round(y)}px of image`);
    }
  }
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select')) { if (!vis(el) || skip(el)) continue; const b = el.getBoundingClientRect(); if (b.height < 24 && b.width < 24) R.small++; }
  R.covers = [...new Set(R.covers)].slice(0, 8); R.bare = [...new Set(R.bare)].slice(0, 8); R.arInEn = [...new Set(R.arInEn)].slice(0, 8); R.clipped = [...new Set(R.clipped)].slice(0, 8);
  return R;
}

module.exports = { checks };
