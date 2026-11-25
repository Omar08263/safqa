// Intrusion detection: suspicious events (failed logins, rate-limit hits, bad request
// signatures, refresh-token reuse, admin probing, 2FA failures) are aggregated in
// isolate memory and flushed at most once a minute as ONE row per (kind, ip) — so an
// attack of 10,000 failed logins costs a handful of D1 writes, not 10,000. When D1 is
// read-only (free daily write cap) events still reach Workers Logs and the owner's
// Telegram; the Hub shows what this location still holds in memory.
// Severe patterns auto-ban the IP for an hour (one KV write per ban).
import type { Env } from '../util';

export type SecKind =
  | 'auth_fail' | 'login_locked' | 'refresh_reuse' | 'rate_limited' | 'sig_fail' | 'sig_replay'
  | 'admin_denied' | 'otp_fail' | 'otp_locked' | 'origin_blocked' | 'webhook_forged' | 'too_large' | 'banned_hit' | 'csp_report';

interface Agg { kind: SecKind; ip: string; count: number; first: number; last: number; who: string | null; path: string | null; detail: string | null }
const buf = new Map<string, Agg>();
const recent: (Agg & { flushedAt: number })[] = [];
let lastFlush = Date.now();

/** Per-window thresholds: [alert owner at, auto-ban at] (null = never). */
export const RULES: Record<SecKind, [number | null, number | null]> = {
  auth_fail: [15, 60], login_locked: [1, null], refresh_reuse: [1, null], rate_limited: [100, 600], sig_fail: [10, 40], sig_replay: [5, 20],
  admin_denied: [3, 30], otp_fail: [3, 15], otp_locked: [1, null], origin_blocked: [25, null], webhook_forged: [3, 20], too_large: [20, 100], banned_hit: [null, null], csp_report: [null, null],
};
export const SEV: Partial<Record<SecKind, 'high' | 'med'>> = { refresh_reuse: 'high', otp_locked: 'high', login_locked: 'med', sig_replay: 'med', admin_denied: 'med', webhook_forged: 'med', otp_fail: 'med' };

export function secEvent(kind: SecKind, ip: string | null, info: { who?: string | null; path?: string | null; detail?: string | null } = {}) {
  const k = `${kind}|${ip ?? '-'}`;
  const now = Date.now();
  const e = buf.get(k);
  if (e) { e.count++; e.last = now; if (info.who) e.who = info.who; }
  else {
    if (buf.size > 5000) return; // memory guard during a huge spray; Workers Logs still has it
    buf.set(k, { kind, ip: ip ?? '-', count: 1, first: now, last: now, who: info.who ?? null, path: info.path?.slice(0, 120) ?? null, detail: info.detail?.slice(0, 300) ?? null });
  }
  console.log(JSON.stringify({ sec: kind, ip, who: info.who ?? undefined, path: info.path ?? undefined }));
}

export const shouldFlush = (now = Date.now()) => buf.size > 0 && (now - lastFlush > 60_000 || buf.size >= 50 || [...buf.values()].some((a) => SEV[a.kind] === 'high'));

// ---------- bans (KV, read at most once a minute per isolate) ----------
let bans: Record<string, number> = {};
let bansAt = 0;
export async function bannedUntil(env: Env, ip: string | null): Promise<number> {
  if (!ip) return 0;
  if (Date.now() - bansAt > 60_000) {
    bansAt = Date.now();
    bans = ((await env.KV.get('sec:bans', 'json').catch(() => null)) as Record<string, number> | null) ?? {};
  }
  const t = bans[ip] ?? 0;
  return t > Date.now() ? t : 0;
}
export async function ban(env: Env, ip: string, minutes: number, add = true) {
  const cur = ((await env.KV.get('sec:bans', 'json').catch(() => null)) as Record<string, number> | null) ?? {};
  const now = Date.now();
  for (const [k, v] of Object.entries(cur)) if (v < now) delete cur[k];
  if (add) cur[ip] = now + minutes * 60_000; else delete cur[ip];
  bans = cur; bansAt = now;
  await env.KV.put('sec:bans', JSON.stringify(cur));
  return cur;
}

// ---------- owner alerts (Telegram, direct send: no D1 outbox write) ----------
let ownerChats: { at: number; ids: string[] } = { at: 0, ids: [] };
async function ownerChatIds(env: Env): Promise<string[]> {
  if (Date.now() - ownerChats.at < 600_000) return ownerChats.ids;
  const ids = new Set<string>((env.OWNER_TG_CHAT ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const emails = (env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (emails.length) {
    try {
      const rows = (await env.DB.prepare(`SELECT t.chat_id FROM tg_links t JOIN users u ON u.id=t.user_id WHERE lower(u.email) IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<{ chat_id: string }>()).results;
      for (const r of rows) ids.add(String(r.chat_id));
    } catch { /* D1 unavailable: env chat only */ }
  }
  ownerChats = { at: Date.now(), ids: [...ids] };
  return ownerChats.ids;
}
const KIND_AR: Record<SecKind, string> = {
  auth_fail: 'محاولات دخول فاشلة', login_locked: 'حساب اتقفل مؤقتًا بعد محاولات باسورد غلط', refresh_reuse: 'إعادة استخدام توكن جلسة قديم (احتمال سرقة جلسة) — الجلسات اتلغت',
  rate_limited: 'طلبات كتير جدًا (Flood)', sig_fail: 'طلبات بتوقيع غلط', sig_replay: 'إعادة إرسال طلب قديم (Replay)', admin_denied: 'محاولة دخول لوحة التحكم من غير صلاحية',
  otp_fail: 'كود 2FA غلط', otp_locked: '2FA اتقفل بعد أكواد غلط', origin_blocked: 'طلبات من موقع غريب', webhook_forged: 'Webhook مزوّر لتليجرام', too_large: 'طلبات حجمها كبير جدًا', banned_hit: 'IP محظور بيحاول', csp_report: 'تقرير CSP',
};
const alerted = new Map<string, number>();
async function alertOwner(env: Env, a: Agg, banned: boolean) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const key = `${a.kind}|${a.ip}`;
  if ((alerted.get(key) ?? 0) > Date.now() - 30 * 60_000) return; // one alert per pattern per 30 min (per isolate)
  try {
    const c = caches.default; const url = `https://sec-alert.safqa.internal/${encodeURIComponent(key)}`;
    if (await c.match(url)) return;
    await c.put(url, new Response('1', { headers: { 'cache-control': 'max-age=1800' } }));
  } catch { /* cache unavailable in tests */ }
  alerted.set(key, Date.now());
  const ipMasked = a.ip.replace(/(\d+)\.(\d+)$/, 'x.x');
  const text = `🛡️ <b>تنبيه أمان — صفقة</b>\n${KIND_AR[a.kind]}\n× ${a.count} من IP ${ipMasked}${a.who ? `\nالحساب: ${a.who.replace(/(.).+(@.+)/, '$1***$2')}` : ''}${a.path ? `\nالمسار: ${a.path}` : ''}${banned ? '\n⛔ الـ IP اتحظر ساعة تلقائيًا' : ''}\n\nالتفاصيل في Safqa Hub ← الأمان`;
  for (const chat of await ownerChatIds(env)) {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }) }).catch(() => undefined);
  }
}

export async function flushSec(env: Env) {
  if (!buf.size) return 0;
  const items = [...buf.values()];
  buf.clear();
  lastFlush = Date.now();
  for (const a of items) {
    const [alertAt, banAt] = RULES[a.kind];
    let banned = false;
    if (banAt != null && a.count >= banAt && a.ip !== '-') { await ban(env, a.ip, 60).catch(() => undefined); banned = true; }
    if (alertAt != null && a.count >= alertAt) await alertOwner(env, a, banned).catch(() => undefined);
  }
  try {
    await env.DB.batch(items.map((a) => env.DB.prepare('INSERT INTO sec_events (at,kind,ip,count,who,path,detail,first_at) VALUES (?,?,?,?,?,?,?,?)').bind(a.last, a.kind, a.ip, a.count, a.who, a.path, a.detail, a.first)));
  } catch (e) {
    console.log('sec flush to D1 failed (kept in memory)', String(e).slice(0, 100));
  }
  for (const a of items) recent.unshift({ ...a, flushedAt: lastFlush });
  recent.length = Math.min(recent.length, 300);
  return items.length;
}

export async function listSec(env: Env, limit = 200) {
  let rows: Record<string, unknown>[] = [];
  let durable = true;
  try { rows = (await env.DB.prepare('SELECT * FROM sec_events ORDER BY at DESC LIMIT ?').bind(limit).all<Record<string, unknown>>()).results; } catch { durable = false; }
  const mem = [...buf.values(), ...recent].map((a) => ({ at: a.last, kind: a.kind, ip: a.ip, count: a.count, who: a.who, path: a.path, detail: a.detail, first_at: a.first, memory: true }));
  return { durable, items: rows, memory: mem.slice(0, 100) };
}
export const _secState = () => ({ buf, recent });
