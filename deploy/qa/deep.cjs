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

const { checks } = require('./checks.cjs');

(async () => {
  const browser = await chromium.launch({ args: /localhost|127\.0\.0\.1/.test(base) ? ['--disable-web-security'] : [] }); // local builds call the live API cross-origin
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
        try { await page.goto(base + r, { waitUntil: 'load', timeout: 30000 }); await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); } catch { errors.push('timeout load'); }
        const loadMs = Date.now() - t0;
        await page.waitForTimeout(700);
        await page.addStyleTag({ content: '*{content-visibility:visible!important}' }).catch(() => {});
        await page.waitForTimeout(150);
        let res; try { res = await page.evaluate(checks); } catch (e) { res = { evalError: String(e).slice(0, 200) }; }
        const name = `${mode}_${w}${r.replace(/[^a-z0-9]+/gi, '_')}`.replace(/_+$/, '');
        if (shots === 'all' || (shots === 'first' && mode === modes[0])) await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.argv.includes('--full') });
        const row = { mode, w, r, loadMs, ...res, errors: errors.splice(0), failed: failed.splice(0) };
        report.push(row);
        fs.appendFileSync(`${out}/report.jsonl`, `${JSON.stringify(row)}\n`);
        const bad = [row.overflowX > 1 && `overflow ${row.overflowX}`, row.overlaps?.length && `overlaps ${row.overlaps.length}`, row.covers?.length && `covers ${row.covers.length}`, row.bare?.length && `bare ${row.bare.length}`, row.arInEn?.length && `ar-in-en ${row.arInEn.length}`, row.brokenImg?.length && `brokenImg ${row.brokenImg.length}`, row.errors.length && `errors ${row.errors.length}`, row.failed.length && `failed ${row.failed.length}`, loadMs > 8000 && `slow ${loadMs}`].filter(Boolean);
        if (bad.length) console.log(`! ${mode} ${w} ${r}: ${bad.join(', ')}`);
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
})();
