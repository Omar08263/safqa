// Web vitals in a throttled phone (Moto G-ish: 4x CPU, ~1.6 Mbps): LCP, CLS + the shifting elements.
// node deploy/qa/vitals.cjs <url> [url...]
const { chromium, devices } = require(process.env.PW || '/workspace/shot-tool/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--disable-web-security'] });
  for (const url of process.argv.slice(2)) {
    const ctx = await b.newContext({ ...devices['Pixel 5'], locale: 'ar-EG' });
    await ctx.addInitScript(() => { for (const [k, v] of [['safqa.welcome.v4', 'true'], ['safqa.tourDone.v1', 'true'], ['safqa.installBanner.dismissed', 'true'], ['safqa.whatsnew.seen.v1', '"5.0.0"']]) localStorage.setItem(k, v);
      window.__v = { lcp: 0, cls: 0, shifts: [] };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__v.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__v.cls += e.value; window.__v.shifts.push({ v: +e.value.toFixed(3), t: Math.round(e.startTime), src: (e.sources || []).map((s) => s.node ? `${s.node.nodeName}.${String(s.node.className || '').slice(0, 50)}` : '?').slice(0, 3) }); } }).observe({ type: 'layout-shift', buffered: true });
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const v = await page.evaluate(() => window.__v);
    console.log(JSON.stringify({ url, loadMs: Date.now() - t0, lcp: Math.round(v.lcp), cls: +v.cls.toFixed(3), shifts: v.shifts.filter((s) => s.v >= 0.01) }));
    await ctx.close();
  }
  await b.close();
})();
