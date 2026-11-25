// 🔔 Phone push through ntfy (https://github.com/binwiederhier/ntfy, Apache-2.0/GPL-2.0).
// No app install and no phone number: every user gets a private topic derived
// with HMAC(JWT_SECRET, user id), so we never store the topic itself — only the
// opt-in (one user_kv row). Free public server ntfy.sh (or NTFY_SERVER).
import type { Env } from '../util';
import { b64url, fail, nowIso } from '../util';
import { systemOn } from './registry';

const KEY = 'sys:ntfy';
const server = (env: Env) => ((env as Env & { NTFY_SERVER?: string }).NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');

export async function topicFor(env: Env, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET || 'safqa'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`ntfy:${userId}`)));
  return `safqa-${b64url(sig).replace(/[^A-Za-z0-9]/g, '').slice(0, 22)}`;
}

export interface Push { title: string; message: string; click?: string; tags?: string[]; priority?: 1 | 2 | 3 | 4 | 5 }
export async function publish(env: Env, topic: string, p: Push): Promise<boolean> {
  try {
    const r = await fetch(server(env), {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'SafqaBot/6 (+https://safqaeg.pages.dev)' },
      body: JSON.stringify({ topic, title: p.title.slice(0, 120), message: p.message.slice(0, 900), click: p.click, tags: p.tags ?? ['moneybag'], priority: p.priority ?? 3, icon: 'https://safqaeg.pages.dev/apple-touch-icon.png' }),
    });
    return r.ok;
  } catch { return false; }
}

/** Opted-in user ids among `ids` (single read). */
export async function optedIn(env: Env, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = (await env.DB.prepare(`SELECT user_id FROM user_kv WHERE key=? AND value='true' AND user_id IN (${ids.map(() => '?').join(',')})`).bind(KEY, ...ids).all<{ user_id: string }>()).results;
  return new Set(rows.map((r) => r.user_id));
}

/** Push to one user if the system is on and they opted in. */
export async function pushUser(env: Env, userId: string, p: Push, known?: Set<string>) {
  if (known ? !known.has(userId) : !(await optedIn(env, [userId])).has(userId)) return false;
  return publish(env, await topicFor(env, userId), p);
}

type On = (m: string, path: string, h: (c: any) => unknown) => void;
export function registerNtfy(on: On, me: (env: Env, req: Request) => Promise<string>) {
  const info = async (env: Env, uid: string) => {
    const topic = await topicFor(env, uid);
    const row = await env.DB.prepare('SELECT value FROM user_kv WHERE user_id=? AND key=?').bind(uid, KEY).first<{ value: string }>();
    const base = server(env);
    return { on: await systemOn(env, 'ntfy'), enabled: row?.value === 'true', topic, server: base, web: `${base}/${topic}`, app: `ntfy://${base.replace(/^https?:\/\//, '')}/${topic}`,
      android: 'https://play.google.com/store/apps/details?id=io.heckel.ntfy', ios: 'https://apps.apple.com/app/ntfy/id1625396347', fdroid: 'https://f-droid.org/packages/io.heckel.ntfy/' };
  };
  on('GET', '/api/v6/ntfy', async (c) => info(c.env, await me(c.env, c.req)));
  on('PUT', '/api/v6/ntfy', async (c) => {
    const uid = await me(c.env, c.req);
    const b = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
    try {
      await c.env.DB.prepare('INSERT OR REPLACE INTO user_kv (user_id,key,value,updated_at) VALUES (?,?,?,?)').bind(uid, KEY, b.enabled ? 'true' : 'false', nowIso()).run();
    } catch (e) {
      if (/limit|exceeded|read.?only/i.test(String(e))) fail(503, 'write_cap', 'الحفظ متوقف مؤقتًا لحد الساعة 2 بالليل بتوقيت القاهرة (حد مجاني يومي) — جرّب بعدها');
      throw e;
    }
    return info(c.env, uid);
  });
  on('POST', '/api/v6/ntfy/test', async (c) => {
    const uid = await me(c.env, c.req);
    if (!(await systemOn(c.env, 'ntfy'))) fail(403, 'off', 'الميزة دي متوقفة دلوقتي');
    const ok = await publish(c.env, await topicFor(c.env, uid), { title: '🔔 صفقة: الجرس شغّال', message: 'كده هتوصلك تنبيهات نزول الأسعار هنا. ده إشعار تجريبي — مفيش عرض حقيقي فيه.', click: `${c.env.SITE_URL}/alerts`, tags: ['bell'] });
    return { ok };
  });
}
