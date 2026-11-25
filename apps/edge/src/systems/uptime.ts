// 🟢 نبض صفقة from the Worker cron (fallback until the GitHub Actions pulse workflow can be
// enabled): same checks as deploy/status/probe.mjs, every 20 min, one KV write per run
// (72/day of the 1k free KV writes), 7-day rolling history. Zero D1 writes.
import type { Env } from '../util';
import { systemOn } from './registry';

const KEY = 'sys:uptime:v1';
const UA = 'SafqaPulse/1 (+https://safqaeg.pages.dev/status)';
type Pt = [string, number, 0 | 1];
interface Hist { points: Record<string, Pt[]>; incidents: { id: string; at: string; until: string | null; note: string }[] }
const CHECKS: { id: string; name: string; nameEn: string; url: string; ok: (s: number, t: string) => boolean }[] = [
  { id: 'site', name: 'الموقع', nameEn: 'Website', url: 'https://safqaeg.pages.dev/', ok: (s, t) => s === 200 && t.includes('صفقة') },
  { id: 'product', name: 'صفحات المنتجات + كارت المشاركة', nameEn: 'Product pages + share card', url: 'https://safqaeg.pages.dev/p/p661a1c3904a9824f974a', ok: (s, t) => s === 200 && t.includes('application/ld+json') },
  { id: 'catalog', name: 'الكتالوج والأسعار', nameEn: 'Catalog & prices', url: 'https://safqa-api.safqaeg.workers.dev/api/v5/meta', ok: (s, t) => s === 200 && t.length > 20 },
  { id: 'hub', name: 'لوحة التحكم Safqa Hub', nameEn: 'Safqa Hub', url: 'https://safqa-admin.pages.dev/', ok: (s) => s === 200 },
  { id: 'app', name: 'تحميل التطبيق (APK)', nameEn: 'App download (APK)', url: 'https://api.github.com/repos/Omar08263/safqa/releases/latest', ok: (s, t) => s === 200 && t.includes('.apk') },
];

async function probe(c: (typeof CHECKS)[number]) {
  const t0 = Date.now();
  try {
    const r = await fetch(c.url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { id: c.id, ok: c.ok(r.status, t), ms: Date.now() - t0, code: r.status };
  } catch { return { id: c.id, ok: false, ms: Date.now() - t0, code: 0 }; }
}

export async function uptimeTick(env: Env, d: Date) {
  if (d.getUTCMinutes() % 20 >= 10) return null;
  if (!(await systemOn(env, 'uptime'))) return null;
  const hist = (await env.KV.get<Hist>(KEY, 'json')) ?? { points: {}, incidents: [] };
  const at = d.toISOString();
  // The API itself is up (we are running); record it as such with the D1 read latency.
  const t0 = Date.now();
  let dbOk = true; try { await env.DB.prepare('SELECT 1').first(); } catch { dbOk = false; }
  const res = [{ id: 'api', ok: dbOk, ms: Date.now() - t0, code: dbOk ? 200 : 503 }, ...(await Promise.all(CHECKS.map(probe)))];
  const week = Date.now() - 7 * 86400_000;
  for (const r of res) {
    const pts = (hist.points[r.id] ??= []);
    pts.push([at, r.ms, r.ok ? 1 : 0]);
    hist.points[r.id] = pts.filter((p) => Date.parse(p[0]) > week);
    const open = hist.incidents.find((x) => x.id === r.id && !x.until);
    const name = r.id === 'api' ? 'الـ API وقاعدة البيانات' : CHECKS.find((c) => c.id === r.id)!.name;
    if (!r.ok && !open) hist.incidents.unshift({ id: r.id, at, until: null, note: `${name}: ${r.code || 'timeout'}` });
    if (r.ok && open) open.until = at;
  }
  hist.incidents = hist.incidents.slice(0, 50);
  await env.KV.put(KEY, JSON.stringify(hist));
  return res;
}

export async function uptimeSummary(env: Env) {
  const hist = await env.KV.get<Hist>(KEY, { type: 'json', cacheTtl: 120 });
  if (!hist) return null;
  const day = Date.now() - 86400_000;
  const pct = (p: Pt[]) => (p.length ? Math.round((1000 * p.filter((x) => x[2]).length) / p.length) / 10 : null);
  const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]! : null);
  const all = [{ id: 'api', name: 'الـ API وقاعدة البيانات', nameEn: 'API & database', url: 'https://safqa-api.safqaeg.workers.dev/api/health' }, ...CHECKS];
  const checks = all.map((c) => {
    const pts = hist.points[c.id] ?? []; const last = pts[pts.length - 1];
    const d = pts.filter((p) => Date.parse(p[0]) > day);
    return { id: c.id, name: c.name, nameEn: c.nameEn, url: c.url, ok: Boolean(last?.[2]), ms: last?.[1] ?? 0, code: last?.[2] ? 200 : 0, uptime24: pct(d), uptime7d: pct(pts), p50: med(d.filter((p) => p[2]).map((p) => p[1])), last: pts.slice(-48) };
  });
  const at = checks.map((c) => c.last[c.last.length - 1]?.[0] ?? '').sort().pop() ?? new Date().toISOString();
  return { at, ok: checks.every((c) => c.ok), checks, incidents: hist.incidents.slice(0, 10), source: 'worker-cron' };
}
