// v6 systems endpoints: public list (site/app), owner view + switches (Hub / orchestrator).
import type { Env } from '../util';
import { fail, str } from '../util';
import { setFlag, opsLog } from '../autopilot';
import { SYSTEMS, systemById, systemFlags } from './registry';
import { registerNtfy } from './ntfy';
import { cached, storeInfo } from '../catalog/api';

type On = (m: string, path: string, h: (c: any) => unknown) => void;

async function health(env: Env) {
  const flags = await systemFlags(env);
  const ntfyUsers = await env.DB.prepare("SELECT COUNT(*) n FROM user_kv WHERE key='sys:ntfy' AND value='true'").first<{ n: number }>().catch(() => null);
  const remote = async (u?: string) => {
    if (!u?.startsWith('http')) return null;
    try { const r = await fetch(u, { cf: { cacheTtl: 120 } } as RequestInit); return r.ok ? await r.json() : { error: r.status }; } catch (e) { return { error: String(e).slice(0, 80) }; }
  };
  const extra: Record<string, unknown> = { ntfy: { optedIn: ntfyUsers?.n ?? null } };
  await Promise.all(SYSTEMS.filter((s) => s.statusUrl?.startsWith('http')).map(async (s) => { extra[s.id] = await remote(s.statusUrl); }));
  return SYSTEMS.map((s) => ({ ...s, state: flags[s.id], status: extra[s.id] ?? null }));
}

export function registerSystems(on: On, d: { needAdmin: (c: any) => Promise<string>; me: (env: Env, req: Request) => Promise<string> }) {
  on('GET', '/api/v6/systems', async (c) => {
    const flags = await systemFlags(c.env);
    return { items: SYSTEMS.map((s) => ({ id: s.id, emoji: s.emoji, nameAr: s.nameAr, nameEn: s.nameEn, forUsers: s.forUsers, oss: { name: s.oss.name, url: s.oss.url, license: s.oss.license }, surfaces: s.surfaces, on: flags[s.id]?.on ?? false })) };
  });
  // Orchestrator / Hub: full registry + live status. Same shape the master AI reads.
  on('GET', '/api/v6/hub/systems', async (c) => { await d.needAdmin(c); return { items: await health(c.env) }; });
  on('POST', '/api/v6/hub/systems/:id', async (c) => {
    const who = await d.needAdmin(c);
    const s = systemById(c.p[0]);
    if (!s) fail(404, 'not_found', 'نظام مش موجود');
    const b = (await c.req.json().catch(() => ({}))) as { enabled?: boolean; reason?: string };
    try {
      await setFlag(c.env, who, s!.flag, { enabled: Boolean(b.enabled), description: `${s!.emoji} ${s!.nameAr} (v6 system)`, guard: true, platforms: ['web', 'app'] });
    } catch (e) {
      if (/limit|exceeded|read.?only/i.test(String(e))) fail(503, 'write_cap', 'الحفظ متوقف لحد 2 بالليل بتوقيت القاهرة (حد D1 المجاني)');
      throw e;
    }
    await opsLog(c.env, who, 'system', `${s!.emoji} ${s!.nameAr} ${b.enabled ? 'اتشغّل' : 'اتقفل'}`, { reason: str(b.reason ?? '', 200) }, 'info');
    return { ok: true, items: await health(c.env) };
  });
  // 🪧 Read-only share card for link previews / rich results (never triggers a recrawl or a write).
  on('GET', '/api/v6/card/:id', (c) => cached(c.req, 1800, async () => {
    const id = str(c.p[0], 40);
    const r = await c.env.DB.prepare('SELECT id,title,title_ar,brand,image,price,list_price,store,url,in_stock,n_offers,offers,low,category,checked_at,updated_at FROM catalog WHERE id=?').bind(id).first<Record<string, any>>();
    if (!r) return { found: false };
    let offers: { s: string; p: number; k: number; u: string }[] = [];
    try { offers = JSON.parse(r.offers || '[]'); } catch { /* */ }
    return { found: true, id: r.id, title: r.title_ar || r.title, titleEn: r.title, brand: r.brand, image: r.image, price: r.price, listPrice: r.list_price, low: r.low, category: r.category, inStock: Boolean(r.in_stock),
      checkedAt: r.checked_at ?? r.updated_at, offers: offers.slice(0, 8).map((o) => ({ store: storeInfo(o.s).nameEn, storeAr: storeInfo(o.s).nameAr, price: o.p, inStock: Boolean(o.k), url: o.u })) };
  }, c.exec));
  registerNtfy(on, d.me);
}
