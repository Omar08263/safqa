// Safqa Hub API: remote config, client telemetry, autopilot control, escalations,
// audit, reports, deploy status, owner notifications and device pairing.
import changelog from '../../web/src/features/changelog.json';
import * as auth from './auth';
import type { Authed } from './auth';
import * as AP from './autopilot';
import * as adm from './admin';
import { enqueue, tgEnabled } from './telegram';
import { type Env, fail, nowIso, parseJ, rateLimit, sha256, str, uid } from './util';

type Ctx = { req: Request; env: Env; url: URL; p: string[]; exec: ExecutionContext };
type On = (m: string, path: string, h: (c: Ctx) => unknown) => void;
type Deps = { need: (c: Ctx) => Promise<Authed>; needAdmin: (c: Ctx) => Promise<string>; body: (c: Ctx, max?: number) => Promise<Record<string, any>> };

const REPO = 'Omar08263/safqa';
const SURFACES = [
  { id: 'site', ar: 'الموقع', url: 'https://safqaeg.pages.dev/' },
  { id: 'api', ar: 'السيرفر', url: 'https://safqa-api.safqaeg.workers.dev/api/health' },
  { id: 'hub', ar: 'Safqa Hub', url: 'https://safqa-admin.pages.dev/' },
];

async function deploys(env: Env) {
  const cached = await env.KV.get('hub:deploys', 'json');
  if (cached) return cached;
  const gh = (p: string) => fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: { 'user-agent': 'safqa-hub', accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [commits, releases, space] = await Promise.all([
    gh('/commits?per_page=8') as Promise<any[] | null>,
    gh('/releases?per_page=6') as Promise<any[] | null>,
    fetch('https://huggingface.co/api/spaces/safqa-eg/safqa').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<any>,
  ]);
  const checks = await Promise.all(SURFACES.map(async (s) => {
    const t0 = Date.now();
    // A Worker can't fetch its own workers.dev hostname — check the API from the inside (D1 + KV) instead.
    if (s.id === 'api') { try { await env.DB.prepare('SELECT 1').first(); await env.KV.get('hub:ping'); return { ...s, ok: true, status: 200, ms: Date.now() - t0 }; } catch (e) { return { ...s, ok: false, status: 500, ms: Date.now() - t0, error: String(e).slice(0, 80) }; } }
    try { const r = await fetch(s.url, { method: 'GET', redirect: 'follow' }); return { ...s, ok: r.ok, status: r.status, ms: Date.now() - t0 }; } catch (e) { return { ...s, ok: false, status: 0, ms: Date.now() - t0, error: String(e).slice(0, 80) }; }
  }));
  const out = {
    at: nowIso(), surfaces: checks,
    space: space ? { stage: space.runtime?.stage ?? null, sha: space.sha ?? null, lastModified: space.lastModified ?? null } : null,
    commits: (commits ?? []).map((c) => ({ sha: String(c.sha).slice(0, 7), msg: String(c.commit?.message ?? '').split('\n')[0]!.slice(0, 140), at: c.commit?.author?.date, author: c.commit?.author?.name })),
    releases: (releases ?? []).map((r) => ({ tag: r.tag_name, name: r.name, at: r.published_at, url: r.html_url, assets: (r.assets ?? []).map((a: any) => ({ name: a.name, url: a.browser_download_url, size: a.size, downloads: a.download_count })) })),
    changelog: changelog.latest,
  };
  await env.KV.put('hub:deploys', JSON.stringify(out), { expirationTtl: 300 });
  return out;
}

export function registerHub(on: On, d: Deps) {
  // ---------- public: remote config, changelog, telemetry ----------
  on('GET', '/api/v2/config', (c) => AP.publicConfig(c.env));
  on('GET', '/api/v2/changelog', () => changelog);
  on('POST', '/api/v2/telemetry', async (c) => {
    const ip = c.req.headers.get('cf-connecting-ip') ?? 'x';
    if (!(await rateLimit(c.env, `tel:${ip}`, 30, 600))) return { ok: true, dropped: true };
    const b = await d.body(c, 32_000);
    const sid = (await sha256(`${ip}|${str(b.sid, 64)}`)).slice(0, 16);
    const events = (Array.isArray(b.events) ? b.events : []).slice(0, 10);
    const stmts = events.map((e: any) => c.env.DB.prepare('INSERT INTO client_events (at,sid,platform,kind,flag,msg,version) VALUES (?,?,?,?,?,?,?)')
      .bind(Date.now(), sid, str(b.platform, 12) || 'web', str(e.kind, 20) || 'error', e.flag ? str(e.flag, 40) : null, str(e.msg, 300), str(b.version, 20)));
    if (stmts.length) await c.env.DB.batch(stmts);
    return { ok: true, n: stmts.length };
  });

  // ---------- barcode → product name (Open Food Facts, UPCitemdb trial), cached 30 days ----------
  on('GET', '/api/v2/barcode/:code', async (c) => {
    const code = c.p[0]!.replace(/\D/g, '').slice(0, 14);
    if (code.length < 8) fail(400, 'bad_code', 'الباركود قصير');
    const key = `bc:${code}`;
    const hit = await c.env.KV.get(key, 'json');
    if (hit) return hit;
    const ip = c.req.headers.get('cf-connecting-ip') ?? 'x';
    if (!(await rateLimit(c.env, `bc:${ip}`, 40, 3600))) fail(429, 'rate', 'استنى شوية');
    let out: { code: string; name: string | null; brand: string | null; image: string | null; source: string | null } = { code, name: null, brand: null, image: null, source: null };
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ar,brands,image_front_small_url`, { headers: { 'user-agent': 'SafqaEG/1.0 (price comparison; https://safqaeg.pages.dev)' } });
      const j: any = r.ok ? await r.json() : null;
      if (j?.status === 1 && (j.product?.product_name || j.product?.product_name_ar)) out = { code, name: j.product.product_name_ar || j.product.product_name, brand: j.product.brands ?? null, image: j.product.image_front_small_url ?? null, source: 'Open Food Facts' };
    } catch { /* next */ }
    if (!out.name) {
      try {
        const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { headers: { accept: 'application/json', 'user-agent': 'SafqaEG/1.0' } });
        const j: any = r.ok ? await r.json() : null;
        const it = j?.items?.[0];
        if (it?.title) out = { code, name: it.title, brand: it.brand ?? null, image: it.images?.[0] ?? null, source: 'UPCitemdb' };
      } catch { /* none */ }
    }
    await c.env.KV.put(key, JSON.stringify(out), { expirationTtl: out.name ? 30 * 86400 : 86400 });
    return out;
  });

  // ---------- device pairing (native Hub app; issued only to a Google-authed owner) ----------
  on('POST', '/api/v2/hub/pair', async (c) => {
    const who = await d.needAdmin(c);
    const a = await d.need(c);
    const code = Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => String(x % 10)).join('') + Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => String(x % 10)).join('');
    await c.env.DB.prepare('INSERT INTO hub_pairs (code, admin_user, exp) VALUES (?,?,?)').bind(await sha256(code), a.user.id, Date.now() + 5 * 60_000).run();
    await AP.opsLog(c.env, who, 'pair', 'كود ربط جهاز جديد لتطبيق Safqa Hub', null, 'info');
    return { code, expiresIn: 300 };
  });
  on('POST', '/api/v2/hub/pair/claim', async (c) => {
    const ip = c.req.headers.get('cf-connecting-ip') ?? 'x';
    if (!(await rateLimit(c.env, `pair:${ip}`, 8, 600))) fail(429, 'rate', 'محاولات كتير — استنى شوية');
    const b = await d.body(c);
    const h = await sha256(str(b.code, 12).replace(/\D/g, ''));
    const row = await c.env.DB.prepare('SELECT * FROM hub_pairs WHERE code=?').bind(h).first<{ admin_user: string; exp: number }>();
    await c.env.DB.prepare('DELETE FROM hub_pairs WHERE code=? OR exp<?').bind(h, Date.now()).run();
    if (!row || row.exp < Date.now()) fail(400, 'bad_code', 'الكود غلط أو انتهى — اعمل كود جديد من Safqa Hub على الويب');
    const u = await auth.getUser(c.env, row!.admin_user);
    if (!u || !auth.isAdminEmail(c.env, u.email) || !u.google_sub) fail(403, 'forbidden', 'للمالك بس');
    await AP.opsLog(c.env, u!.email, 'pair', `جهاز جديد اتربط بـ Safqa Hub (${str(b.device, 60) || 'Android'})`, null, 'warn');
    return auth.issue(c.env, u!);
  });

  // ---------- hub (owner, Google-only) ----------
  on('GET', '/api/v2/hub/overview', async (c) => {
    await d.needAdmin(c);
    const [stats, agents, flags, esc, report, audit] = await Promise.all([
      adm.stats(c.env),
      AP.agentsOut(c.env),
      c.env.DB.prepare('SELECT * FROM flags ORDER BY key').all(),
      c.env.DB.prepare("SELECT * FROM escalations WHERE status='open' ORDER BY at DESC LIMIT 20").all(),
      c.env.DB.prepare('SELECT * FROM ops_reports ORDER BY day DESC LIMIT 1').first(),
      c.env.DB.prepare('SELECT * FROM ops_audit ORDER BY id DESC LIMIT 25').all(),
    ]);
    const errors24 = Number((await c.env.DB.prepare('SELECT COUNT(*) AS n FROM client_events WHERE at>?').bind(Date.now() - 86400_000).first<{ n: number }>())?.n ?? 0);
    const hourly = (await c.env.DB.prepare("SELECT substr(at,1,13) AS h, COUNT(*) AS n FROM ops_audit WHERE at>? GROUP BY h ORDER BY h").bind(new Date(Date.now() - 86400_000).toISOString()).all()).results;
    return { stats, agents, flags: flags.results, escalations: esc.results.map((e: any) => ({ ...e, options: parseJ(e.options, []) })), report, audit: audit.results, errors24, hourly, ranks: AP.OPS_RANKS, changelog: changelog.latest };
  });
  on('GET', '/api/v2/hub/flags', async (c) => { await d.needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM flags ORDER BY key').all()).results }; });
  on('POST', '/api/v2/hub/flags/:key', async (c) => { const who = await d.needAdmin(c); await AP.setFlag(c.env, who, c.p[0]!, await d.body(c)); return { ok: true }; });
  on('GET', '/api/v2/hub/audit', async (c) => {
    await d.needAdmin(c);
    const kind = c.url.searchParams.get('kind'), actor = c.url.searchParams.get('actor');
    const before = Number(c.url.searchParams.get('before') ?? 0);
    const w: string[] = [], b: unknown[] = [];
    if (kind) { w.push('kind=?'); b.push(kind); }
    if (actor) { w.push('actor=?'); b.push(actor); }
    if (before) { w.push('id<?'); b.push(before); }
    const items = (await c.env.DB.prepare(`SELECT * FROM ops_audit ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 100`).bind(...b).all()).results;
    const admins = (await c.env.DB.prepare('SELECT id, admin AS actor, action AS title, detail, at FROM admin_audit ORDER BY id DESC LIMIT 30').all()).results;
    return { items, admin: admins };
  });
  on('GET', '/api/v2/hub/escalations', async (c) => {
    await d.needAdmin(c);
    const st = c.url.searchParams.get('status') ?? 'open';
    return { items: (await c.env.DB.prepare('SELECT * FROM escalations WHERE status=? ORDER BY at DESC LIMIT 100').bind(st).all()).results.map((e: any) => ({ ...e, options: parseJ(e.options, []) })) };
  });
  on('POST', '/api/v2/hub/escalations/:id', async (c) => { const who = await d.needAdmin(c); return AP.decideEscalation(c.env, who, c.p[0]!, str((await d.body(c)).decision, 30)); });
  on('GET', '/api/v2/hub/agents', async (c) => { await d.needAdmin(c); return { items: await AP.agentsOut(c.env), ranks: AP.OPS_RANKS }; });
  on('POST', '/api/v2/hub/agents/:id', async (c) => {
    const who = await d.needAdmin(c);
    const id = c.p[0]!;
    if (!AP.OPS_AGENTS.some((a) => a.id === id)) fail(404, 'not_found', 'وكيل مش موجود');
    const b = await d.body(c);
    await c.env.DB.prepare('INSERT OR IGNORE INTO ops_agents (id) VALUES (?)').bind(id).run();
    if (b.enabled !== undefined) await c.env.DB.prepare('UPDATE ops_agents SET enabled=? WHERE id=?').bind(b.enabled ? 1 : 0, id).run();
    if (b.rankOverride !== undefined) await c.env.DB.prepare('UPDATE ops_agents SET rank_override=? WHERE id=?').bind(b.rankOverride && AP.OPS_RANKS.some((r) => r.id === b.rankOverride) ? b.rankOverride : null, id).run();
    if (typeof b.xp === 'number') await AP.grantOpsXp(c.env, id, Math.max(-500, Math.min(500, Math.round(b.xp))), 'owner');
    await AP.opsLog(c.env, who, 'agent', `المالك عدّل الوكيل ${id}`, b, 'info');
    return { ok: true, items: await AP.agentsOut(c.env) };
  });
  on('POST', '/api/v2/hub/agents/:id/run', async (c) => {
    const who = await d.needAdmin(c);
    const id = c.p[0]!;
    if (id === 'all') { const out = []; for (const a of AP.OPS_AGENTS) out.push(a.id === 'rawi' ? { ...(await AP.rawi(c.env)), id: 'rawi' } : await AP.runAgent(c.env, a.id, true)); await AP.opsLog(c.env, who, 'run', 'تشغيل يدوي لكل الوكلاء', null); return { items: out }; }
    if (!AP.OPS_AGENTS.some((a) => a.id === id)) fail(404, 'not_found', 'وكيل مش موجود');
    return id === 'rawi' ? { ...(await AP.rawi(c.env, true)), id } : AP.runAgent(c.env, id, true);
  });
  on('GET', '/api/v2/hub/reports', async (c) => { await d.needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM ops_reports ORDER BY day DESC LIMIT 30').all()).results.map((r: any) => ({ ...r, stats: parseJ(r.stats, {}) })) }; });
  on('GET', '/api/v2/hub/deploys', async (c) => { await d.needAdmin(c); return deploys(c.env); });
  on('GET', '/api/v2/hub/events', async (c) => {
    await d.needAdmin(c);
    const since = Date.now() - 86400_000;
    return {
      byFlag: (await c.env.DB.prepare('SELECT flag, COUNT(*) AS n, COUNT(DISTINCT sid) AS users FROM client_events WHERE at>? GROUP BY flag ORDER BY n DESC').bind(since).all()).results,
      recent: (await c.env.DB.prepare('SELECT * FROM client_events ORDER BY id DESC LIMIT 40').all()).results,
    };
  });
  on('POST', '/api/v2/hub/notify', async (c) => {
    const who = await d.needAdmin(c);
    const b = await d.body(c);
    const title = str(b.title, 120), text = str(b.body, 1000);
    if (!title) fail(400, 'title', 'اكتب عنوان');
    const id = uid('ann_');
    await c.env.DB.prepare('INSERT INTO announcements (id,title,body,level,active,created_at) VALUES (?,?,?,?,1,?)').bind(id, title, text, ['info', 'deal', 'warn'].includes(b.level) ? b.level : 'info', nowIso()).run();
    let tg = 0;
    if (b.telegram && tgEnabled(c.env)) {
      const subs = (await c.env.DB.prepare('SELECT chat_id FROM tg_links WHERE subscribed=1 LIMIT 500').all<{ chat_id: string }>()).results;
      for (const s of subs) await enqueue(c.env, s.chat_id, `<b>${title.replace(/[<>&]/g, '')}</b>\n${text.replace(/[<>&]/g, '')}`);
      tg = subs.length;
    }
    if (b.banner) await AP.setFlag(c.env, who, 'banner', { enabled: true, value: { ar: title, level: b.level ?? 'info' } });
    await AP.opsLog(c.env, who, 'notify', `إشعار: ${title}`, { tg, banner: Boolean(b.banner) }, 'ok');
    return { ok: true, id, telegram: tg };
  });
}
