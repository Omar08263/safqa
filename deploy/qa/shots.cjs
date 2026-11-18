// Visual QA: screenshots + overflow/overlap checks for every route at several widths.
// node deploy/qa/shots.cjs <baseUrl> <outDir> [widths=360,390,412,768,1024,1440] [routes=all] [--full]
const { chromium, devices } = require(process.env.PW || '/workspace/shot-tool/node_modules/playwright');
const fs = require('fs');
const base = process.argv[2] || 'http://127.0.0.1:4173';
const out = process.argv[3] || '/workspace/safqa-v4-shots';
const widths = (process.argv[4] || '360,390,412,768,1024,1440').split(',').map(Number);
const all = ['/', '/search', '/radar', '/compare', '/toolbox', '/community', '/plans', '/channels', '/app', '/features', '/chat', '/agents', '/rules', '/tools', '/dashboard', '/watchlist', '/alerts', '/collections', '/savings', '/calendar', '/categories', '/stores', '/insights', '/assistant', '/achievements', '/referral', '/profile', '/settings', '/help', '/about', '/privacy', '/terms', '/login', '/nope-404'];
const routes = process.argv[5] && process.argv[5] !== 'all' ? process.argv[5].split(',') : all;
const full = process.argv.includes('--full');
const tour = process.argv.includes('--tour');
const dark = process.argv.includes('--dark');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const w of widths) {
    const mobile = w < 768;
    const tablet = w >= 768 && w < 1280 && w !== 1024;
    const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 860 : tablet ? 1024 : 900 }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile || tablet, isMobile: mobile, locale: 'ar-EG' });
    await ctx.addInitScript(({ tour, dark }) => {
      if (!tour) localStorage.setItem('safqa.welcome.v4', 'true');
      localStorage.setItem('safqa.tourDone.v1', 'true');
      localStorage.setItem('safqa.installBanner.dismissed', 'true');
      if (dark) localStorage.setItem('safqa.theme', '"dark"'.replace(/"/g, '')); 
    }, { tour, dark });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    for (const r of routes) {
      const url = `${base}/#${r}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      } catch { /* keep going */ }
      await page.waitForTimeout(900);
      const issues = await page.evaluate(() => {
        const vw = window.innerWidth;
        const res = { overflowX: document.documentElement.scrollWidth - vw, offenders: [], device: document.documentElement.dataset.device };
        if (res.overflowX > 1) {
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width && (b.right > vw + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed') {
              const anc = el.closest('.overflow-x-auto, .ticker-wrap, [data-scroll]');
              if (!anc) res.offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(b.left)},${Math.round(b.right)}]`);
            }
            if (res.offenders.length > 6) break;
          }
        }
        return res;
      });
      const name = `${w}${r.replace(/[/$]/g, '_') || '_home'}`.replace(/_+$/, '') || `${w}_home`;
      await page.screenshot({ path: `${out}/${name === String(w) ? `${w}_home` : name}.png`, fullPage: full });
      report.push({ w, r, ...issues, errors: errors.splice(0) });
      if (issues.overflowX > 1 || errors.length) console.log(`! ${w} ${r} overflow=${issues.overflowX} ${issues.offenders.join(' | ')}`);
    }
    await ctx.close();
  }
  fs.writeFileSync(`${out}/qa-report.json`, JSON.stringify(report, null, 2));
  const bad = report.filter((x) => x.overflowX > 1 || x.errors.length);
  console.log(`checked ${report.length} views, ${bad.length} with issues`);
  for (const b of bad) if (b.errors.length) console.log(`ERR ${b.w} ${b.r}: ${b.errors.join(' / ')}`);
  await browser.close();
})();
