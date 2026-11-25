// Deep visual QA: every route × widths × ar/en × light/dark. Screenshots + automated defect checks:
// horizontal overflow, overlapping text, badges covering images, clipped text, broken images,
// bare "0"/NaN/undefined, Arabic left in EN mode, mixed fonts, console/page errors, failed requests, load time.
// node deploy/qa/deep.cjs <baseUrl> <outDir> [--widths=360,412,768,1024,1280,1440] [--routes=/,/hot] [--modes=ar-light,en-dark] [--shots=all|first|none]
const { chromium } = require(process.env.PW || '/workspace/shot-tool/node_modules/playwright');
const fs = require('fs');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const base = process.argv[2] || 'http://127.0.0.1:4173';
const out = process.argv[3] || '/workspace/safqa-qa-v6/run';
const widths = arg('widths', '360,412,768,1024,1280,1440').split(',').map(Number);
const ROUTES = ['/', '/search?q=samsung', '/hot', '/drops', '/coupons', '/add', '/smart', '/sources', '/watchlist', '/assistant', '/alerts', '/login', '/tools', '/compare', '/toolbox', '/chat', '/ai', '/lens', '/voice', '/globe', '/rules', '/agents', '/radar', '/app', '/features', '/dashboard', '/achievements', '/collections', '/savings', '/calendar', '/categories', '/stores', '/insights', '/profile', '/settings', '/referral', '/help', '/about', '/plans', '/channels', '/pay', '/live', '/status', '/systems', '/privacy', '/terms', '/nope-404'];
const routes = arg('routes', '') ? arg('routes').split(',') : ROUTES;
const modes = arg('modes', 'ar-light,en-light,ar-dark,en-dark').split(',');
const shots = arg('shots', 'all');
let latest = null; try { const cl = require('../../apps/web/src/features/changelog.json'); latest = cl.latest ?? cl.releases?.[0]?.version ?? null; } catch {}
fs.mkdirSync(out, { recursive: true });

function checks() {
  const vw = innerWidth, vh = innerHeight; const R = { overflowX: document.documentElement.scrollWidth - vw, overlaps: [], covers: [], clipped: [], brokenImg: [], bare: [], arInEn: [], fonts: {}, small: 0 };
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const inFixed = (el) => { for (let e = el; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const skip = (el) => el.closest('[aria-hidden="true"], .ticker-track, .sr-only, svg, [data-qa-ignore], .overflow-x-auto, .no-scrollbar');
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} "${(el.innerText || el.alt || '').trim().slice(0, 40)}"`;
  // text leaves
  const leaves = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; const txt = t.textContent.trim(); if (!txt) continue;
    const el = t.parentElement; if (!el || seen.has(el) || skip(el) || !vis(el)) continue; seen.add(el);
    const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect(); if (!b.width || b.bottom < 0 || b.top > document.documentElement.scrollHeight) continue;
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

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const mode of modes) {
    const [loc, theme] = mode.split('-');
    for (const w of widths) {
      const phone = w < 768; const h = w === 1024 ? 614 : phone ? 800 : w < 1280 ? 1024 : 900;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w <= 1024, isMobile: phone, locale: loc === 'ar' ? 'ar-EG' : 'en-US' });
      await ctx.addInitScript(({ loc, theme, latest }) => {
        localStorage.setItem('safqa.welcome.v4', 'true'); localStorage.setItem('safqa.tourDone.v1', 'true'); localStorage.setItem('safqa.installBanner.dismissed', 'true');
        localStorage.setItem('safqa.whatsnew.seen.v1', JSON.stringify(latest)); localStorage.setItem('safqa.locale', loc); localStorage.setItem('safqa.theme', theme);
      }, { loc, theme, latest });
      const page = await ctx.newPage();
      const errors = []; const failed = [];
      page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon|google|gstatic|analytics/.test(r.url())) failed.push(`${r.status()} ${r.url().slice(0, 120)}`); });
      for (const r of routes) {
        const t0 = Date.now();
        try { await page.goto(base + r, { waitUntil: 'networkidle', timeout: 30000 }); } catch { errors.push('timeout networkidle'); }
        const loadMs = Date.now() - t0;
        await page.waitForTimeout(700);
        await page.addStyleTag({ content: '*{content-visibility:visible!important}' }).catch(() => {});
        await page.waitForTimeout(150);
        let res; try { res = await page.evaluate(checks); } catch (e) { res = { evalError: String(e).slice(0, 200) }; }
        const name = `${mode}_${w}${r.replace(/[^a-z0-9]+/gi, '_')}`.replace(/_+$/, '');
        if (shots === 'all' || (shots === 'first' && mode === modes[0])) await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.argv.includes('--full') });
        const row = { mode, w, r, loadMs, ...res, errors: errors.splice(0), failed: failed.splice(0) };
        report.push(row);
        const bad = [row.overflowX > 1 && `overflow ${row.overflowX}`, row.overlaps?.length && `overlaps ${row.overlaps.length}`, row.covers?.length && `covers ${row.covers.length}`, row.bare?.length && `bare ${row.bare.length}`, row.arInEn?.length && `ar-in-en ${row.arInEn.length}`, row.brokenImg?.length && `brokenImg ${row.brokenImg.length}`, row.errors.length && `errors ${row.errors.length}`, row.failed.length && `failed ${row.failed.length}`, loadMs > 8000 && `slow ${loadMs}`].filter(Boolean);
        if (bad.length) console.log(`! ${mode} ${w} ${r}: ${bad.join(', ')}`);
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
})();
