// @SafqaDealsBot — Egyptian-Arabic Telegram bot powered by the real AI agents.
// Active only when the TELEGRAM_BOT_TOKEN secret is set.
import { agentReply, llm, retrieveProducts, type ProductHit } from './ai';
import { type Env, nowIso, parseJ, sha256, uid } from './util';

export const BOT_USERNAME = 'SafqaDealsBot';
export const tgEnabled = (env: Env) => Boolean(env.TELEGRAM_BOT_TOKEN);
export async function webhookSecret(env: Env) {
  return (await sha256(`safqa-tg:${env.TELEGRAM_BOT_TOKEN}`)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

type Btn = { text: string; callback_data?: string; url?: string };
export async function tg(env: Env, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!j.ok) console.log('tg', method, j.description);
  return j;
}
const send = (env: Env, chat: string | number, text: string, buttons?: Btn[][]) =>
  tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number | null | undefined) => (n == null ? '؟' : Math.round(n).toLocaleString('en-US'));
const productUrl = (env: Env, id: string) => `${env.SITE_URL}/product/${id}`;

export const CATS: [string, string][] = [['phones', '📱 موبايلات'], ['audio', '🎧 سماعات'], ['tvs', '📺 شاشات'], ['appliances', '🏠 أجهزة منزلية'], ['lifestyle', '⌚ ساعات']];
const MENU: Btn[][] = [
  [{ text: '🔥 أحسن العروض', callback_data: 'deals' }, { text: '🔎 دوّر على منتج', callback_data: 'search' }],
  [{ text: '⚙️ تنبيهاتي', callback_data: 'settings' }, { text: '📰 ملخص النهارده', callback_data: 'digest' }],
  [{ text: '🤖 اسأل صقر', callback_data: 'ask' }, { text: '🔗 اربط حسابي', callback_data: 'link' }],
  [{ text: '🌐 افتح صفقة', url: 'https://safqaeg.pages.dev' }],
];

interface Link { chat_id: string; user_id: string | null; subscribed: number; categories: string; threshold: number; digest: number; first_name: string | null; mode: string | null }
async function getLink(env: Env, chat: string) {
  return env.DB.prepare('SELECT * FROM tg_links WHERE chat_id=?').bind(chat).first<Link>();
}

function dealLine(env: Env, p: ProductHit, i: number) {
  return `${i + 1}. <b>${esc(p.title_ar)}</b>\n   💰 ${fmt(p.price)} ج — ${esc(p.store ?? '')}${p.discount ? ` · خصم ${Math.round(p.discount)}%` : ''} · ⭐ ${Math.round(p.deal_score ?? 0)}/100`;
}
async function topDeals(env: Env, cats: string[], limit = 5) {
  const where = cats.length ? `WHERE category IN (${cats.map(() => '?').join(',')})` : '';
  return (await env.DB.prepare(`SELECT id,title_ar,title_en,brand,category,price,store,deal_score,discount FROM products ${where} ORDER BY deal_score DESC LIMIT ?`).bind(...cats, limit).all<ProductHit>()).results;
}

async function sendDeals(env: Env, chat: string, cats: string[]) {
  const ps = await topDeals(env, cats, 5);
  if (!ps.length) return send(env, chat, 'لسه مفيش عروض في الأقسام دي 🤷‍♂️', MENU);
  return send(env, chat, `🔥 <b>أحسن 5 عروض دلوقتي</b> (أسعار حقيقية من آخر تحديث)\n\n${ps.map((p, i) => dealLine(env, p, i)).join('\n\n')}`, ps.slice(0, 5).map((p, i) => [{ text: `${i + 1}. افتح ${p.title_ar.slice(0, 28)}`, url: productUrl(env, p.id) }]));
}

async function sendSettings(env: Env, chat: string, l: Link, messageId?: number) {
  const cats = parseJ<string[]>(l.categories, []);
  const rows: Btn[][] = [];
  for (let i = 0; i < CATS.length; i += 2) rows.push(CATS.slice(i, i + 2).map(([id, label]) => ({ text: `${cats.includes(id) ? '✅' : '⬜'} ${label}`, callback_data: `cat:${id}` })));
  rows.push([5, 10, 15, 25].map((t) => ({ text: `${l.threshold === t ? '🎯' : ''}${t}%`, callback_data: `th:${t}` })));
  rows.push([{ text: l.digest ? '📰 الملخص اليومي: شغال ✅' : '📰 الملخص اليومي: مقفول ⬜', callback_data: 'dg' }]);
  rows.push([{ text: l.subscribed ? '🔕 وقف كل التنبيهات' : '🔔 شغّل التنبيهات', callback_data: l.subscribed ? 'stop' : 'sub' }, { text: '⬅️ القائمة', callback_data: 'menu' }]);
  const text = `⚙️ <b>إعدادات التنبيهات</b>\n\nالأقسام: ${cats.length ? cats.map((c) => CATS.find((x) => x[0] === c)?.[1]).join('، ') : 'كل الأقسام'}\nأقل نزول في السعر عشان أبعتلك: <b>${l.threshold}%</b>\nالحالة: ${l.subscribed ? '🔔 مشترك' : '🔕 موقوف'}`;
  if (messageId) return tg(env, 'editMessageText', { chat_id: chat, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  return send(env, chat, text, rows);
}

export async function buildDigest(env: Env, cats: string[] = []) {
  const ps = await topDeals(env, cats, 6);
  const drops = (await env.DB.prepare('SELECT product_id, old_price, new_price, drop_pct, headline FROM price_events WHERE at > ? ORDER BY drop_pct DESC LIMIT 5').bind(new Date(Date.now() - 86400_000).toISOString()).all<{ product_id: string; old_price: number; new_price: number; drop_pct: number; headline: string }>()).results;
  const meta = parseJ<{ recordedAt?: string }>((await env.DB.prepare("SELECT value FROM settings WHERE key='snapshot_meta'").first<{ value: string }>())?.value, {});
  const facts = `${ps.map((p) => `${p.title_ar}: ${fmt(p.price)} ج في ${p.store} (تقييم ${Math.round(p.deal_score ?? 0)})`).join('\n')}\nنزول أسعار آخر 24 ساعة: ${drops.length ? drops.map((d) => `${d.product_id} من ${fmt(d.old_price)} لـ ${fmt(d.new_price)} (-${Math.round(d.drop_pct)}%)`).join('، ') : 'مفيش'}`;
  const intro = await llm(env, 'digest', [
    { role: 'system', content: 'انتي "همسة" 📰 وكيلة ذكاء اصطناعي ومحررة الملخص اليومي في صفقة. اكتبي افتتاحية من جملتين بالعامية المصرية بتشد الانتباه بس صادقة 100% ومن غير مبالغة، بإيموجي. استخدمي بس الأرقام اللي في البيانات.' },
    { role: 'user', content: facts },
  ], 150, 0.8);
  const head = intro?.text ?? '☀️ صباح التوفير! دي أحسن العروض الحقيقية النهارده:';
  return `📰 <b>ملخص صفقة اليومي</b>\n${esc(head)}\n\n${ps.map((p, i) => dealLine(env, p, i)).join('\n\n')}\n\n🕒 آخر تحديث للأسعار: ${meta.recordedAt ? new Date(meta.recordedAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : '؟'}\n🤖 مكتوب بواسطة همسة (وكيلة ذكاء اصطناعي)`;
}

async function searchReply(env: Env, chat: string, q: string) {
  const hits = await retrieveProducts(env, q, 5);
  const ans = await agentReply(env, 'saqr', q, { where: 'بوت تيليجرام @SafqaDealsBot (رد قصير)' });
  const list = hits.map((p, i) => dealLine(env, p, i)).join('\n\n');
  return send(env, chat, `${esc(ans.text)}${ans.ai ? '' : ''}\n\n🔎 <b>نتايج من صفقة:</b>\n${list}\n\n<i>🤖 ${ans.ai ? 'رد صقر بالذكاء الاصطناعي' : 'رد صقر (وضع أوفلاين)'}</i>`, hits.slice(0, 3).map((p) => [{ text: `🛒 ${p.title_ar.slice(0, 30)} — ${fmt(p.price)} ج`, url: productUrl(env, p.id) }]));
}

export async function handleUpdate(env: Env, u: Record<string, any>) {
  if (u.callback_query) {
    const cq = u.callback_query;
    const chat = String(cq.message?.chat?.id ?? cq.from.id);
    const data = String(cq.data ?? '');
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    let l = await getLink(env, chat);
    if (!l) { await subscribe(env, chat, cq.from?.first_name); l = (await getLink(env, chat))!; }
    if (data === 'deals') return sendDeals(env, chat, parseJ(l.categories, []));
    if (data === 'menu') return send(env, chat, 'القائمة 👇', MENU);
    if (data === 'digest') return send(env, chat, await buildDigest(env, parseJ(l.categories, [])), MENU);
    if (data === 'settings') return sendSettings(env, chat, l);
    if (data === 'search') { await env.DB.prepare("UPDATE tg_links SET mode='search' WHERE chat_id=?").bind(chat).run(); return send(env, chat, '🔎 اكتبلي اسم المنتج اللي بتدوّر عليه (مثلاً: ايفون 17 أو تكييف شارب)'); }
    if (data === 'ask') { await env.DB.prepare("UPDATE tg_links SET mode='ask' WHERE chat_id=?").bind(chat).run(); return send(env, chat, '🦅 أنا صقر، كبير صيادي العروض (🤖 وكيل ذكي). اسألني أي حاجة عن الأسعار والعروض!'); }
    if (data === 'link') return send(env, chat, l.user_id ? '✅ حسابك في صفقة مربوط بالفعل. التنبيهات بتاعة قايمة متابعتك هتوصلك هنا.' : '🔗 عشان تربط حسابك: افتح صفقة ← حسابي ← «اربط تيليجرام»، وهيفتحلك البوت مربوط على طول.', [[{ text: '🌐 افتح حسابي في صفقة', url: `${env.SITE_URL}/account` }]]);
    if (data === 'stop' || data === 'sub') await env.DB.prepare('UPDATE tg_links SET subscribed=? WHERE chat_id=?').bind(data === 'sub' ? 1 : 0, chat).run();
    if (data === 'dg') await env.DB.prepare('UPDATE tg_links SET digest=1-digest WHERE chat_id=?').bind(chat).run();
    if (data.startsWith('th:')) await env.DB.prepare('UPDATE tg_links SET threshold=? WHERE chat_id=?').bind(Number(data.slice(3)) || 5, chat).run();
    if (data.startsWith('cat:')) {
      const cats = parseJ<string[]>(l.categories, []);
      const c = data.slice(4);
      const next = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
      await env.DB.prepare('UPDATE tg_links SET categories=? WHERE chat_id=?').bind(JSON.stringify(next), chat).run();
    }
    return sendSettings(env, chat, (await getLink(env, chat))!, cq.message?.message_id);
  }
  const m = u.message;
  if (!m?.text || !m.chat) return;
  const chat = String(m.chat.id);
  const text = String(m.text).trim();
  if (text.startsWith('/start')) {
    const arg = text.split(/\s+/)[1] ?? '';
    await subscribe(env, chat, m.from?.first_name);
    let linked = '';
    if (arg.startsWith('link_')) linked = await linkAccount(env, chat, arg.slice(5));
    return send(env, chat, `أهلًا ${esc(m.from?.first_name ?? '')} 👋 في <b>صفقة</b> — بنقارن أسعار الإلكترونيات في مصر ونصطادلك أحسن العروض الحقيقية 🔥\n\n✅ اشتركت في تنبيهات العروض (تقدر توقفها في أي وقت).\n${linked}\nكل الردود هنا من وكلاء ذكاء اصطناعي 🤖 بأسعار حقيقية من المتاجر.`, MENU);
  }
  if (text === '/stop') { await env.DB.prepare('UPDATE tg_links SET subscribed=0 WHERE chat_id=?').bind(chat).run(); return send(env, chat, '🔕 وقفت التنبيهات. ابعت /start عشان ترجّعها.'); }
  if (text === '/deals') return sendDeals(env, chat, parseJ((await getLink(env, chat))?.categories, []));
  if (text === '/settings') { await subscribe(env, chat, m.from?.first_name); return sendSettings(env, chat, (await getLink(env, chat))!); }
  if (text === '/digest') return send(env, chat, await buildDigest(env), MENU);
  if (text === '/menu' || text === '/help') return send(env, chat, '📋 القائمة:\n/deals أحسن العروض\n/search اسم المنتج\n/settings التنبيهات\n/digest ملخص النهارده\n/link ربط حسابك\n/stop وقف التنبيهات', MENU);
  if (text.startsWith('/link')) {
    const code = text.split(/\s+/)[1];
    return send(env, chat, code ? await linkAccount(env, chat, code) : '🔗 هات الكود من صفحة حسابي في صفقة وابعته كده: /link الكود', [[{ text: '🌐 حسابي في صفقة', url: `${env.SITE_URL}/account` }]]);
  }
  if (text.startsWith('/search')) {
    const q = text.replace(/^\/search(@\w+)?/, '').trim();
    return q ? searchReply(env, chat, q) : send(env, chat, '🔎 اكتب كده: /search ايفون 17');
  }
  if (!(await rateLimitTg(env, chat))) return send(env, chat, '😅 براحة عليا شوية — جرّب كمان دقيقة.');
  const l = await getLink(env, chat);
  if (l?.mode === 'ask') {
    const ans = await agentReply(env, 'saqr', text, { where: 'بوت تيليجرام @SafqaDealsBot', userName: m.from?.first_name });
    return send(env, chat, `${esc(ans.text)}\n\n<i>🤖 صقر — ${ans.ai ? 'وكيل ذكاء اصطناعي' : 'وضع أوفلاين'}</i>`, [[{ text: '⬅️ القائمة', callback_data: 'menu' }]]);
  }
  return searchReply(env, chat, text);
}

async function rateLimitTg(env: Env, chat: string) {
  const { rateLimit } = await import('./util');
  return rateLimit(env, `tg:${chat}`, 12, 60);
}

async function subscribe(env: Env, chat: string, firstName?: string) {
  await env.DB.prepare('INSERT INTO tg_links (chat_id, subscribed, first_name, created_at) VALUES (?,1,?,?) ON CONFLICT(chat_id) DO UPDATE SET subscribed=1, first_name=COALESCE(excluded.first_name, first_name)').bind(chat, firstName ?? null, nowIso()).run();
}
async function linkAccount(env: Env, chat: string, code: string) {
  const row = await env.DB.prepare('SELECT user_id, exp FROM tg_codes WHERE code=?').bind(code.toUpperCase()).first<{ user_id: string; exp: number }>();
  if (!row || row.exp < Date.now()) return '⚠️ كود الربط غلط أو انتهى — اطلب واحد جديد من صفحة حسابي.';
  await env.DB.batch([
    env.DB.prepare('UPDATE tg_links SET user_id=NULL WHERE user_id=?').bind(row.user_id),
    env.DB.prepare('UPDATE tg_links SET user_id=? WHERE chat_id=?').bind(row.user_id, chat),
    env.DB.prepare('DELETE FROM tg_codes WHERE code=?').bind(code.toUpperCase()),
  ]);
  return '🔗 حسابك في صفقة اتربط ✅ — هبعتلك هنا لما أي منتج في قايمة متابعتك ينزل سعره.\n';
}
export async function createLinkCode(env: Env, userId: string) {
  const code = uid().slice(0, 10).toUpperCase();
  await env.DB.prepare('INSERT INTO tg_codes (code,user_id,exp) VALUES (?,?,?)').bind(code, userId, Date.now() + 30 * 60_000).run();
  const linked = await env.DB.prepare('SELECT chat_id FROM tg_links WHERE user_id=?').bind(userId).first();
  return { code, url: `https://t.me/${BOT_USERNAME}?start=link_${code}`, linked: Boolean(linked), bot: `https://t.me/${BOT_USERNAME}` };
}

// ---------- Outbox (Workers free plan allows ~50 subrequests per invocation) ----------
export async function enqueue(env: Env, target: string, text: string, buttons?: Btn[][]) {
  await env.DB.prepare('INSERT INTO outbox (channel,target,payload,created_at) VALUES (?,?,?,?)').bind('tg', target, JSON.stringify({ text, buttons }), nowIso()).run();
}
export async function drainOutbox(env: Env, max = 35) {
  if (!tgEnabled(env)) return 0;
  const rows = (await env.DB.prepare("SELECT * FROM outbox WHERE channel='tg' ORDER BY id LIMIT ?").bind(max).all<{ id: number; target: string; payload: string; tries: number }>()).results;
  for (const r of rows) {
    const p = parseJ<{ text: string; buttons?: Btn[][] }>(r.payload, { text: '' });
    const res = await send(env, r.target, p.text, p.buttons);
    if (res.ok || r.tries >= 2 || /blocked|not found|deactivated/i.test(String(res.description))) {
      await env.DB.prepare('DELETE FROM outbox WHERE id=?').bind(r.id).run();
      if (/blocked|deactivated/i.test(String(res.description))) await env.DB.prepare('UPDATE tg_links SET subscribed=0 WHERE chat_id=?').bind(r.target).run();
    } else await env.DB.prepare('UPDATE outbox SET tries=tries+1 WHERE id=?').bind(r.id).run();
  }
  return rows.length;
}

/** After a snapshot push: detect real price drops, write a catchy honest headline, fan out. */
export async function processPriceDrops(env: Env, drops: { id: string; title: string; category: string | null; old: number; price: number; pct: number; store: string | null }[]) {
  if (!drops.length) return 0;
  const top = drops.sort((a, b) => b.pct - a.pct).slice(0, 8);
  const heads = await llm(env, 'headline', [
    { role: 'system', content: 'انت "جرس" 🔔 وكيل ذكاء اصطناعي بيكتب عناوين تنبيهات العروض في صفقة. لكل منتج اكتب عنوان واحد قصير بالعامية المصرية بيشد الانتباه بس صادق 100% (من غير "آخر قطعة" أو مبالغة)، بإيموجي. رد JSON بس: {"h":["...","..."]} بنفس ترتيب المنتجات.' },
    { role: 'user', content: top.map((d) => `${d.title}: من ${fmt(d.old)} لـ ${fmt(d.price)} جنيه (-${Math.round(d.pct)}%) في ${d.store}`).join('\n') },
  ], 400, 0.9);
  const h = parseJ<{ h?: string[] }>(heads?.text.match(/\{[\s\S]*\}/)?.[0], {}).h ?? [];
  const subs = (await env.DB.prepare('SELECT chat_id, categories, threshold FROM tg_links WHERE subscribed=1').all<{ chat_id: string; categories: string; threshold: number }>()).results;
  let n = 0;
  for (const [i, d] of top.entries()) {
    const headline = h[i] || `🔔 ${d.title} نزل ${Math.round(d.pct)}%!`;
    await env.DB.prepare('INSERT INTO price_events (product_id,old_price,new_price,drop_pct,category,headline,at) VALUES (?,?,?,?,?,?,?)').bind(d.id, d.old, d.price, d.pct, d.category, headline, nowIso()).run();
    const text = `${esc(headline)}\n\n<b>${esc(d.title)}</b>\n💸 كان ${fmt(d.old)} ج ← بقى <b>${fmt(d.price)} ج</b> (-${Math.round(d.pct)}%)\n🏬 ${esc(d.store ?? '')}\n\n<i>🤖 جرس — وكيل ذكاء اصطناعي · سعر حقيقي من آخر تحديث</i>`;
    for (const s of subs) {
      const cats = parseJ<string[]>(s.categories, []);
      if (d.pct < s.threshold || (cats.length && d.category && !cats.includes(d.category))) continue;
      await enqueue(env, s.chat_id, text, [[{ text: '🛒 افتح العرض', url: productUrl(env, d.id) }]]);
      n++;
    }
  }
  return n;
}

export async function queueDigests(env: Env) {
  const subs = (await env.DB.prepare('SELECT chat_id, categories FROM tg_links WHERE subscribed=1 AND digest=1 AND (last_digest IS NULL OR last_digest < ?)').bind(new Date(Date.now() - 20 * 3600_000).toISOString()).all<{ chat_id: string; categories: string }>()).results;
  if (!subs.length) return 0;
  const cache: Record<string, string> = {};
  for (const s of subs) {
    const key = s.categories || '[]';
    cache[key] ??= await buildDigest(env, parseJ(key, []));
    await enqueue(env, s.chat_id, cache[key]!, MENU);
    await env.DB.prepare('UPDATE tg_links SET last_digest=? WHERE chat_id=?').bind(nowIso(), s.chat_id).run();
  }
  return subs.length;
}
export { MENU, send as tgSend };
