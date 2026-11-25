// Safqa edge API — Cloudflare Worker (free tier): D1 + KV + Workers AI.
import * as admin from './admin';
import { agentReply, agents, agentById, aiBudgetLeft, allRules, escalation } from './ai';
import * as auth from './auth';
import type { Authed } from './auth';
import * as C from './community';
import * as pay from './payments';
import { loadSnapshot, searchSnapshot, storeSnapshot } from './snapshot';
import * as T from './telegram';
import { registerHub } from './hub';
import { registerOwnerTools } from './owner-tools';
import { brainTick, registerBrain } from './brain';
import { autopilotTick } from './autopilot';
import { tierById } from './tiers';
import * as V5 from './catalog/api';
import * as Ingest from './catalog/ingest';
import * as Hunter from './catalog/hunter';
import * as Budget from './infra/budget';
import { ensureState } from './infra/state';
import * as Smart from './catalog/smart';
import { registerSystems } from './systems/api';
import { cairoDay, type Env, fail, HttpError, json, nowIso, parseJ, rateLimit, readJson, str, timingSafeEqual, uid, b64 } from './util';

type Ctx = { req: Request; env: Env; url: URL; p: string[]; exec: ExecutionContext };
type H = (c: Ctx) => Promise<unknown> | unknown;
const routes: [string, RegExp, H][] = [];
const on = (m: string, path: string, h: H) => routes.push([m, new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), h]);

async function need(c: Ctx): Promise<Authed> {
  const a = await auth.authenticate(c.env, c.req);
  if (!a) fail(401, 'unauthorized', 'سجّل دخول الأول');
  return a as Authed;
}
const opsSecretOk = (c: Ctx) => {
  const h = c.req.headers.get('x-safqa-ops') ?? '';
  return Boolean(c.env.PUSH_SECRET) && h.length > 0 && timingSafeEqual(h, c.env.PUSH_SECRET);
};
async function needAdmin(c: Ctx): Promise<string> {
  if (opsSecretOk(c)) return 'ops-secret';
  const a = await need(c);
  if (!a.admin) fail(403, 'forbidden', 'للإدارة بس');
  if (!a.user.google_sub) fail(403, 'google_only', 'دخول الإدارة بجوجل بس');
  return a.user.email;
}
const body = (c: Ctx, max?: number) => readJson<Record<string, any>>(c.req, max);
registerHub(on, { need, needAdmin, body });
registerOwnerTools(on, { needAdmin, body });
registerBrain(on, { needAdmin, body });

// ---------------- meta ----------------
on('GET', '/api/health', async (c) => ({ ok: true, db: 'd1', edge: true, at: nowIso(), ai: (await aiBudgetLeft(c.env)) > 0 }));
on('GET', '/api/v2/status', async (c) => ({
  ok: true, snapshot: parseJ((await c.env.DB.prepare("SELECT value FROM settings WHERE key='snapshot_meta'").first<{ value: string }>())?.value, null),
  aiAvailable: (await aiBudgetLeft(c.env)) > 0, telegram: T.tgEnabled(c.env) ? `https://t.me/${T.BOT_USERNAME}` : null, models: { chat: c.env.CHAT_MODEL, vision: c.env.VISION_MODEL },
}));
on('GET', '/api/v2/tiers', (c) => pay.tiersPublic(c.env));
on('GET', '/api/v2/rules', () => ({ rules: allRules, escalation, version: C.RULES_VERSION }));
on('GET', '/api/v2/announcements', async (c) => ({ items: (await c.env.DB.prepare('SELECT id,title,body,level,created_at FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 5').all()).results }));

// ---------------- catalog (latest snapshot) ----------------
on('GET', '/api/v2/snapshot', async (c) => (await loadSnapshot(c.env)) ?? fail(404, 'no_snapshot', 'لسه مفيش أسعار'));
on('GET', '/api/products/search', async (c) => searchSnapshot((await loadSnapshot(c.env)) ?? fail(404, 'no_snapshot', 'no data'), c.url.searchParams));
on('GET', '/api/products/:id', async (c) => (await loadSnapshot(c.env))?.products[c.p[0]!]?.detail ?? fail(404, 'not_found', 'Product not found'));
on('POST', '/api/v2/admin/snapshot', async (c) => {
  const who = await needAdmin(c);
  const snap = await body(c, 8_000_000);
  const r = await storeSnapshot(c.env, snap as never);
  const tgN = T.tgEnabled(c.env) ? await T.processPriceDrops(c.env, r.drops) : 0;
  // In-app alerts for watchers (and Telegram for linked accounts) on their watched items.
  let watchN = 0;
  for (const d of r.drops) {
    const ws = (await c.env.DB.prepare('SELECT w.user_id, w.target, t.chat_id FROM watchlist w LEFT JOIN tg_links t ON t.user_id=w.user_id AND t.subscribed=1 WHERE w.product_id=?').bind(d.id).all<{ user_id: string; target: number | null; chat_id: string | null }>()).results;
    for (const w of ws) {
      const hit = w.target != null && d.price <= w.target;
      await c.env.DB.prepare('INSERT INTO alerts (id,user_id,type,title,body,product_id,read,created_at) VALUES (?,?,?,?,?,?,0,?)')
        .bind(uid('al_'), w.user_id, hit ? 'target_hit' : 'price_drop', hit ? `🎯 ${d.title} وصل للسعر اللي عايزه` : `📉 ${d.title} نزل ${Math.round(d.pct)}%`, `من ${Math.round(d.old)} لـ ${Math.round(d.price)} جنيه في ${d.store ?? ''}`, d.id, nowIso()).run();
      if (w.chat_id) await T.enqueue(c.env, w.chat_id, `${hit ? '🎯' : '📉'} <b>${d.title}</b> في قايمة متابعتك ${hit ? 'وصل للسعر اللي حددته!' : `نزل ${Math.round(d.pct)}%`}\n💸 ${Math.round(d.old)} ← <b>${Math.round(d.price)} ج</b>`, [[{ text: '🛒 افتح', url: `${c.env.SITE_URL}/product/${d.id}` }]]);
      watchN++;
    }
  }
  c.exec.waitUntil(T.drainOutbox(c.env));
  return { ok: true, products: r.products, drops: r.drops.length, telegramQueued: tgN, watchAlerts: watchN, by: who === 'ops-secret' ? 'refresh' : 'admin' };
});

// ---------------- auth (same contract as the static demo / Node API) ----------------
on('POST', '/api/auth/register', async (c) => {
  if (!(await rateLimit(c.env, `reg:${c.req.headers.get('cf-connecting-ip')}`, 10, 3600))) fail(429, 'rate_limited', 'محاولات كتير');
  return auth.register(c.env, await body(c));
});
on('POST', '/api/auth/login', async (c) => {
  if (!(await rateLimit(c.env, `login:${c.req.headers.get('cf-connecting-ip')}`, 20, 600))) fail(429, 'rate_limited', 'محاولات كتير — استنى 10 دقايق');
  return auth.login(c.env, await body(c));
});
on('POST', '/api/auth/google', async (c) => auth.google(c.env, await body(c)));
on('POST', '/api/auth/refresh', async (c) => auth.refresh(c.env, await body(c)));
on('POST', '/api/auth/logout', async (c) => auth.logout(c.env, await body(c)));
on('POST', '/api/auth/forgot', async () => ({ ok: true, demoCode: null, message: 'لو حسابك متسجل بإيميل Gmail، ادخل بزرار «المواصلة باستخدام Google» بنفس الإيميل وغيّر الباسورد من حسابي.' }));
on('GET', '/api/auth/me', async (c) => auth.publicUser((await need(c)).user, c.env));
on('PATCH', '/api/auth/me', async (c) => {
  const a = await need(c);
  const b = await body(c);
  const name = str(b.name, 60);
  await c.env.DB.prepare('UPDATE users SET name=COALESCE(?,name), locale=COALESCE(?,locale), bio=COALESCE(?,bio), city=COALESCE(?,city) WHERE id=?')
    .bind(name.length >= 2 ? name : null, b.locale === 'en' || b.locale === 'ar' ? b.locale : null, typeof b.bio === 'string' ? str(b.bio, 300) : null, typeof b.city === 'string' ? str(b.city, 60) : null, a.user.id).run();
  return auth.publicUser((await auth.getUser(c.env, a.user.id))!, c.env);
});
on('POST', '/api/auth/password', async (c) => auth.changePassword(c.env, (await need(c)).user, await body(c)));
on('POST', '/api/auth/logout-all', async (c) => {
  const a = await need(c);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(a.user.id), c.env.DB.prepare('UPDATE users SET token_version=token_version+1 WHERE id=?').bind(a.user.id)]);
  return { ok: true };
});
on('DELETE', '/api/auth/me', async (c) => {
  const a = await need(c);
  const id = a.user.id;
  await c.env.DB.batch(['sessions', 'watchlist', 'alerts', 'user_kv', 'xp_log', 'group_members'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(id)).concat([
    c.env.DB.prepare("UPDATE posts SET text='[محذوف]', attachments='[]', status='deleted' WHERE author_id=?").bind(id),
    c.env.DB.prepare("UPDATE comments SET text='[محذوف]', status='deleted' WHERE author_id=?").bind(id),
    c.env.DB.prepare("UPDATE messages SET text='[محذوف]', status='deleted' WHERE author_id=?").bind(id),
    c.env.DB.prepare('DELETE FROM reviews WHERE author_id=?').bind(id),
    c.env.DB.prepare('UPDATE tg_links SET user_id=NULL WHERE user_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(id),
  ]));
  return { ok: true };
});

// ---------------- watchlist / alerts / settings (synced) ----------------
async function cardOf(env: Env, id: string) {
  if (/^p[0-9a-f]{20}$/.test(id)) { const r = await env.DB.prepare('SELECT * FROM catalog WHERE id=?').bind(id).first<Record<string, any>>(); return r ? V5.toCard(r) : null; }
  const s = await loadSnapshot(env);
  return s?.all.find((p) => p.id === id) ?? s?.products[id]?.detail ?? null;
}
on('GET', '/api/watchlist', async (c) => {
  const a = await need(c);
  const rows = (await c.env.DB.prepare('SELECT * FROM watchlist WHERE user_id=? ORDER BY created_at DESC').bind(a.user.id).all<Record<string, any>>()).results;
  const items = [];
  for (const r of rows) {
    const product = await cardOf(c.env, r.product_id);
    if (product) items.push({ id: r.id, targetPriceEgp: r.target, createdAt: r.created_at, product });
  }
  return { items };
});
on('POST', '/api/watchlist', async (c) => {
  const a = await need(c);
  const b = await body(c);
  const product = await cardOf(c.env, str(b.productId, 80));
  if (!product) fail(404, 'not_found', 'Product not found');
  const limit = tierById(auth.effectiveTier(a.user))?.limits.watchlist ?? 10;
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM watchlist WHERE user_id=?').bind(a.user.id).first<{ n: number }>();
  const existing = await c.env.DB.prepare('SELECT * FROM watchlist WHERE user_id=? AND product_id=?').bind(a.user.id, b.productId).first<Record<string, any>>();
  if (existing) return { id: existing.id, targetPriceEgp: existing.target, createdAt: existing.created_at, product };
  if ((n?.n ?? 0) >= limit) fail(402, 'tier_limit', `باقتك بتسمح بـ ${limit} منتج في المراقبة — رقّي باقتك عشان تتابع أكتر 🥈👑💎`);
  const id = uid('w_');
  await c.env.DB.prepare('INSERT INTO watchlist (id,user_id,product_id,target,created_at) VALUES (?,?,?,?,?)').bind(id, a.user.id, b.productId, b.targetPriceEgp ?? null, nowIso()).run();
  return json({ id, targetPriceEgp: b.targetPriceEgp ?? null, createdAt: nowIso(), product }, 201);
});
on('PATCH', '/api/watchlist/:id', async (c) => {
  const a = await need(c);
  const b = await body(c);
  await c.env.DB.prepare('UPDATE watchlist SET target=? WHERE id=? AND user_id=?').bind(b.targetPriceEgp ?? null, c.p[0], a.user.id).run();
  const r = await c.env.DB.prepare('SELECT * FROM watchlist WHERE id=? AND user_id=?').bind(c.p[0], a.user.id).first<Record<string, any>>();
  if (!r) fail(404, 'not_found', 'Not in your watchlist');
  return { id: r!.id, targetPriceEgp: r!.target, createdAt: r!.created_at, product: await cardOf(c.env, r!.product_id) };
});
on('DELETE', '/api/watchlist/:id', async (c) => {
  const a = await need(c);
  await c.env.DB.prepare('DELETE FROM watchlist WHERE id=? AND user_id=?').bind(c.p[0], a.user.id).run();
  return { ok: true };
});
on('GET', '/api/alerts', async (c) => {
  const a = await need(c);
  const rows = (await c.env.DB.prepare('SELECT * FROM alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(a.user.id).all<Record<string, any>>()).results;
  return { items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, read: Boolean(r.read), createdAt: r.created_at, productId: r.product_id })) };
});
on('POST', '/api/alerts/:id/read', async (c) => {
  const a = await need(c);
  await c.env.DB.prepare('UPDATE alerts SET read=1 WHERE id=? AND user_id=?').bind(c.p[0], a.user.id).run();
  return { ok: true };
});
const defaultSettings = { channels: { webpush: true, email: false, telegram: false }, minDropPct: 5, quietHours: null };
on('GET', '/api/alerts/settings', async (c) => {
  const a = await need(c);
  const linked = await c.env.DB.prepare('SELECT chat_id FROM tg_links WHERE user_id=?').bind(a.user.id).first<{ chat_id: string }>();
  return { ...defaultSettings, ...parseJ(a.user.settings, {}), telegramChatId: linked?.chat_id ?? null, expoPushToken: null, hasWebPush: false };
});
on('PATCH', '/api/alerts/settings', async (c) => {
  const a = await need(c);
  const next = { ...parseJ(a.user.settings, {}), ...(await body(c)) };
  delete (next as Record<string, unknown>).telegramChatId;
  await c.env.DB.prepare('UPDATE users SET settings=? WHERE id=?').bind(JSON.stringify(next).slice(0, 8000), a.user.id).run();
  return { ...defaultSettings, ...next, telegramChatId: null, expoPushToken: null, hasWebPush: false };
});
on('POST', '/api/alerts/test', async (c) => {
  const a = await need(c);
  const alert = { id: uid('al_'), type: 'price_drop', title: 'تجربة تنبيه من صفقة 🔔', body: 'التنبيهات شغالة ومتزامنة بين الموقع والتطبيق.', read: false, createdAt: nowIso(), productId: null };
  await c.env.DB.prepare('INSERT INTO alerts (id,user_id,type,title,body,read,created_at) VALUES (?,?,?,?,?,0,?)').bind(alert.id, a.user.id, alert.type, alert.title, alert.body, alert.createdAt).run();
  return alert;
});
on('POST', '/api/push/:x', () => ({ ok: true }));

// ---------------- generic per-user sync (prefs, collections, profile extras…) ----------------
on('GET', '/api/v2/sync', async (c) => {
  const a = await need(c);
  const rows = (await c.env.DB.prepare('SELECT key, value, updated_at FROM user_kv WHERE user_id=?').bind(a.user.id).all<{ key: string; value: string; updated_at: string }>()).results;
  return { items: Object.fromEntries(rows.map((r) => [r.key, { value: parseJ(r.value, null), updatedAt: r.updated_at }])) };
});
on('PUT', '/api/v2/sync/:key', async (c) => {
  const a = await need(c);
  const key = c.p[0]!.slice(0, 60);
  const b = await body(c, 70_000);
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM user_kv WHERE user_id=?').bind(a.user.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= 60) fail(413, 'too_many_keys', 'Sync limit');
  const at = str(b.updatedAt, 40) || nowIso();
  const cur = await c.env.DB.prepare('SELECT updated_at FROM user_kv WHERE user_id=? AND key=?').bind(a.user.id, key).first<{ updated_at: string }>();
  if (cur && cur.updated_at > at) return { ok: false, conflict: true, updatedAt: cur.updated_at }; // last write wins
  await c.env.DB.prepare('INSERT OR REPLACE INTO user_kv (user_id,key,value,updated_at) VALUES (?,?,?,?)').bind(a.user.id, key, JSON.stringify(b.value ?? null), at).run();
  return { ok: true, updatedAt: at };
});
on('GET', '/api/v2/me', async (c) => {
  const a = await need(c);
  const pen = (await c.env.DB.prepare('SELECT * FROM penalties WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(a.user.id).all()).results;
  const tgl = await c.env.DB.prepare('SELECT chat_id FROM tg_links WHERE user_id=?').bind(a.user.id).first();
  return { user: auth.publicUser(a.user, c.env), rank: C.rankOf(a.user.xp), ranks: C.ranks, penalties: pen, telegramLinked: Boolean(tgl), xpLog: (await c.env.DB.prepare('SELECT amount, reason, at FROM xp_log WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(a.user.id).all()).results };
});

// ---------------- rules & moderation ----------------
on('POST', '/api/v2/rules/accept', async (c) => {
  const a = await need(c);
  const first = !a.user.rules_version;
  await c.env.DB.prepare('UPDATE users SET rules_version=? WHERE id=?').bind(C.RULES_VERSION, a.user.id).run();
  if (first) { await C.grantXp(c.env, a.user.id, C.XP.rules, 'rules'); await C.grantBadge(c.env, a.user, 'law-abiding'); }
  return { ok: true, version: C.RULES_VERSION };
});
on('GET', '/api/v2/moderation/log', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT p.id, p.rules, p.action, p.until, p.points, p.agent_id, p.where_, p.source, p.created_at, p.appeal_status, p.appeal_reply, u.handle FROM penalties p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50').all<Record<string, any>>()).results;
  return { items: rows.map((r) => ({ ...r, rules: parseJ(r.rules, []), member: r.handle ? `@${String(r.handle).slice(0, 3)}•••` : 'عضو' })) };
});
on('POST', '/api/v2/moderation/appeals', async (c) => {
  const a = await need(c);
  const b = await body(c);
  const r = await c.env.DB.prepare("UPDATE penalties SET appeal_text=?, appeal_status='pending', appeal_at=? WHERE id=? AND user_id=? AND appeal_status IS NULL").bind(str(b.text, 1000), nowIso(), str(b.penaltyId, 60), a.user.id).run();
  if (!r.meta.changes) fail(400, 'cannot_appeal', 'مينفعش تتظلم على العقوبة دي (أو اتظلمت قبل كده)');
  c.exec.waitUntil(new Promise((res) => setTimeout(res, 21_000)).then(() => C.judgeAppeals(c.env)));
  return { ok: true, messageAr: '⚖️ التظلم وصل للقاضية سلمى (🤖 وكيلة ذكية) وهتحكم فيه خلال دقيقة.' };
});
on('POST', '/api/v2/moderation/check', async (c) => {
  const a = await need(c);
  const b = await body(c);
  const r = await C.enforce(c.env, a, str(b.text, 4000), str(b.where, 20) || 'community', Array.isArray(b.files) ? b.files : [], str(b.contentId, 60) || 'external');
  return r ? { ok: false, ...r } : { ok: true };
});

// ---------------- media uploads (KV, small files; R2 isn't enabled on the free account) ----------------
on('POST', '/api/v2/media', async (c) => {
  const a = await need(c);
  const type = (c.req.headers.get('content-type') ?? '').split(';')[0]!;
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm)|application\/pdf)$/.test(type)) fail(415, 'unsupported', 'نوع الملف مش مسموح (صور، فيديو mp4/webm، PDF)');
  const max = type.startsWith('video/') ? 12_000_000 : 3_000_000;
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > max) fail(413, 'too_large', `أقصى حجم ${Math.round(max / 1e6)} ميجا`);
  if (!(await rateLimit(c.env, `kvw:${cairoDay()}`, 700, 86400))) fail(429, 'daily_cap', 'وصلنا للحد اليومي للرفع المجاني — جرّب بكرة');
  if (!(await rateLimit(c.env, `up:${a.user.id}`, 30, 86400))) fail(429, 'rate_limited', 'رفعت ملفات كتير النهارده');
  const id = uid('f_');
  const name = str(c.url.searchParams.get('name'), 120) || 'file';
  await c.env.KV.put(`media:${id}`, buf, { expirationTtl: 365 * 86400, metadata: { type, name } });
  await c.env.DB.prepare('INSERT INTO media (id,user_id,name,type,size,created_at) VALUES (?,?,?,?,?,?)').bind(id, a.user.id, name, type, buf.byteLength, nowIso()).run();
  return { id, name, type, size: buf.byteLength, url: `/api/v2/media/${id}` };
});
on('GET', '/api/v2/media/:id', async (c) => {
  const r = await c.env.KV.getWithMetadata<{ type: string }>(`media:${c.p[0]}`, 'arrayBuffer');
  if (!r.value) fail(404, 'not_found', 'File not found');
  return new Response(r.value, { headers: { 'content-type': r.metadata?.type ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
});

// ---------------- community ----------------
on('GET', '/api/v2/community/feed', async (c) => {
  await C.ensureSeed(c.env);
  const g = c.url.searchParams.get('group');
  const before = c.url.searchParams.get('before') ?? '9999';
  const posts = (await c.env.DB.prepare(`SELECT * FROM posts WHERE status='visible' AND created_at < ? ${g ? 'AND group_id=?' : ''} ORDER BY pinned DESC, created_at DESC LIMIT 30`).bind(before, ...(g ? [g] : [])).all<Record<string, any>>()).results;
  const ids = posts.map((p) => p.id);
  const comments = ids.length ? (await c.env.DB.prepare(`SELECT * FROM comments WHERE status='visible' AND post_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).bind(...ids).all<Record<string, any>>()).results : [];
  const authors = await C.authorsFor(c.env, [...posts.map((p) => p.author_id), ...comments.map((x) => x.author_id)]);
  const groups = (await c.env.DB.prepare('SELECT g.*, (SELECT COUNT(*) FROM group_members m WHERE m.group_id=g.id) AS members FROM groups_ g').all()).results;
  return {
    groups, authors,
    posts: posts.map((p) => ({ id: p.id, authorId: p.author_id, groupId: p.group_id, text: p.text, attachments: parseJ(p.attachments, []), productId: p.product_id, kind: p.kind, reactions: parseJ(p.reactions, {}), pinned: Boolean(p.pinned), warned: p.warned, at: p.created_at,
      comments: comments.filter((x) => x.post_id === p.id).map((x) => ({ id: x.id, authorId: x.author_id, text: x.text, attachments: parseJ(x.attachments, []), reactions: parseJ(x.reactions, {}), at: x.created_at, warned: x.warned })) })),
  };
});
async function requireRules(a: Authed) {
  if (a.user.rules_version !== C.RULES_VERSION) fail(428, 'rules_required', 'لازم توافق على قوانين المجتمع الأول ⚖️');
}
on('POST', '/api/v2/community/posts', async (c) => {
  const a = await need(c);
  await requireRules(a);
  const b = await body(c);
  const text = str(b.text, 4000);
  const attachments = C.cleanAttachments(b.attachments);
  if (!text && !attachments.length) fail(400, 'empty', 'اكتب حاجة');
  const id = uid('p_');
  const verdict = await C.enforce(c.env, a, text, 'community', attachments, id);
  if (verdict?.blocked) return json({ ok: false, ...verdict }, 422);
  await C.ensureSeed(c.env);
  await c.env.DB.prepare('INSERT INTO posts (id,author_id,group_id,text,attachments,product_id,kind,warned,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, a.user.id, str(b.groupId, 40) || 'general', text, JSON.stringify(attachments), str(b.productId, 80) || null, b.kind === 'deal' ? 'deal' : 'post', verdict ? verdict.penalty.rules.join(',') : null, nowIso()).run();
  await C.grantXp(c.env, a.user.id, C.XP.post, 'post');
  await C.grantBadge(c.env, a.user, 'first-post');
  if (attachments.some((x) => x.type.startsWith('image/'))) await C.grantBadge(c.env, a.user, 'photographer');
  // The group host agent replies to questions with a real AI answer.
  if (/[?؟]/.test(text)) c.exec.waitUntil((async () => {
    const g = await c.env.DB.prepare('SELECT host FROM groups_ WHERE id=?').bind(str(b.groupId, 40) || 'general').first<{ host: string }>();
    const ans = await agentReply(c.env, g?.host ?? 'hoda', text, { where: 'تعليق على منشور في مجتمع صفقة', userName: a.user.name });
    await c.env.DB.prepare('INSERT INTO comments (id,post_id,author_id,text,agent_id,created_at) VALUES (?,?,?,?,?,?)').bind(uid('c_'), id, `agent:${ans.agentId}`, ans.text, ans.agentId, nowIso()).run();
  })());
  return { ok: true, id, warning: verdict?.penalty ?? null };
});
on('POST', '/api/v2/community/posts/:id/comments', async (c) => {
  const a = await need(c);
  await requireRules(a);
  const b = await body(c);
  const text = str(b.text, 2000);
  if (!text) fail(400, 'empty', 'اكتب تعليق');
  const id = uid('c_');
  const verdict = await C.enforce(c.env, a, text, 'community', [], id);
  if (verdict?.blocked) return json({ ok: false, ...verdict }, 422);
  await c.env.DB.prepare('INSERT INTO comments (id,post_id,author_id,text,attachments,warned,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, c.p[0], a.user.id, text, JSON.stringify(C.cleanAttachments(b.attachments)), verdict ? verdict.penalty.rules.join(',') : null, nowIso()).run();
  await C.grantXp(c.env, a.user.id, C.XP.comment, 'comment');
  const mention = text.match(/@([a-z]+)/i)?.[1]?.toLowerCase();
  if (mention && agentById(mention)) c.exec.waitUntil((async () => {
    const ans = await agentReply(c.env, mention, text, { where: 'رد على تعليق في مجتمع صفقة', userName: a.user.name });
    await c.env.DB.prepare('INSERT INTO comments (id,post_id,author_id,text,agent_id,created_at) VALUES (?,?,?,?,?,?)').bind(uid('c_'), c.p[0], `agent:${ans.agentId}`, ans.text, ans.agentId, nowIso()).run();
  })());
  return { ok: true, id, warning: verdict?.penalty ?? null };
});
on('DELETE', '/api/v2/community/posts/:id', async (c) => {
  const a = await need(c);
  await c.env.DB.prepare("UPDATE posts SET status='deleted' WHERE id=? AND author_id=?").bind(c.p[0], a.user.id).run();
  return { ok: true };
});
on('POST', '/api/v2/community/react', async (c) => {
  const a = await need(c);
  const b = await body(c);
  const table = { post: 'posts', comment: 'comments', message: 'messages' }[str(b.type, 10)];
  const emoji = str(b.emoji, 8);
  if (!table || !emoji) fail(400, 'invalid', 'invalid');
  const row = await c.env.DB.prepare(`SELECT reactions, author_id FROM ${table} WHERE id=?`).bind(str(b.id, 60)).first<{ reactions: string; author_id: string }>();
  if (!row) fail(404, 'not_found', 'مش موجود');
  const r = C.toggle(parseJ(row!.reactions, {}), emoji, a.user.id);
  await c.env.DB.prepare(`UPDATE ${table} SET reactions=? WHERE id=?`).bind(JSON.stringify(r), str(b.id, 60)).run();
  if (row!.author_id !== a.user.id && !row!.author_id.startsWith('agent:') && r[emoji]?.includes(a.user.id)) await C.grantXp(c.env, row!.author_id, C.XP.reactionReceived, 'reaction');
  return { ok: true, reactions: r };
});
on('POST', '/api/v2/groups', async (c) => {
  const a = await need(c);
  await requireRules(a);
  if (auth.effectiveTier(a.user) === 'free' && a.user.xp < 150) fail(402, 'tier_limit', 'إنشاء جروب متاح من رتبة «صياد عروض» أو الباقة الفضية 🥈');
  const b = await body(c);
  const name = str(b.name, 40);
  if (name.length < 3) fail(400, 'invalid', 'اسم الجروب قصير');
  const v = await C.enforce(c.env, a, `${name} ${str(b.desc, 200)}`, 'community', [], 'group');
  if (v?.blocked) return json({ ok: false, ...v }, 422);
  const id = uid('g_');
  await c.env.DB.prepare('INSERT INTO groups_ (id,name,name_en,descr,emoji,color,host,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, name, name, str(b.desc, 200), str(b.emoji, 8) || '👥', str(b.color, 10) || '#0ea5e9', 'karim', a.user.id, nowIso()).run();
  await c.env.DB.prepare('INSERT INTO group_members (group_id,user_id,at) VALUES (?,?,?)').bind(id, a.user.id, nowIso()).run();
  return { ok: true, id };
});
on('POST', '/api/v2/groups/:id/join', async (c) => {
  const a = await need(c);
  const r = await c.env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id,user_id,at) VALUES (?,?,?)').bind(c.p[0], a.user.id, nowIso()).run();
  if (!r.meta.changes) await c.env.DB.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').bind(c.p[0], a.user.id).run();
  return { ok: true, joined: Boolean(r.meta.changes) };
});
on('GET', '/api/v2/leaderboard', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT id,name,picture,handle,tier,tier_until,xp,badges,created_at FROM users ORDER BY xp DESC LIMIT 50').all<auth.UserRow>()).results;
  return { items: rows.map((r) => ({ ...auth.memberCard(r), rank: C.rankOf(r.xp) })), ranks: C.ranks };
});
on('GET', '/api/v2/members/:id', async (c) => {
  const u = await auth.getUser(c.env, c.p[0]!);
  if (!u) fail(404, 'not_found', 'العضو مش موجود');
  return { ...auth.memberCard(u!), bio: u!.bio, city: u!.city, rank: C.rankOf(u!.xp), posts: (await c.env.DB.prepare("SELECT id,text,created_at FROM posts WHERE author_id=? AND status='visible' ORDER BY created_at DESC LIMIT 10").bind(u!.id).all()).results };
});

// ---------------- chat (rooms + DMs, polling) ----------------
on('GET', '/api/v2/chat/rooms', async (c) => {
  await C.ensureSeed(c.env);
  const rooms = (await c.env.DB.prepare("SELECT r.*, (SELECT COUNT(*) FROM messages m WHERE m.room_id=r.id AND m.created_at > ?) AS today FROM rooms r WHERE kind='room'").bind(new Date(Date.now() - 86400_000).toISOString()).all()).results;
  return { rooms };
});
on('POST', '/api/v2/chat/dm/:userId', async (c) => {
  const a = await need(c);
  const other = await auth.getUser(c.env, c.p[0]!);
  if (!other || other.id === a.user.id) fail(404, 'not_found', 'العضو مش موجود');
  const id = `dm:${[a.user.id, other!.id].sort().join('|')}`;
  await c.env.DB.prepare("INSERT OR IGNORE INTO rooms (id,name,kind,created_at) VALUES (?,?, 'dm', ?)").bind(id, 'رسائل خاصة', nowIso()).run();
  return { id, with: auth.memberCard(other!) };
});
on('GET', '/api/v2/chat/dms', async (c) => {
  const a = await need(c);
  const rows = (await c.env.DB.prepare("SELECT id FROM rooms WHERE kind='dm' AND id LIKE ?").bind(`%${a.user.id}%`).all<{ id: string }>()).results;
  const others = rows.map((r) => r.id.slice(3).split('|').find((x) => x !== a.user.id)!);
  return { items: rows.map((r, i) => ({ id: r.id, with: others[i] })), authors: await C.authorsFor(c.env, others) };
});
async function canRead(c: Ctx, room: string): Promise<Authed | null> {
  if (!room.startsWith('dm:')) return auth.authenticate(c.env, c.req);
  const a = await need(c);
  if (!room.slice(3).split('|').includes(a.user.id)) fail(403, 'forbidden', 'مش مسموح');
  return a;
}
on('GET', '/api/v2/chat/rooms/:id/messages', async (c) => {
  const room = decodeURIComponent(c.p[0]!);
  await canRead(c, room);
  const after = Number(c.url.searchParams.get('after') ?? 0);
  const rows = (await c.env.DB.prepare(after ? "SELECT * FROM messages WHERE room_id=? AND seq>? AND status='visible' ORDER BY seq LIMIT 100" : "SELECT * FROM (SELECT * FROM messages WHERE room_id=? AND status='visible' ORDER BY seq DESC LIMIT 60) ORDER BY seq").bind(...(after ? [room, after] : [room])).all<Record<string, any>>()).results;
  return {
    messages: rows.map((m) => ({ id: m.id, seq: m.seq, authorId: m.author_id, text: m.text, attachments: parseJ(m.attachments, []), reactions: parseJ(m.reactions, {}), productId: m.product_id, agentId: m.agent_id, ai: Boolean(m.agent_id), system: Boolean(m.system), at: m.created_at })),
    authors: await C.authorsFor(c.env, rows.map((m) => m.author_id)),
    pollMs: 4000,
  };
});
on('POST', '/api/v2/chat/rooms/:id/messages', async (c) => {
  const room = decodeURIComponent(c.p[0]!);
  const a = (await canRead(c, room)) ?? (await need(c));
  await requireRules(a);
  if (!(await rateLimit(c.env, `chat:${a.user.id}`, 8, 30))) fail(429, 'flood', 'براحة شوية — رسايل كتير ورا بعض (المادة 3.3)');
  const b = await body(c);
  const text = str(b.text, 2000);
  const attachments = C.cleanAttachments(b.attachments);
  if (!text && !attachments.length) fail(400, 'empty', 'اكتب رسالة');
  const verdict = await C.enforce(c.env, a, text, 'chat', attachments, 'msg');
  if (verdict?.blocked) {
    if (!room.startsWith('dm:') && verdict.penalty.points > 0) await C.insertMessage(c.env, room, `agent:${verdict.penalty.agentId}`, `${verdict.penalty.messageAr.split(':')[0]}: عضو اتعاقب — ${verdict.penalty.rules.map((r) => `المادة ${r}`).join('، ')} ⚖️`, [], null, verdict.penalty.agentId);
    return json({ ok: false, ...verdict }, 422);
  }
  const m = await C.insertMessage(c.env, room, a.user.id, text, attachments, str(b.productId, 80) || null, null);
  await C.grantXp(c.env, a.user.id, C.XP.chat, 'chat');
  if (verdict) await C.insertMessage(c.env, room, `agent:${verdict.penalty.agentId}`, verdict.penalty.messageAr, [], null, verdict.penalty.agentId);
  if (!room.startsWith('dm:')) c.exec.waitUntil(C.maybeAgentChat(c.env, room, text, a.user.name).catch((e) => console.log('agent chat', String(e))));
  return { ok: true, ...m, warning: verdict?.penalty ?? null };
});

// ---------------- reviews ----------------
on('GET', '/api/v2/reviews', async (c) => {
  const pid = str(c.url.searchParams.get('productId'), 80);
  const rows = (await c.env.DB.prepare("SELECT * FROM reviews WHERE product_id=? AND status='visible' ORDER BY created_at DESC LIMIT 100").bind(pid).all<Record<string, any>>()).results;
  return { items: rows.map((r) => ({ id: r.id, productId: r.product_id, authorId: r.author_id, stars: r.stars, title: r.title, text: r.text, pros: r.pros, cons: r.cons, attachments: parseJ(r.attachments, []), helpful: parseJ(r.helpful, []), verified: Boolean(r.verified), at: r.created_at })), authors: await C.authorsFor(c.env, rows.map((r) => r.author_id)) };
});
on('POST', '/api/v2/reviews', async (c) => {
  const a = await need(c);
  await requireRules(a);
  const b = await body(c);
  const text = str(b.text, 3000);
  const stars = Math.min(5, Math.max(1, Math.round(Number(b.stars) || 0)));
  if (text.length < 10) fail(400, 'too_short', 'اكتب تقييم 10 حروف على الأقل');
  const id = uid('rv_');
  const v = await C.enforce(c.env, a, `${str(b.title, 120)} ${text} ${str(b.pros, 300)} ${str(b.cons, 300)}`, 'review', [], id);
  if (v?.blocked) return json({ ok: false, ...v }, 422);
  const att = C.cleanAttachments(b.attachments);
  const watched = await c.env.DB.prepare('SELECT 1 FROM watchlist WHERE user_id=? AND product_id=?').bind(a.user.id, str(b.productId, 80)).first();
  await c.env.DB.prepare('INSERT OR REPLACE INTO reviews (id,product_id,author_id,stars,title,text,pros,cons,attachments,verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, str(b.productId, 80), a.user.id, stars, str(b.title, 120), text, str(b.pros, 300), str(b.cons, 300), JSON.stringify(att), watched ? 1 : 0, nowIso()).run();
  await C.grantXp(c.env, a.user.id, C.XP.review + (att.length ? C.XP.reviewMedia : 0), 'review');
  await C.grantBadge(c.env, a.user, 'reviewer');
  return { ok: true, id };
});
on('POST', '/api/v2/reviews/:id/helpful', async (c) => {
  const a = await need(c);
  const r = await c.env.DB.prepare('SELECT helpful FROM reviews WHERE id=?').bind(c.p[0]).first<{ helpful: string }>();
  if (!r) fail(404, 'not_found', 'مش موجود');
  const h = parseJ<string[]>(r!.helpful, []);
  const next = h.includes(a.user.id) ? h.filter((x) => x !== a.user.id) : [...h, a.user.id];
  await c.env.DB.prepare('UPDATE reviews SET helpful=? WHERE id=?').bind(JSON.stringify(next), c.p[0]).run();
  return { ok: true, helpful: next.length };
});

// ---------------- agents ----------------
on('GET', '/api/v2/agents', async (c) => {
  const cfg = (await c.env.DB.prepare('SELECT * FROM agent_config').all<Record<string, any>>()).results;
  const stats = (await c.env.DB.prepare('SELECT agent_id, COUNT(*) AS n, SUM(fallback) AS offline FROM agent_logs WHERE at > ? GROUP BY agent_id').bind(new Date(Date.now() - 86400_000).toISOString()).all<Record<string, any>>()).results;
  return {
    aiAvailable: (await aiBudgetLeft(c.env)) > 0, model: c.env.CHAT_MODEL,
    items: agents.map((a) => { const k = cfg.find((x) => x.id === a.id); const s = stats.find((x) => x.agent_id === a.id); return { id: a.id, name: a.name, team: a.team, title: a.title, enabled: k ? Boolean(k.enabled) : true, mood: k?.mood ?? null, actions24h: s?.n ?? 0, offline24h: s?.offline ?? 0 }; }),
  };
});
on('POST', '/api/v2/agents/:id/ask', async (c) => {
  const a = await auth.authenticate(c.env, c.req);
  const who = a?.user.id ?? `ip:${c.req.headers.get('cf-connecting-ip')}`;
  await C.askLimit(c.env, who, a ? auth.effectiveTier(a.user) : 'free');
  const b = await body(c);
  const msg = str(b.message, 1200);
  if (msg.length < 2) fail(400, 'invalid_body', 'اكتب سؤالك');
  const history = Array.isArray(b.history) ? b.history.slice(-6).map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: str(m.content, 1000) })) : [];
  return agentReply(c.env, c.p[0]!, msg, { where: str(b.where, 80) || 'صفحة الوكيل في موقع صفقة', userName: a?.user.name, history });
});
// The old /api/chat contract (assistant page) now answers with a real agent.
on('POST', '/api/chat', async (c) => {
  const a = await auth.authenticate(c.env, c.req);
  await C.askLimit(c.env, a?.user.id ?? `ip:${c.req.headers.get('cf-connecting-ip')}`, a ? auth.effectiveTier(a.user) : 'free');
  const b = await body(c);
  const msg = str(b.message, 1200);
  if (msg.length < 2) fail(400, 'invalid_body', 'Say what you want');
  const ans = await agentReply(c.env, 'saqr', msg, { where: 'المساعد الذكي في صفقة', userName: a?.user.name });
  const snap = await loadSnapshot(c.env);
  return { reply: ans.text, provider: ans.ai ? `workers-ai:${ans.model}` : 'offline', ai: ans.ai, agentId: ans.agentId, products: ans.productIds.map((id) => snap?.products[id]?.detail).filter(Boolean) };
});

// ---------------- payments & codes ----------------
on('POST', '/api/v2/codes/check', async (c) => pay.checkCode(c.env, await need(c), await body(c)));
on('POST', '/api/v2/codes/redeem', async (c) => pay.redeemUpgrade(c.env, await need(c), await body(c)));
on('POST', '/api/v2/payments', async (c) => {
  const a = await need(c);
  const b = await body(c);
  if (b.test === true && opsSecretOk(c)) a.admin = true;
  return pay.createPayment(c.env, a, b);
});
on('GET', '/api/v2/payments/mine', async (c) => {
  const a = await need(c);
  return { items: (await c.env.DB.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(a.user.id).all<Record<string, unknown>>()).results.map((p) => pay.paymentOut(c.env, p)) };
});
on('POST', '/api/v2/payments/:id/receipt', async (c) => pay.submitReceipt(c.env, await need(c), c.p[0]!, await body(c, 2_400_000)));

// ---------------- telegram ----------------
on('POST', '/api/v2/telegram/webhook', async (c) => {
  if (!T.tgEnabled(c.env)) fail(404, 'disabled', 'Telegram is not configured');
  if (c.req.headers.get('x-telegram-bot-api-secret-token') !== (await T.webhookSecret(c.env))) fail(401, 'bad_secret', 'nope');
  const u = await body(c, 200_000);
  c.exec.waitUntil(T.handleUpdate(c.env, u).catch((e) => console.log('tg update', String(e))));
  return { ok: true };
});
on('POST', '/api/v2/telegram/link', async (c) => {
  if (!T.tgEnabled(c.env)) fail(404, 'disabled', 'Telegram is not configured');
  return T.createLinkCode(c.env, (await need(c)).user.id);
});

// ---------------- admin ----------------
on('GET', '/api/v2/admin/whoami', async (c) => ({ admin: await needAdmin(c) }));
on('GET', '/api/v2/admin/stats', async (c) => { await needAdmin(c); return admin.stats(c.env); });
on('GET', '/api/v2/admin/payments', async (c) => { await needAdmin(c); return admin.listPayments(c.env, c.url.searchParams.get('status') ?? 'all'); });
on('GET', '/api/v2/admin/payments/:id/receipt', async (c) => {
  await needAdmin(c);
  const r = await c.env.KV.getWithMetadata<{ mime: string }>(`receipt:${c.p[0]}`);
  if (!r.value) fail(404, 'not_found', 'الإيصال اتمسح أو مش موجود');
  return { mime: r.metadata?.mime ?? 'image/jpeg', data: r.value };
});
on('POST', '/api/v2/admin/payments/:id/:action', async (c) => {
  const who = await needAdmin(c);
  if (c.p[1] === 'reverify') return pay.reverify(c.env, c.p[0]!);
  const act = c.p[1] as 'approve' | 'reject' | 'revoke';
  if (!['approve', 'reject', 'revoke'].includes(act)) fail(400, 'invalid', 'invalid');
  const r = await pay.decidePayment(c.env, who, c.p[0]!, act, str((await body(c)).note, 300));
  await admin.audit(c.env, who, `payment.${act}`, { id: c.p[0] });
  return r;
});
on('DELETE', '/api/v2/admin/payments/:id', async (c) => {
  const who = await needAdmin(c);
  const p = await c.env.DB.prepare('SELECT user_id, code FROM payments WHERE id=?').bind(c.p[0]).first<{ user_id: string; code: string | null }>();
  await c.env.KV.delete(`receipt:${c.p[0]}`);
  await c.env.DB.prepare('DELETE FROM payments WHERE id=?').bind(c.p[0]).run();
  await c.env.DB.prepare('DELETE FROM code_redemptions WHERE payment_id=?').bind(c.p[0]).run();
  await admin.audit(c.env, who, 'payment.delete', { id: c.p[0], user: p?.user_id });
  return { ok: true };
});
on('GET', '/api/v2/admin/members', async (c) => {
  await needAdmin(c);
  const q = `%${str(c.url.searchParams.get('q'), 80)}%`;
  const rows = (await c.env.DB.prepare('SELECT id,email,name,picture,handle,tier,tier_until,tier_status,xp,badges,created_at,last_seen,google_sub IS NOT NULL AS google FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY created_at DESC LIMIT 100').bind(q, q).all<Record<string, any>>()).results;
  return { items: rows.map((r) => ({ ...r, tier: auth.effectiveTier(r as auth.UserRow), badges: parseJ(r.badges, []), rank: C.rankOf(r.xp) })) };
});
on('POST', '/api/v2/admin/members/:id/tier', async (c) => { const who = await needAdmin(c); const b = await body(c); return admin.runAction(c.env, who, 'set_tier', { user: c.p[0], tier: b.tier, days: b.days }); });
on('POST', '/api/v2/admin/members/:id/penalty', async (c) => {
  const who = await needAdmin(c);
  const b = await body(c);
  const action = ['warning', 'mute', 'ban', 'clear'].includes(b.action) ? b.action : 'warning';
  if (action === 'clear') await c.env.DB.prepare("UPDATE penalties SET appeal_status='accepted', appeal_reply='اتشالت بواسطة الإدارة' WHERE user_id=? AND until > ?").bind(c.p[0], nowIso()).run();
  else await c.env.DB.prepare('INSERT INTO penalties (id,user_id,rules,action,until,points,reason,agent_id,where_,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(uid('pen_'), c.p[0], JSON.stringify([str(b.rule, 6) || '1.2']), action, action === 'warning' ? null : new Date(Date.now() + (Number(b.minutes) || 60) * 60_000).toISOString(), 0, str(b.reason, 300) || 'قرار الإدارة', 'nabil', 'admin', 'admin', nowIso()).run();
  await admin.audit(c.env, who, `member.${action}`, { id: c.p[0] });
  return { ok: true };
});
on('GET', '/api/v2/admin/codes', async (c) => { await needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM codes ORDER BY created_at DESC').all<Record<string, any>>()).results.map((r) => ({ ...r, tiers: parseJ(r.tiers, []), active: Boolean(r.active) })) }; });
on('POST', '/api/v2/admin/codes', async (c) => admin.upsertCode(c.env, await needAdmin(c), await body(c)));
on('DELETE', '/api/v2/admin/codes/:code', async (c) => { const who = await needAdmin(c); await c.env.DB.prepare('DELETE FROM codes WHERE code=?').bind(decodeURIComponent(c.p[0]!)).run(); await admin.audit(c.env, who, 'code.delete', { code: c.p[0] }); return { ok: true }; });
on('GET', '/api/v2/admin/moderation', async (c) => {
  await needAdmin(c);
  const rows = (await c.env.DB.prepare('SELECT p.*, u.name AS user_name, u.email AS user_email FROM penalties p LEFT JOIN users u ON u.id=p.user_id ORDER BY (p.appeal_status=\'pending\') DESC, p.created_at DESC LIMIT 100').all<Record<string, any>>()).results;
  return { items: rows.map((r) => ({ ...r, rules: parseJ(r.rules, []) })) };
});
on('POST', '/api/v2/admin/moderation/:id/appeal', async (c) => {
  const who = await needAdmin(c);
  const b = await body(c);
  await c.env.DB.prepare('UPDATE penalties SET appeal_status=?, appeal_reply=? WHERE id=?').bind(b.accept ? 'accepted' : 'rejected', str(b.reply, 500) || (b.accept ? 'اتقبل بقرار الإدارة' : 'اترفض بقرار الإدارة'), c.p[0]).run();
  await admin.audit(c.env, who, 'appeal.decide', { id: c.p[0], accept: b.accept });
  return { ok: true };
});
on('POST', '/api/v2/admin/moderation/judge', async (c) => { await needAdmin(c); return { judged: await C.judgeAppeals(c.env) }; });
on('GET', '/api/v2/admin/content', async (c) => {
  await needAdmin(c);
  const t = { posts: 'posts', comments: 'comments', messages: 'messages', reviews: 'reviews' }[c.url.searchParams.get('type') ?? 'posts'] ?? 'posts';
  const rows = (await c.env.DB.prepare(`SELECT * FROM ${t} ORDER BY created_at DESC LIMIT 100`).all<Record<string, any>>()).results;
  return { items: rows, authors: await C.authorsFor(c.env, rows.map((r) => r.author_id)) };
});
on('POST', '/api/v2/admin/content/:type/:id/:status', async (c) => {
  const who = await needAdmin(c);
  const t = { post: 'posts', comment: 'comments', message: 'messages', review: 'reviews' }[c.p[0]!];
  if (!t || !['visible', 'hidden'].includes(c.p[2]!)) fail(400, 'invalid', 'invalid');
  await c.env.DB.prepare(`UPDATE ${t} SET status=? WHERE id=?`).bind(c.p[2], c.p[1]).run();
  await admin.audit(c.env, who, `content.${c.p[2]}`, { t, id: c.p[1] });
  return { ok: true };
});
on('POST', '/api/v2/admin/posts/:id/pin', async (c) => { await needAdmin(c); await c.env.DB.prepare('UPDATE posts SET pinned=1-pinned WHERE id=?').bind(c.p[0]).run(); return { ok: true }; });
on('GET', '/api/v2/admin/agents', async (c) => {
  await needAdmin(c);
  const cfg = (await c.env.DB.prepare('SELECT * FROM agent_config').all<Record<string, any>>()).results;
  const usage = (await c.env.DB.prepare('SELECT * FROM ai_usage ORDER BY day DESC LIMIT 60').all()).results;
  return { items: agents.map((a) => ({ ...a, config: cfg.find((x) => x.id === a.id) ?? null })), usage, budget: Number(c.env.AI_DAILY_CALL_BUDGET), left: await aiBudgetLeft(c.env), models: { chat: c.env.CHAT_MODEL, fallback: c.env.CHAT_FALLBACK_MODEL, vision: c.env.VISION_MODEL } };
});
on('POST', '/api/v2/admin/agents/:id', async (c) => admin.runAction(c.env, await needAdmin(c), 'set_agent', { ...(await body(c)), id: c.p[0] }));
on('GET', '/api/v2/admin/agents/logs', async (c) => { await needAdmin(c); const id = c.url.searchParams.get('agent'); return { items: (await c.env.DB.prepare(`SELECT * FROM agent_logs ${id ? 'WHERE agent_id=?' : ''} ORDER BY id DESC LIMIT 100`).bind(...(id ? [id] : [])).all()).results }; });
on('POST', '/api/v2/admin/agents/:id/test', async (c) => { await needAdmin(c); return agentReply(c.env, c.p[0]!, str((await body(c)).message, 1000), { where: 'اختبار من لوحة الإدارة' }); });
on('GET', '/api/v2/admin/announcements', async (c) => { await needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50').all()).results }; });
on('POST', '/api/v2/admin/announcements', async (c) => {
  const who = await needAdmin(c);
  const b = await body(c);
  await admin.runAction(c.env, who, 'announce', b);
  if (b.telegram && T.tgEnabled(c.env)) {
    const subs = (await c.env.DB.prepare('SELECT chat_id FROM tg_links WHERE subscribed=1').all<{ chat_id: string }>()).results;
    for (const s of subs) await T.enqueue(c.env, s.chat_id, `📣 <b>${str(b.title, 120)}</b>\n\n${str(b.body, 1000)}`);
    c.exec.waitUntil(T.drainOutbox(c.env));
  }
  return { ok: true };
});
on('POST', '/api/v2/admin/announcements/:id/toggle', async (c) => { await needAdmin(c); await c.env.DB.prepare('UPDATE announcements SET active=1-active WHERE id=?').bind(c.p[0]).run(); return { ok: true }; });
on('GET', '/api/v2/admin/settings', async (c) => { await needAdmin(c); return { items: (await c.env.DB.prepare('SELECT * FROM settings').all()).results, telegram: T.tgEnabled(c.env), pay: pay.payInfo(c.env), audit: (await c.env.DB.prepare('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 50').all()).results }; });
on('POST', '/api/v2/admin/ops', async (c) => admin.opsChat(c.env, await needAdmin(c), await body(c)));
on('POST', '/api/v2/admin/ops/confirm', async (c) => { const who = await needAdmin(c); const b = await body(c); return admin.runAction(c.env, who, str(b.name, 40), b.args ?? {}); });
on('POST', '/api/v2/admin/telegram/setup', async (c) => {
  await needAdmin(c);
  if (!T.tgEnabled(c.env)) fail(400, 'disabled', 'TELEGRAM_BOT_TOKEN مش متسجل');
  const url = `${c.url.origin}/api/v2/telegram/webhook`;
  const r1 = await T.tg(c.env, 'setWebhook', { url, secret_token: await T.webhookSecret(c.env), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
  const r2 = await T.tg(c.env, 'setMyCommands', { commands: [
    { command: 'start', description: 'اشترك في تنبيهات العروض' }, { command: 'deals', description: 'أحسن العروض دلوقتي' }, { command: 'search', description: 'دوّر على منتج وسعره' },
    { command: 'settings', description: 'الأقسام ونسبة النزول' }, { command: 'digest', description: 'ملخص النهارده' }, { command: 'link', description: 'اربط حسابك في صفقة' }, { command: 'stop', description: 'وقف التنبيهات' } ] });
  const r3 = await T.tg(c.env, 'setMyDescription', { description: '🔥 صفقة — بنقارن أسعار الإلكترونيات في مصر ونبعتلك العروض الحقيقية أول ما الأسعار تنزل. ردود بوكلاء ذكاء اصطناعي 🤖' });
  const r4 = await T.tg(c.env, 'setMyShortDescription', { short_description: 'عروض وأسعار حقيقية من متاجر مصر 🇪🇬🔥' });
  return { webhook: r1.ok, commands: r2.ok, description: r3.ok && r4.ok, url };
});
on('POST', '/api/v2/admin/telegram/digest', async (c) => { await needAdmin(c); const n = await T.queueDigests(c.env); c.exec.waitUntil(T.drainOutbox(c.env)); return { queued: n }; });

V5.register(on, auth.authenticate);
Smart.registerSmart(on, auth.authenticate);
registerSystems(on, { needAdmin, me: async (env, req) => { const a = await auth.authenticate(env, req).catch(() => null); if (!a) fail(401, 'auth', 'سجّل دخول الأول'); return a!.user.id; } });
Hunter.registerHunter(on);

// ---------------- runtime ----------------
function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.safqa-admin\.pages\.dev$/.test(origin);
  return {
    'access-control-allow-origin': ok ? origin : allowed[0]!,
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-safqa-ops',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

export default {
  async fetch(req: Request, rawEnv: Env, exec: ExecutionContext): Promise<Response> {
    const env: Env = { ...rawEnv, DB: Budget.metered(rawEnv.DB) }; // every write is metered against the daily budget
    Budget.setJob('api');
    const ch = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
    const url = new URL(req.url);
    if (url.pathname === '/' ) return json({ name: 'Safqa edge API', ok: true, docs: 'https://github.com/Omar08263/safqa/blob/main/docs/backend.md' }, 200, ch);
    try {
      for (const [m, re, h] of routes) {
        if (m !== req.method) continue;
        const match = url.pathname.match(re);
        if (!match) continue;
        const out = await h({ req, env, url, p: match.slice(1), exec });
        if (Budget.pending()) exec.waitUntil(Budget.flush(env).catch(() => undefined));
        const res = out instanceof Response ? out : json(out);
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(ch)) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      }
      return json({ error: { code: 'not_found', message: `No route for ${req.method} ${url.pathname}` } }, 404, ch);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, ch);
      console.log('error', req.method, url.pathname, String((e as Error).stack ?? e));
      return json({ error: { code: 'internal', message: 'حصلت مشكلة — جرّب تاني' } }, 500, ch);
    }
  },
  async scheduled(ev: ScheduledController, rawEnv: Env, exec: ExecutionContext) {
    const env: Env = { ...rawEnv, DB: Budget.metered(rawEnv.DB) };
    const d = new Date(ev.scheduledTime);
    const cairoH = (d.getUTCHours() + 2) % 24;
    if (ev.cron === '2,17,32,47 * * * *') {
      // العقل الرئيسي: sense → diagnose → safe fixes → verify → proposals/issue drafts (own invocation budget).
      exec.waitUntil((async () => { Budget.setJob('brain'); await brainTick(env).catch((e) => console.log('brain', String(e))); await Budget.flush(env, true); })());
      return;
    }
    if (ev.cron === '5-55/10 * * * *') {
      // v5 ingestion agents: new arrivals + rotating price sweep, then adaptive recrawl, then smart notifications.
      exec.waitUntil((async () => {
        await ensureState(env);
        Budget.setJob('ingest'); await Ingest.ingestTick(env).catch((e) => console.log('ingest', String(e)));
        Budget.setJob('recrawl'); await Ingest.adaptiveRecrawl(env, 3).catch((e) => console.log('recrawl', String(e)));
        Budget.setJob('smart'); await Smart.smartTick(env, d).catch((e) => console.log('smart', String(e)));
        await Budget.flush(env, true);
      })());
      return;
    }
    exec.waitUntil((async () => {
      Budget.setJob('cron');
      await C.judgeAppeals(env).catch(() => 0);
      if (d.getUTCMinutes() < 10) {
        await env.DB.prepare("UPDATE users SET tier='free', tier_until=NULL WHERE tier<>'free' AND tier_until < ?").bind(nowIso()).run();
        await env.DB.prepare('DELETE FROM ai_cache WHERE exp < ?').bind(Date.now()).run();
        await env.DB.prepare('DELETE FROM rate WHERE reset < ?').bind(Math.floor(Date.now() / 1000)).run();
        await env.DB.prepare('DELETE FROM sessions WHERE exp < ?').bind(Date.now()).run();
      }
      if (T.tgEnabled(env) && cairoH === 9 && d.getUTCMinutes() >= 30 && d.getUTCMinutes() < 40) await T.queueDigests(env);
      await autopilotTick(env, d).catch((e) => console.log('autopilot', String(e)));
      await T.drainOutbox(env);
      // Last: priority recrawl of hot/watched products uses the remaining subrequest budget of this invocation.
      await Ingest.adaptiveRecrawl(env, 3).catch((e) => console.log('recrawl', String(e)));
      await Budget.flush(env, true);
    })());
  },
};
