// ♿ Daily quality audit (Lighthouse, Apache-2.0 — its accessibility category runs axe-core, MPL-2.0).
// Reads the Lighthouse JSON reports in REPORTS dir, writes DATA/quality/latest.json + history.json.
// Usage: node quality.mjs <reportsDir> <dataDir>
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [REP = 'lh', DATA = 'status-data'] = process.argv.slice(2);
const dir = join(DATA, 'quality'); mkdirSync(dir, { recursive: true });
const pages = [];
for (const f of readdirSync(REP).filter((x) => x.endsWith('.json'))) {
  try {
    const j = JSON.parse(readFileSync(join(REP, f), 'utf8'));
    const cat = (k) => (j.categories?.[k]?.score == null ? null : Math.round(j.categories[k].score * 100));
    const issues = Object.values(j.audits ?? {}).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary' || (a.score !== null && a.score < 0.5 && a.scoreDisplayMode === 'numeric'))
      .slice(0, 8).map((a) => ({ id: a.id, title: a.title, score: a.score }));
    pages.push({ page: f.replace(/\.json$/, ''), url: j.finalDisplayedUrl ?? j.requestedUrl, performance: cat('performance'), accessibility: cat('accessibility'), bestPractices: cat('best-practices'), seo: cat('seo'),
      lcpMs: Math.round(j.audits?.['largest-contentful-paint']?.numericValue ?? 0), cls: Number((j.audits?.['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)), issues });
  } catch (e) { console.log('skip', f, String(e).slice(0, 80)); }
}
const at = new Date().toISOString();
const avg = (k) => { const v = pages.map((p) => p[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const latest = { at, tool: 'lighthouse (mobile, simulated 4G) + axe-core', pages, avg: { performance: avg('performance'), accessibility: avg('accessibility'), bestPractices: avg('bestPractices'), seo: avg('seo') } };
const hp = join(dir, 'history.json');
const hist = existsSync(hp) ? JSON.parse(readFileSync(hp, 'utf8')) : [];
hist.push({ at, ...latest.avg }); 
writeFileSync(hp, JSON.stringify(hist.slice(-90)));
writeFileSync(join(dir, 'latest.json'), JSON.stringify(latest));
console.log(JSON.stringify(latest.avg));
