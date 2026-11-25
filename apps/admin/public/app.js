// Safqa Hub (admin) — a dependency-free PWA. Talks only to the Safqa edge API.
import { installHub } from './hub.js';
import { installTaps } from './asmr.js';
import { installOwner } from './owner.js';
import { installBrain } from './brain.js';
import { installSystems } from './systems.js';
import { installSecurity, otpView } from './security.js';
const API = 'https://safqa-api.safqaeg.workers.dev';
const SITE = 'https://safqaeg.pages.dev';
const GOOGLE_CLIENT_ID = '700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com';
// Google only knows the Space as a redirect URI; the Space forwards admin logins here (state starts with "admin.").
// Google returns to the old HF origin (registered redirect URI); it forwards admin.* states here.
const GOOGLE_REDIRECT = 'https://safqa-eg-safqa.static.hf.space';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (n == null ? '—' : `\u2068${Math.round(Number(n)).toLocaleString('en-US')}\u2069`); // bidi-isolated so numbers never jumble with Arabic
const ago = (iso) => { if (!iso) return '—'; const s = (Date.now() - Date.parse(iso)) / 1000; if (s < 60) return 'دلوقتي'; if (s < 3600) return `من ${Math.round(s / 60)} دقيقة`; if (s < 86400) return `من ${Math.round(s / 3600)} ساعة`; return new Date(iso).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }); };
const toast = (t) => { const d = document.createElement('div'); d.textContent = t; $('#toast').append(d); setTimeout(() => d.remove(), 3500); };
const TIERS = { free: ['مجاني', '🌱'], silver: ['فضّي', '🥈'], gold: ['ذهبي', '👑'], diamond: ['ماسي', '💎'] };
const tierName = (t) => (TIERS[t] ? `${TIERS[t][1]} ${TIERS[t][0]}` : t);
const STATUS = { awaiting: ['مستني الإيصال', 'mut'], pending: ['محتاج مراجعة', 'warn'], provisional: ['متفعّل مبدئيًا', 'info'], approved: ['متأكد ✔', 'ok'], rejected: ['مرفوض', 'bad'], revoked: ['اتلغى', 'bad'] };
const pill = (s) => `<span class="pill ${(STATUS[s] || [s, 'mut'])[1]}">${(STATUS[s] || [s])[0]}</span>`;

// ---------------- auth ----------------
const store = { get a() { return localStorage.getItem('adm.access'); }, get r() { return localStorage.getItem('adm.refresh'); }, set(a, r) { a ? localStorage.setItem('adm.access', a) : localStorage.removeItem('adm.access'); r ? localStorage.setItem('adm.refresh', r) : localStorage.removeItem('adm.refresh'); } };
let me = null;
async function api(path, opts = {}, retry = true) {
  const pass = localStorage.getItem('adm.2fa');
  const res = await fetch(API + path, { ...opts, headers: { 'content-type': 'application/json', ...(store.a ? { authorization: `Bearer ${store.a}` } : {}), ...(pass ? { 'x-safqa-2fa': pass } : {}), ...(opts.headers || {}) } });
  if (res.status === 401 && retry && store.r) {
    const r = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: store.r }) });
    if (r.ok) { const j = await r.json(); store.set(j.accessToken, j.refreshToken); return api(path, opts, false); }
    store.set(null, null);
    render();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) { const err = new Error(data?.error?.message || res.statusText); err.code = data?.error?.code; err.status = res.status; throw err; }
  return data;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b ?? {}) });
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
function googleLogin() {
  const state = `admin.${rnd()}`, nonce = rnd();
  localStorage.setItem('adm.oauth', JSON.stringify({ state, nonce, at: Date.now() }));
  const q = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT, response_type: 'id_token', scope: 'openid email profile', nonce, state, prompt: 'select_account' });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
async function completeLogin() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('id_token') && !h.get('error')) return;
  history.replaceState(null, '', location.pathname);
  const saved = JSON.parse(localStorage.getItem('adm.oauth') || 'null');
  localStorage.removeItem('adm.oauth');
  if (h.get('error')) return toast(`جوجل: ${h.get('error')}`);
  const tok = h.get('id_token');
  try {
    const claims = JSON.parse(decodeURIComponent(escape(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (!saved || saved.state !== h.get('state') || claims.nonce !== saved.nonce || Date.now() - saved.at > 10 * 60_000) throw new Error('state');
  } catch { return toast('محاولة دخول غير صالحة — جرّب تاني'); }
  const r = await fetch(`${API}/api/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: tok }) });
  const j = await r.json();
  if (!r.ok) return toast(j?.error?.message || 'فشل الدخول');
  store.set(j.accessToken, j.refreshToken);
}

// ---------------- router ----------------
const PAGES = [
  ['dashboard', '📊', 'الرئيسية'], ['payments', '💳', 'المدفوعات'], ['ops', '🤖', 'وكيل العمليات'], ['members', '👥', 'الأعضاء'], ['codes', '🎟️', 'أكواد الخصم'],
  ['moderation', '⚖️', 'الإشراف والتظلمات'], ['content', '💬', 'المحتوى'], ['agents', '🧠', 'الوكلاء'], ['catalog', '🛒', 'الأسعار'], ['broadcast', '📣', 'الإعلانات'], ['settings', '⚙️', 'الإعدادات'],
];
let counts = {};
const page = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'hub');
window.addEventListener('hashchange', () => render());

// Same section hues as the site and the app (packages/brand/tokens.json).
const SECTION = { dashboard: 'account', hub: 'account', payments: 'plans', codes: 'coupons', ops: 'ai', agents: 'ai', members: 'community', moderation: 'community', content: 'community', catalog: 'deals', broadcast: 'radar', settings: 'tools' };
function bindThemeBtn() {
  const tb = $('#themeBtn');
  if (!tb || !window.SafqaTheme) return;
  const paint = (t) => { tb.innerHTML = `${t.icon} ${t.label}`; };
  paint(window.SafqaTheme.get());
  tb.onclick = () => paint(window.SafqaTheme.cycle());
}
function shell(title, body) {
  document.documentElement.dataset.section = SECTION[page()] || 'account';
  const cur = page();
  const nav = PAGES.map(([id, e, t]) => `<a href="#/${id}" class="${cur === id ? 'on' : ''}" title="${t}"><span class="nav-ico">${e}</span><span class="nav-lab">${t}</span>${counts[id] ? `<span class="badge">${counts[id]}</span>` : ''}</a>`).join('');
  const th = window.SafqaTheme?.get?.() || { label: 'داكن', icon: '🌙' };
  $('#app').innerHTML = `<div class="layout"><header class="topbar"><div class="topbar-row"><div class="brand"><img src="/icons/admin-192.png" alt=""><div><b>Safqa Hub</b><small>الموقع + التطبيق + الإدارة</small></div></div><span class="sp"></span><button class="btn s theme-btn" id="themeBtn" type="button" title="تغيير الثيم">${th.icon} ${th.label}</button><div class="me">${me?.picture ? `<img src="${esc(me.picture)}" alt="">` : ''}<span>${esc(me?.name || '')}</span><button class="btn s" id="logout">خروج</button></div></div><nav class="nav">${nav}</nav></header>
  <main class="main"><div class="top"><h1>${title}</h1></div><div id="view">${body}</div></main></div>`;
  $('#logout').onclick = async () => { await post('/api/auth/logout', { refreshToken: store.r }).catch(() => 0); store.set(null, null); render(); };
  bindThemeBtn();
}
const loading = '<div class="empty"><span class="spin"></span></div>';

async function render() {
  if (!store.a) return loginView();
  try { me = me || (await api('/api/auth/me')); await api('/api/v2/admin/whoami'); } catch (e) {
    if (!store.a) return loginView();
    if (e.code === 'otp_required') { localStorage.removeItem('adm.2fa'); return otpView($, esc, post, render); }
    return loginView(`الحساب ده (${esc(me?.email || '')}) مش مسموح له بالإدارة. ${esc(e.message)}`);
  }
  const p = PAGES.find((x) => x[0] === page()) ?? PAGES[0];
  shell(`${p[1]} ${p[2]}`, loading);
  try { await VIEWS[p[0]]($('#view')); } catch (e) { $('#view').innerHTML = `<div class="card">⚠️ ${esc(e.message)}</div>`; }
}
function loginView(err) {
  const th = window.SafqaTheme?.get?.() || { label: 'داكن', icon: '🌙' };
  $('#app').innerHTML = `<div class="login"><button class="btn s theme-btn login-theme" id="themeBtn" type="button" title="تغيير الثيم">${th.icon} ${th.label}</button><div class="card"><img src="/icons/admin-512.png" alt=""><h2 style="margin:6px 0">لوحة إدارة صفقة</h2><p class="muted">الدخول بحساب Google المسموح له بس. كل العمليات بتتسجل في سجل الإدارة.</p>
  ${err ? `<p class="pill bad" style="white-space:normal">${err}</p>` : ''}<button class="gbtn" id="g"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>المواصلة باستخدام Google</button>
  ${err ? '<p><button class="btn s" id="out">خروج من الحساب ده</button></p>' : ''}</div></div>`;
  $('#g').onclick = googleLogin;
  if ($('#out')) $('#out').onclick = () => { store.set(null, null); me = null; loginView(); };
  bindThemeBtn();
}

// ---------------- views ----------------
const VIEWS = {};
VIEWS.dashboard = async (v) => {
  const s = await api('/api/v2/admin/stats');
  counts = { payments: s.paymentsPending || 0, moderation: s.appealsPending || 0 };
  const tiers = Object.fromEntries((s.tiers || []).map((t) => [t.tier, t.n]));
  const k = (e, l, val, sub = '') => `<div class="card kpi"><span class="e">${e}</span><div class="v">${val}</div><div class="l">${l}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
  const used = (s.aiUsage || []).reduce((a, x) => a + x.calls, 0);
  v.innerHTML = `<div class="grid g4">
    ${k('👥', 'الأعضاء', fmt(s.users), `+${s.newUsers24h} آخر 24 ساعة · ${s.active7d} نشطين في 7 أيام`)}
    ${k('💳', 'مدفوعات مستنية', `<a href="#/payments">${s.paymentsPending}</a>`, 'محتاجة تأكيد أو مراجعة')}
    ${k('💰', 'الإيرادات (30 يوم)', `${fmt(s.revenue30)} ج`, `الإجمالي ${fmt(s.revenue)} ج`)}
    ${k('💎', 'الباقات المدفوعة', fmt((tiers.silver || 0) + (tiers.gold || 0) + (tiers.diamond || 0)), `🥈 ${tiers.silver || 0} · 👑 ${tiers.gold || 0} · 💎 ${tiers.diamond || 0}`)}
    ${k('💬', 'نشاط المجتمع (24س)', fmt(s.posts24h + s.messages24h), `${s.posts24h} منشور · ${s.messages24h} رسالة`)}
    ${k('⚖️', 'عقوبات (24س)', fmt(s.penalties24h), `${s.appealsPending} تظلم مستني`)}
    ${k('🤖', 'الذكاء الاصطناعي النهارده', `${used}/${s.aiBudget}`, `فاضل ${s.aiBudgetLeft} نداء · بعدها الوكلاء بيشتغلوا أوفلاين`)}
    ${k('✈️', 'تيليجرام', fmt(s.telegramSubs), `${s.telegramLinked} حساب مربوط · @SafqaDealsBot`)}
    ${k('🛒', 'منتجات بأسعار حقيقية', fmt(s.products), s.snapshot ? `آخر تحديث ${ago(s.snapshot.recordedAt)}` : 'لسه مفيش')}
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><b>🤖 اسأل وكيل العمليات</b><span class="sp"></span><a class="btn s" href="#/ops">افتح المحادثة</a></div><p class="muted small">مثلاً: «إيه المدفوعات اللي محتاجة مراجعة؟» أو «اعمل كود خصم 15% للباقة الذهبي لمدة أسبوع».</p></div>`;
};

async function receiptImg(id) {
  try { const r = await api(`/api/v2/admin/payments/${id}/receipt`); return `data:${r.mime};base64,${r.data}`; } catch { return null; }
}
VIEWS.payments = async (v) => {
  const tab = new URLSearchParams(location.hash.split('?')[1]).get('s') || 'review';
  const status = { review: 'pending', provisional: 'provisional', approved: 'approved', all: 'all' }[tab] || 'pending';
  const [a, b] = await Promise.all([api(`/api/v2/admin/payments?status=${status}`), status === 'pending' ? api('/api/v2/admin/payments?status=provisional') : { items: [] }]);
  const items = [...b.items, ...a.items];
  v.innerHTML = `<div class="tabs">${[['review', 'محتاج قرار'], ['provisional', 'متفعّل مبدئيًا'], ['approved', 'متأكد'], ['all', 'الكل']].map(([id, t]) => `<button class="${tab === id ? 'on' : ''}" data-href="#/payments?s=${id}">${t}</button>`).join('')}</div>
  <div class="grid">${items.length ? items.map((p) => `<div class="card pay" data-id="${p.id}"><div>${p.hasReceipt ? `<img class="rc" data-rc="${p.id}" alt="إيصال" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">` : '<div class="empty">مفيش إيصال لسه</div>'}</div>
    <div class="col"><div class="row"><b>${esc(p.userName || '')}</b><span class="muted small mono">${esc(p.userEmail || '')}</span><span class="sp"></span>${pill(p.status)}${p.note === 'TEST' ? '<span class="pill warn">اختبار</span>' : ''}</div>
    <div class="row"><span>${tierName(p.tier)} × ${p.months} شهر</span><b style="font-size:20px">${fmt(p.amount)} ج</b>${p.code ? `<span class="pill info">كود ${esc(p.code)} (بدل ${fmt(p.listAmount)})</span>` : ''}</div>
    <div class="small muted">كود الدفع: <b class="mono">${esc(p.refCode)}</b> · الرقم المرجعي: <b class="mono">${esc(p.txnRef || '—')}</b> · ${ago(p.submittedAt || p.createdAt)}</div>
    ${p.confidence != null ? `<div class="row small"><span>ثقة الذكاء الاصطناعي</span><div class="conf" style="flex:1"><i style="width:${p.confidence * 100}%;background:${p.confidence >= 0.8 ? 'var(--ok)' : p.confidence >= 0.5 ? 'var(--warn)' : 'var(--danger)'}"></i></div><b>${Math.round(p.confidence * 100)}%</b></div>` : ''}
    ${p.checks?.checks ? `<div class="checks">${p.checks.checks.map((c) => `<span>${c.ok === true ? '✅' : c.ok === false ? '❌' : '❔'} ${esc(c.ar)}</span>`).join('')}</div>` : ''}
    ${p.extraction ? `<details class="small"><summary class="muted">اللي قراه الذكاء الاصطناعي من الإيصال</summary><div class="mono small">${esc(JSON.stringify(p.extraction, null, 1))}</div></details>` : ''}
    <div class="row" style="margin-top:6px">${['pending', 'provisional', 'awaiting'].includes(p.status) ? `<button class="btn p" data-act="approve">✅ تأكيد</button><button class="btn d" data-act="${p.status === 'provisional' ? 'revoke' : 'reject'}">❌ ${p.status === 'provisional' ? 'إلغاء التفعيل' : 'رفض'}</button>` : ''}${p.status === 'approved' ? '<button class="btn s d" data-act="revoke">إلغاء</button>' : ''}${p.hasReceipt ? '<button class="btn s" data-act="reverify">🔁 إعادة قراءة بالذكاء الاصطناعي</button>' : ''}</div></div></div>`).join('') : '<div class="card empty">مفيش مدفوعات هنا 🎉</div>'}</div>`;
  for (const img of v.querySelectorAll('[data-rc]')) receiptImg(img.dataset.rc).then((src) => { if (src) { img.src = src; img.onclick = () => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<img src="${src}">`; m.onclick = () => m.remove(); document.body.append(m); }; } });
  v.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const id = b.closest('[data-id]').dataset.id, act = b.dataset.act;
    let note = '';
    if (act === 'reject' || act === 'revoke') { note = prompt('سبب الرفض (هيوصل للعضو):', 'الإيصال مش مطابق') ?? null; if (note === null) return; }
    b.disabled = true;
    try { const r = await post(`/api/v2/admin/payments/${id}/${act}`, { note }); toast(act === 'reverify' ? `ثقة جديدة ${Math.round((r.confidence || 0) * 100)}%` : 'تم ✅'); render(); } catch (e) { toast(e.message); b.disabled = false; }
  }));
};

VIEWS.members = async (v) => {
  const q = new URLSearchParams(location.hash.split('?')[1]).get('q') || '';
  const r = await api(`/api/v2/admin/members?q=${encodeURIComponent(q)}`);
  v.innerHTML = `<div class="card"><div class="row"><input class="input" id="q" placeholder="دوّر بالاسم أو الإيميل" value="${esc(q)}" style="max-width:360px"><button class="btn" id="go">بحث</button></div></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th>العضو</th><th>الباقة</th><th>الرتبة</th><th>آخر ظهور</th><th></th></tr></thead><tbody>${r.items.map((m) => `<tr data-id="${m.id}"><td><b>${esc(m.name)}</b><div class="small muted mono">${esc(m.email)}</div></td><td>${tierName(m.tier)}${m.tier_status === 'provisional' ? ' <span class="pill info">مبدئي</span>' : ''}<div class="small muted">${m.tier_until ? `لحد ${new Date(m.tier_until).toLocaleDateString('ar-EG')}` : ''}</div></td><td>${m.rank.emoji} ${m.rank.ar}<div class="small muted">${m.xp} XP</div></td><td class="small">${ago(m.last_seen)}</td>
  <td><select data-tier><option value="">تغيير الباقة…</option>${Object.keys(TIERS).map((t) => `<option value="${t}">${tierName(t)}</option>`).join('')}</select><div class="row" style="margin-top:6px"><button class="btn s" data-pen="warning">إنذار</button><button class="btn s" data-pen="mute">كتم ساعة</button><button class="btn s d" data-pen="ban">حظر يوم</button><button class="btn s" data-pen="clear">شيل العقوبات</button></div></td></tr>`).join('')}</tbody></table>${r.items.length ? '' : '<div class="empty">مفيش أعضاء</div>'}</div>`;
  $('#go').onclick = () => (location.hash = `#/members?q=${encodeURIComponent($('#q').value)}`);
  v.querySelectorAll('[data-tier]').forEach((s) => (s.onchange = async () => { if (!s.value) return; const id = s.closest('tr').dataset.id; const days = s.value === 'free' ? 0 : Number(prompt('عدد الأيام:', '30')); if (s.value !== 'free' && !days) return; if (!confirm(`تأكيد تغيير الباقة لـ ${tierName(s.value)}؟`)) return; await post(`/api/v2/admin/members/${id}/tier`, { tier: s.value, days }); toast('اتغيرت ✅'); render(); }));
  v.querySelectorAll('[data-pen]').forEach((b) => (b.onclick = async () => { const id = b.closest('tr').dataset.id; const reason = prompt('السبب:', 'قرار الإدارة'); if (reason === null) return; await post(`/api/v2/admin/members/${id}/penalty`, { action: b.dataset.pen, reason, minutes: b.dataset.pen === 'ban' ? 1440 : 60 }); toast('تم ✅'); }));
};

VIEWS.codes = async (v) => {
  const r = await api('/api/v2/admin/codes');
  v.innerHTML = `<div class="card"><b>🎟️ كود جديد</b><div class="grid g4" style="margin-top:10px">
    <div><label>الكود</label><input class="input mono" id="c" placeholder="SAFQA20"></div>
    <div><label>النوع</label><select id="k"><option value="percent">خصم %</option><option value="fixed">خصم بالجنيه</option><option value="upgrade">ترقية مجانية</option></select></div>
    <div><label>القيمة (% أو جنيه)</label><input class="input" id="val" type="number" value="20"></div>
    <div><label>باقة الترقية / أيام</label><div class="row"><select id="ut" style="flex:1">${Object.keys(TIERS).filter((t) => t !== 'free').map((t) => `<option value="${t}">${tierName(t)}</option>`).join('')}</select><input class="input" id="ud" type="number" value="7" style="width:80px"></div></div>
    <div><label>ينتهي في</label><input class="input" id="exp" type="date"></div>
    <div><label>أقصى عدد استخدام</label><input class="input" id="max" type="number" placeholder="بلا حد"></div>
    <div><label>مرات لكل عضو</label><input class="input" id="pu" type="number" value="1"></div>
    <div><label>للباقات (فاضي = الكل)</label><div class="row small">${['silver', 'gold', 'diamond'].map((t) => `<label style="display:inline-flex;gap:4px"><input type="checkbox" value="${t}" class="tt">${tierName(t)}</label>`).join('')}</div></div>
  </div><div class="row" style="margin-top:10px"><input class="input" id="note" placeholder="ملاحظة داخلية (اختياري)" style="flex:1"><button class="btn p" id="save">حفظ الكود</button></div></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th>الكود</th><th>النوع</th><th>الاستخدام</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead><tbody>${r.items.map((c) => `<tr data-code="${esc(c.code)}"><td class="mono"><b>${esc(c.code)}</b><div class="small muted">${esc(c.note || '')}</div></td><td>${c.kind === 'percent' ? `خصم ${c.value}%` : c.kind === 'fixed' ? `خصم ${c.value} ج` : `ترقية ${tierName(c.upgrade_tier)} ${c.upgrade_days} يوم`}<div class="small muted">${c.tiers.length ? c.tiers.map(tierName).join('، ') : 'كل الباقات'}</div></td><td>${c.uses}/${c.max_uses ?? '∞'}</td><td class="small">${c.expires_at ? new Date(c.expires_at).toLocaleDateString('ar-EG') : 'مفتوح'}</td><td><button class="switch ${c.active ? 'on' : ''}" data-toggle></button></td><td><button class="btn s d" data-del>حذف</button></td></tr>`).join('')}</tbody></table>${r.items.length ? '' : '<div class="empty">مفيش أكواد لسه</div>'}</div>`;
  $('#save').onclick = async () => {
    try { await post('/api/v2/admin/codes', { code: $('#c').value, kind: $('#k').value, value: Number($('#val').value), upgradeTier: $('#ut').value, upgradeDays: Number($('#ud').value), expiresAt: $('#exp').value ? new Date(`${$('#exp').value}T23:59:59+02:00`).toISOString() : null, maxUses: $('#max').value ? Number($('#max').value) : null, perUser: Number($('#pu').value) || 1, tiers: [...v.querySelectorAll('.tt:checked')].map((x) => x.value), note: $('#note').value }); toast('الكود اتحفظ ✅'); render(); } catch (e) { toast(e.message); }
  };
  v.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => { const code = b.closest('tr').dataset.code; const c = r.items.find((x) => x.code === code); await post('/api/v2/admin/codes', { code: c.code, kind: c.kind, value: c.value, tiers: c.tiers, expiresAt: c.expires_at, maxUses: c.max_uses, perUser: c.per_user, upgradeTier: c.upgrade_tier, upgradeDays: c.upgrade_days, note: c.note, active: !c.active }); render(); }));
  v.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { const code = b.closest('tr').dataset.code; if (!confirm(`حذف الكود ${code}؟`)) return; await api(`/api/v2/admin/codes/${encodeURIComponent(code)}`, { method: 'DELETE' }); render(); }));
};

VIEWS.moderation = async (v) => {
  const r = await api('/api/v2/admin/moderation');
  const act = { warning: ['إنذار', 'warn'], mute: ['كتم', 'warn'], ban: ['حظر', 'bad'] };
  v.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="muted small">العقوبات بتتطبق تلقائي من وكلاء القانون (قواعد أوفلاين + تصنيف بالذكاء الاصطناعي) وكل عقوبة مكتوب فيها رقم المادة.</span><span class="sp"></span><button class="btn s" id="judge">⚖️ خلّي القاضية سلمى تحكم في التظلمات دلوقتي</button></div>
  <div class="card tw"><table><thead><tr><th>العضو</th><th>العقوبة</th><th>المواد والسبب</th><th>التظلم</th><th></th></tr></thead><tbody>${r.items.map((p) => `<tr data-id="${p.id}"><td><b>${esc(p.user_name || '—')}</b><div class="small muted">${ago(p.created_at)} · ${esc(p.where_ || '')}</div></td><td><span class="pill ${(act[p.action] || ['', 'mut'])[1]}">${(act[p.action] || [p.action])[0]}</span><div class="small muted">${p.until ? `لحد ${new Date(p.until).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}` : ''}</div><div class="small muted">${esc(p.agent_id)} · ${esc(p.source)}</div></td><td>${p.rules.map((x) => `<span class="pill info">م ${x}</span>`).join(' ')}<div class="small">${esc(p.reason)}</div><div class="small muted">«${esc((p.evidence || '').slice(0, 120))}»</div></td><td class="small">${p.appeal_text ? `<div>«${esc(p.appeal_text)}»</div>${p.appeal_status ? `<span class="pill ${p.appeal_status === 'accepted' ? 'ok' : p.appeal_status === 'pending' ? 'warn' : 'bad'}">${{ pending: 'مستني', accepted: 'اتقبل', rejected: 'اترفض' }[p.appeal_status]}</span>` : ''}<div class="muted">${esc(p.appeal_reply || '')}</div>` : '—'}</td><td>${p.appeal_status === 'pending' ? '<button class="btn s p" data-ap="1">قبول</button> <button class="btn s d" data-ap="0">رفض</button>' : ''}</td></tr>`).join('')}</tbody></table>${r.items.length ? '' : '<div class="empty">مفيش عقوبات — المجتمع محترم 👏</div>'}</div>`;
  $('#judge').onclick = async () => { const j = await post('/api/v2/admin/moderation/judge'); toast(`اتحكم في ${j.judged} تظلم`); render(); };
  v.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = async () => { await post(`/api/v2/admin/moderation/${b.closest('tr').dataset.id}/appeal`, { accept: b.dataset.ap === '1', reply: prompt('رد الإدارة (اختياري):') || '' }); render(); }));
};

VIEWS.content = async (v) => {
  const type = new URLSearchParams(location.hash.split('?')[1]).get('t') || 'posts';
  const r = await api(`/api/v2/admin/content?type=${type}`);
  const one = { posts: 'post', comments: 'comment', messages: 'message', reviews: 'review' }[type];
  v.innerHTML = `<div class="tabs">${[['posts', 'المنشورات'], ['comments', 'التعليقات'], ['messages', 'الدردشة'], ['reviews', 'التقييمات']].map(([id, t]) => `<button class="${type === id ? 'on' : ''}" data-href="#/content?t=${id}">${t}</button>`).join('')}</div>
  <div class="grid">${r.items.map((x) => { const a = r.authors[x.author_id] || {}; return `<div class="card" data-id="${x.id}"><div class="row"><b>${esc(a.name || x.author_id)}</b>${a.ai ? '<span class="pill info">🤖 وكيل ذكي</span>' : ''}<span class="muted small">${ago(x.created_at)}${x.room_id ? ` · ${esc(x.room_id)}` : ''}${x.group_id ? ` · ${esc(x.group_id)}` : ''}</span><span class="sp"></span><span class="pill ${x.status === 'visible' ? 'ok' : 'bad'}">${x.status}</span></div><p style="white-space:pre-wrap;margin:8px 0">${x.stars ? '⭐'.repeat(x.stars) + '<br>' : ''}${esc(x.text)}</p><div class="row">${x.status === 'visible' ? '<button class="btn s d" data-st="hidden">إخفاء</button>' : '<button class="btn s" data-st="visible">إظهار</button>'}${type === 'posts' ? `<button class="btn s" data-pin>${x.pinned ? '📌 فك التثبيت' : '📌 تثبيت'}</button>` : ''}</div></div>`; }).join('') || '<div class="card empty">مفيش محتوى</div>'}</div>`;
  v.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => { await post(`/api/v2/admin/content/${one}/${b.closest('[data-id]').dataset.id}/${b.dataset.st}`); render(); }));
  v.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = async () => { await post(`/api/v2/admin/posts/${b.closest('[data-id]').dataset.id}/pin`); render(); }));
};

const MOODS = { happy: 'مبسوط 😊', excited: 'متحمس 🚀', focused: 'مركز 🎯', strict: 'صارم 😤', worried: 'قلقان 😟', sleepy: 'نعسان 😴', proud: 'فخور 😎', playful: 'رايق 😜' };
VIEWS.agents = async (v) => {
  const r = await api('/api/v2/admin/agents');
  const teams = [...new Set(r.items.map((a) => a.team))];
  const usage = {}; for (const u of r.usage) (usage[u.day] ??= 0), (usage[u.day] += u.calls);
  const days = Object.entries(usage).slice(0, 14).reverse();
  const mx = Math.max(1, ...days.map((d) => d[1]));
  v.innerHTML = `<div class="grid g2"><div class="card"><b>🧠 الموديلات</b><div class="small muted" style="margin-top:6px">الدردشة: <span class="mono">${r.models.chat}</span><br>الاحتياطي: <span class="mono">${r.models.fallback}</span><br>قراءة الإيصالات: <span class="mono">${r.models.vision}</span></div></div>
  <div class="card"><div class="row"><b>📈 استهلاك Workers AI</b><span class="sp"></span><span class="small muted">فاضل النهارده ${r.left}/${r.budget}</span></div><div class="bar" style="margin-top:10px">${days.map(([d, n]) => `<i title="${d}: ${n}" style="height:${(n / mx) * 100}%"></i>`).join('')}</div><div class="small muted">لما الحصة المجانية تخلص الوكلاء بيكملوا بالمحرك الأوفلاين تلقائي.</div></div></div>
  ${teams.map((t) => `<h3 style="margin:18px 0 8px">${t}</h3><div class="grid g2">${r.items.filter((a) => a.team === t).map((a) => `<div class="card" data-id="${a.id}"><div class="agent"><div class="av">${a.emoji[0]}</div><div><b>${esc(a.name)}</b> <span class="pill info">🤖 AI</span><div class="small muted">${esc(a.title)}</div></div><span class="sp"></span><button class="switch ${a.config?.enabled === 0 ? '' : 'on'}" data-en></button></div>
  <div class="row" style="margin-top:10px"><select data-mood style="max-width:180px"><option value="">المزاج التلقائي</option>${Object.entries(MOODS).map(([k, l]) => `<option value="${k}" ${a.config?.mood === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn s" data-test>💬 جرّبه</button><button class="btn s" data-logs>📜 السجل</button></div>
  <textarea data-persona rows="2" style="margin-top:8px" placeholder="شخصية مخصصة (اختياري): ${esc(a.persona)}">${esc(a.config?.persona || '')}</textarea><div class="row" style="margin-top:6px"><button class="btn s p" data-save>حفظ الشخصية</button></div><div data-out class="small" style="margin-top:8px;white-space:pre-wrap"></div></div>`).join('')}</div>`).join('')}`;
  const id = (b) => b.closest('[data-id]').dataset.id;
  v.querySelectorAll('[data-en]').forEach((b) => (b.onclick = async () => { const on = !b.classList.contains('on'); await post(`/api/v2/admin/agents/${id(b)}`, { enabled: on }); b.classList.toggle('on', on); toast(on ? 'الوكيل اشتغل ✅' : 'الوكيل وقف ⏸️'); }));
  v.querySelectorAll('[data-mood]').forEach((s) => (s.onchange = async () => { await post(`/api/v2/admin/agents/${id(s)}`, { mood: s.value || null }); toast('المزاج اتغير'); }));
  v.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => { await post(`/api/v2/admin/agents/${id(b)}`, { persona: b.closest('[data-id]').querySelector('[data-persona]').value }); toast('اتحفظ ✅'); }));
  v.querySelectorAll('[data-test]').forEach((b) => (b.onclick = async () => { const q = prompt('اسأل الوكيل:', 'إيه أحسن عرض النهارده؟'); if (!q) return; const out = b.closest('[data-id]').querySelector('[data-out]'); out.innerHTML = '<span class="spin"></span>'; const r2 = await post(`/api/v2/admin/agents/${id(b)}/test`, { message: q }); out.textContent = `${r2.text}\n— ${r2.ai ? r2.model : 'أوفلاين'}`; }));
  v.querySelectorAll('[data-logs]').forEach((b) => (b.onclick = async () => { const out = b.closest('[data-id]').querySelector('[data-out]'); const l = await api(`/api/v2/admin/agents/logs?agent=${id(b)}`); out.innerHTML = l.items.slice(0, 8).map((x) => `<div style="border-top:1px solid var(--line);padding:6px 0"><span class="muted">${ago(x.at)} · ${esc(x.kind)} · ${esc(x.model)}${x.fallback ? ' · أوفلاين' : ''}</span><br>${esc(x.output)}</div>`).join('') || 'مفيش سجل لسه'; }));
};

VIEWS.catalog = async (v) => {
  const s = await api('/api/v2/admin/stats');
  const snap = await fetch(`${API}/api/v2/snapshot`).then((r) => r.json()).catch(() => null);
  v.innerHTML = `<div class="grid g4"><div class="card kpi"><span class="e">🕒</span><div class="v" style="font-size:20px">${s.snapshot ? ago(s.snapshot.recordedAt) : '—'}</div><div class="l">آخر سحب للأسعار (تحديث يومي 8 الصبح بتوقيت القاهرة)</div></div><div class="card kpi"><span class="e">🛒</span><div class="v">${s.products}</div><div class="l">منتج بأسعار حقيقية</div></div><div class="card kpi"><span class="e">📤</span><div class="v" style="font-size:20px">${s.snapshot ? ago(s.snapshot.pushedAt) : '—'}</div><div class="l">آخر رفع للباك إند</div></div></div>
  <div class="card tw" style="margin-top:12px"><table><thead><tr><th>المنتج</th><th>أرخص سعر</th><th>المتاجر</th><th>تقييم الصفقة</th></tr></thead><tbody>${(snap?.all || []).map((p) => `<tr><td><a href="${SITE}/product/${p.id}" target="_blank">${esc(p.titleAr)}</a><div class="small muted">${esc(p.titleEn)}</div></td><td><b>${fmt(p.lowestPriceEgp)} ج</b></td><td class="small">${p.offerCount} · ${esc(p.bestOffer?.store?.nameAr || '')}</td><td>${p.bestOffer?.dealScore ?? '—'}/100</td></tr>`).join('')}</tbody></table></div>`;
};

VIEWS.broadcast = async (v) => {
  const r = await api('/api/v2/admin/announcements');
  v.innerHTML = `<div class="card"><b>📣 إعلان جديد</b><div class="col" style="margin-top:10px"><input class="input" id="t" placeholder="العنوان"><textarea id="b" rows="3" placeholder="نص الإعلان"></textarea><div class="row"><select id="l" style="max-width:160px"><option value="info">معلومة</option><option value="deal">عرض 🔥</option><option value="warn">تنبيه ⚠️</option></select><label style="display:inline-flex;gap:6px;margin:0"><input type="checkbox" id="tg"> ابعته كمان لمشتركين تيليجرام</label><span class="sp"></span><button class="btn g" id="send">نشر</button></div></div></div>
  <div class="grid" style="margin-top:12px">${r.items.map((a) => `<div class="card" data-id="${a.id}"><div class="row"><b>${esc(a.title)}</b><span class="pill mut">${a.level}</span><span class="sp"></span><span class="muted small">${ago(a.created_at)}</span><button class="switch ${a.active ? 'on' : ''}" data-tg></button></div><p class="muted">${esc(a.body)}</p></div>`).join('') || '<div class="card empty">مفيش إعلانات</div>'}</div>`;
  $('#send').onclick = async () => { if (!$('#t').value || !$('#b').value) return toast('اكتب العنوان والنص'); if ($('#tg').checked && !confirm('هيتبعت لكل مشتركين تيليجرام. متأكد؟')) return; await post('/api/v2/admin/announcements', { title: $('#t').value, body: $('#b').value, level: $('#l').value, telegram: $('#tg').checked }); toast('اتنشر ✅'); render(); };
  v.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = async () => { await post(`/api/v2/admin/announcements/${b.closest('[data-id]').dataset.id}/toggle`); render(); }));
};

VIEWS.settings = async (v) => {
  const r = await api('/api/v2/admin/settings');
  v.innerHTML = `<div class="grid g2"><div class="card"><b>💳 إنستاباي</b><div class="row" style="margin-top:10px"><img src="/instapay-qr.jpg" style="width:120px;border-radius:12px;background:#fff" alt="QR"><div class="col"><span class="mono">${esc(r.pay.address)}</span><a href="${esc(r.pay.link)}" target="_blank">${esc(r.pay.link)}</a><span class="small muted">ده العنوان اللي بيظهر للأعضاء في صفحة الدفع.</span></div></div></div>
  <div class="card"><b>✈️ تيليجرام</b><p class="muted">${r.telegram ? 'البوت @SafqaDealsBot شغال ✅' : 'مش متوصل'}</p><div class="row"><button class="btn s" id="wh">إعادة تسجيل الـ Webhook</button><button class="btn s" id="dg">ابعت الملخص اليومي دلوقتي</button></div></div>
  <div class="card"><b>🔗 روابط</b><div class="col small" style="margin-top:8px"><a href="${SITE}" target="_blank">الموقع</a><a href="${API}/api/v2/status" target="_blank">حالة الباك إند</a><a href="https://t.me/SafqaDealsBot" target="_blank">بوت تيليجرام</a><a href="https://github.com/Omar08263/safqa/blob/main/docs/backend.md" target="_blank">توثيق الباك إند</a></div></div></div>
  <div class="card tw" style="margin-top:12px"><b>📜 سجل الإدارة</b><table><tbody>${r.audit.map((a) => `<tr><td class="small">${ago(a.at)}</td><td>${esc(a.action)}</td><td class="small mono">${esc(a.detail)}</td><td class="small muted">${esc(a.admin)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#wh').onclick = async () => { const j = await post('/api/v2/admin/telegram/setup'); toast(j.webhook ? 'الـ Webhook اتسجل ✅' : 'فشل'); };
  $('#dg').onclick = async () => { if (!confirm('ابعت الملخص لكل المشتركين دلوقتي؟')) return; const j = await post('/api/v2/admin/telegram/digest'); toast(`اتحط في الطابور لـ ${j.queued} مشترك`); };
};

const opsHistory = JSON.parse(sessionStorage.getItem('adm.ops') || '[]');
VIEWS.ops = async (v) => {
  v.innerHTML = `<div class="card chat"><div class="msgs" id="msgs"></div><div class="row" style="margin-top:10px"><input class="input" id="m" placeholder="اسأل المهندس عادل عن حالة الموقع أو اطلب منه يعمل حاجة…" style="flex:1"><button class="btn p" id="s">إرسال</button></div>
  <div class="row small" style="margin-top:8px">${['إيه الوضع النهارده؟', 'في مدفوعات محتاجة مراجعة؟', 'اعمل كود خصم 15% للذهبي لمدة أسبوع لـ 50 استخدام', 'مين الوكلاء اللي اشتغلوا أكتر؟'].map((q) => `<button class="btn s" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  const box = $('#msgs');
  const draw = () => { box.innerHTML = opsHistory.map((m, i) => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${esc(m.content)}${m.action ? `<div class="act"><b>${m.destructive ? '⚠️ أمر محتاج تأكيدك' : '⚡ اتنفذ'}:</b> <span class="mono">${esc(m.action.name)}</span><div class="mono small">${esc(JSON.stringify(m.action.args))}</div>${m.destructive && !m.done ? `<div class="row" style="margin-top:6px"><button class="btn s p" data-ok="${i}">تأكيد التنفيذ</button><button class="btn s" data-no="${i}">إلغاء</button></div>` : m.done ? `<div class="small">${esc(m.done)}</div>` : ''}</div>` : ''}${m.role === 'assistant' ? `<div class="small muted" style="margin-top:4px">🤖 ${m.ai === false ? 'أوفلاين' : 'وكيل ذكاء اصطناعي'}</div>` : ''}</div>`).join('') || '<div class="empty">أنا المهندس عادل 🛠️ (وكيل ذكاء اصطناعي). بشوف بيانات الموقع الحقيقية وأقدر أنفّذ أوامر آمنة، والأوامر المهمة بستنى تأكيدك.</div>'; box.scrollTop = box.scrollHeight; sessionStorage.setItem('adm.ops', JSON.stringify(opsHistory.slice(-30)));
    box.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = async () => { const m = opsHistory[b.dataset.ok]; try { await post('/api/v2/admin/ops/confirm', m.action); m.done = '✅ اتنفذ'; } catch (e) { m.done = `❌ ${e.message}`; } draw(); }));
    box.querySelectorAll('[data-no]').forEach((b) => (b.onclick = () => { opsHistory[b.dataset.no].done = 'اتلغى'; draw(); })); };
  const send = async (text) => { if (!text.trim()) return; opsHistory.push({ role: 'user', content: text }); draw(); $('#m').value = ''; box.insertAdjacentHTML('beforeend', '<div class="msg a"><span class="spin"></span></div>');
    try { const r = await post('/api/v2/admin/ops', { message: text, history: opsHistory.slice(-9, -1).map(({ role, content }) => ({ role, content })) }); opsHistory.push({ role: 'assistant', content: r.reply, action: r.action, destructive: r.needsConfirm, done: r.executed ? (r.executed.error ? `❌ ${r.executed.error}` : '✅ اتنفذ') : null, ai: r.ai }); } catch (e) { opsHistory.push({ role: 'assistant', content: `⚠️ ${e.message}` }); } draw(); };
  $('#s').onclick = () => send($('#m').value); $('#m').onkeydown = (e) => e.key === 'Enter' && send($('#m').value);
  v.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => send(b.dataset.q)));
  draw();
};

installHub({ PAGES, VIEWS, api, post, esc, fmt, ago, toast });
installOwner({ PAGES, VIEWS, api, post, esc, fmt, ago, toast });
installBrain({ PAGES, VIEWS, api, post, esc, ago, toast });
installSystems({ PAGES, VIEWS, api, post, esc, ago, toast });
installSecurity({ PAGES, VIEWS, api, post, esc, ago, toast });
// Tabs use data-href instead of inline onclick (strict CSP: no inline script).
document.addEventListener('click', (e) => { const t = e.target.closest?.('[data-href]'); if (t) location.hash = t.dataset.href; });
installTaps();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => 0);
await completeLogin();
render();
setInterval(async () => { if (!store.a) return; try { const s = await api('/api/v2/admin/stats'); const n = { payments: s.paymentsPending || 0, moderation: s.appealsPending || 0 }; if (n.payments > (counts.payments || 0)) toast('💳 في دفع جديد محتاج مراجعة'); counts = n; } catch {} }, 60_000);
