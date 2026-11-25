// 🟢 Safqa uptime probe (Upptime-style, MIT idea): run by .github/workflows/pulse.yml every
// ~10 minutes. Appends to DATA/status/history.json (7 days) and writes DATA/status/summary.json,
// which the site's /status page and the Hub read from raw.githubusercontent.com.
// Usage: node probe.mjs <dataDir>
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA = process.argv[2] || 'status-data';
const UA = 'SafqaPulse/1 (+https://safqaeg.pages.dev/status)';
const CHECKS = [
  { id: 'site', name: 'الموقع', nameEn: 'Website', url: 'https://safqaeg.pages.dev/', expect: (r, t) => r.status === 200 && t.includes('صفقة') },
  { id: 'product', name: 'صفحات المنتجات + كارت المشاركة', nameEn: 'Product pages + share card', url: 'https://safqaeg.pages.dev/p/p661a1c3904a9824f974a', expect: (r, t) => r.status === 200 && t.includes('application/ld+json') },
  { id: 'api', name: 'واجهة البرمجة (API)', nameEn: 'API', url: 'https://safqa-api.safqaeg.workers.dev/api/health', expect: (r, t) => r.status === 200 && t.includes('"ok":true') },
  { id: 'catalog', name: 'الكتالوج والأسعار', nameEn: 'Catalog & prices', url: 'https://safqa-api.safqaeg.workers.dev/api/v5/deals?limit=1', expect: (r, t) => r.status === 200 && t.includes('"items"') },
  { id: 'hub', name: 'لوحة التحكم Safqa Hub', nameEn: 'Safqa Hub', url: 'https://safqa-admin.pages.dev/', expect: (r) => r.status === 200 },
  { id: 'app', name: 'تحميل التطبيق (APK)', nameEn: 'App download (APK)', url: 'https://github.com/Omar08263/safqa/releases/latest/download/safqa.apk', range: true, expect: (r) => r.status === 200 || r.status === 206 }, // real download (first byte); api.github.com 403s unauthenticated runners
];

async function probe(c) {
  const t0 = Date.now();
  try {
    const r = await fetch(c.url, { headers: { 'user-agent': UA, accept: '*/*', ...(c.range ? { range: 'bytes=0-0' } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const text = c.range ? (await r.body?.cancel(), '') : await r.text();
    return { id: c.id, ok: Boolean(c.expect(r, text)), ms: Date.now() - t0, code: r.status };
  } catch (e) {
    return { id: c.id, ok: false, ms: Date.now() - t0, code: 0, err: String(e).slice(0, 120) };
  }
}

const dir = join(DATA, 'status'); mkdirSync(dir, { recursive: true });
const hp = join(dir, 'history.json');
const hist = existsSync(hp) ? JSON.parse(readFileSync(hp, 'utf8')) : { points: {}, incidents: [] };
// APK false alarms before the checker fix (api.github.com 403; the download itself worked).
const APK_FALSE_UNTIL = Date.parse('2026-11-25T05:16:00Z');
for (const p of hist.points?.app ?? []) if (!p[2] && Date.parse(p[0]) < APK_FALSE_UNTIL) p[2] = 1;
for (const i of hist.incidents ?? []) if (i.id === 'app' && Date.parse(i.at) < APK_FALSE_UNTIL) { i.note = 'تحميل التطبيق (APK): إنذار خاطئ — اتحل'; i.until ??= new Date(APK_FALSE_UNTIL).toISOString(); }
const at = new Date().toISOString();
let results = await Promise.all(CHECKS.map(probe));
// One retry for failures (transient network blips shouldn't page anyone).
results = await Promise.all(results.map(async (r, i) => (r.ok ? r : probe(CHECKS[i]))));
const week = Date.now() - 7 * 86400_000, day = Date.now() - 86400_000;
for (const r of results) {
  const pts = (hist.points[r.id] ??= []);
  pts.push([at, r.ms, r.ok ? 1 : 0]);
  hist.points[r.id] = pts.filter((p) => Date.parse(p[0]) > week);
  const open = hist.incidents.find((x) => x.id === r.id && !x.until);
  if (!r.ok && !open) hist.incidents.unshift({ id: r.id, at, until: null, note: `${CHECKS.find((c) => c.id === r.id).name}: ${r.code || 'timeout'}` });
  if (r.ok && open) open.until = at;
}
hist.incidents = hist.incidents.slice(0, 50);
const pct = (pts) => (pts.length ? Math.round((1000 * pts.filter((p) => p[2]).length) / pts.length) / 10 : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = {
  at, ok: results.every((r) => r.ok),
  checks: CHECKS.map((c) => {
    const r = results.find((x) => x.id === c.id); const pts = hist.points[c.id] ?? [];
    const d = pts.filter((p) => Date.parse(p[0]) > day);
    return { id: c.id, name: c.name, nameEn: c.nameEn, url: c.url, ok: r.ok, ms: r.ms, code: r.code, uptime24: pct(d), uptime7d: pct(pts), p50: median(d.filter((p) => p[2]).map((p) => p[1])), last: pts.slice(-48) };
  }),
  incidents: hist.incidents.slice(0, 10),
};
writeFileSync(hp, JSON.stringify(hist));
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary));
console.log(summary.ok ? 'all ok' : 'DEGRADED', results.map((r) => `${r.id}:${r.ok ? 'ok' : 'FAIL'}:${r.ms}ms`).join(' '));
