// Safqa Hub → 🛡️ الأمان: owner 2FA (TOTP), intrusion log, IP bans, active defenses.
export function installSecurity({ PAGES, VIEWS, api, post, esc, ago, toast }) {
  PAGES.splice(PAGES.length - 1, 0, ['security', '🛡️', 'الأمان']);
  const KIND = {
    auth_fail: 'دخول فاشل', login_locked: 'قفل حساب', refresh_reuse: '⚠️ سرقة جلسة محتملة', rate_limited: 'طلبات كتير', sig_fail: 'توقيع غلط', sig_replay: 'إعادة إرسال',
    admin_denied: 'محاولة دخول الإدارة', otp_fail: 'كود 2FA غلط', otp_locked: 'قفل 2FA', origin_blocked: 'موقع غريب', webhook_forged: 'Webhook مزوّر', too_large: 'طلب ضخم', banned_hit: 'IP محظور', csp_report: 'CSP',
    trap_hit: '🪤 وقع في فخ', form_trap: '🪤 بوت فورم', attack_sig: '🧨 محاولة استغلال', scanner: '🔎 أداة فحص', cred_stuffing: '🔑 Credential stuffing', path_scan: 'لف على المسارات', auto_ban: '⛔ حظر تلقائي',
  };
  const REASON = (r) => (r.startsWith('trap:') || r.startsWith('site-trap:') ? `🪤 فخ ${r.split(':')[1]}` : r.startsWith('form-trap') ? '🪤 فورم' : ({ sqli: '💉 SQLi', xss: '🧪 XSS', traversal: '📂 Traversal', injection: '💣 Injection', 'scanner-ua': '🔎 أداة فحص', 'rapid-404': '🔁 404 كتير', 'credential-stuffing': '🔑 Stuffing' })[r.replace(/-hdr$/, '')] || r);
  const t = (ms) => new Date(ms).toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  async function renderLive(box) {
    let L;
    try { L = await api('/api/v2/admin/security/live'); } catch (e) { box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; return; }
    const traps = L.feed.filter((f) => /trap/.test(f.reason));
    const A = L.agents;
    box.innerHTML = `<div class="card" style="margin-top:12px"><b>🤖 فريق الأمن الذكي</b> <span class="muted small">— ${A.aiUsed}/${A.aiDaily} نداء ذكاء اصطناعي النهارده (Workers AI مجاني)</span>
        <div class="grid g2" style="margin-top:8px">${A.list.map((a) => `<div class="card" style="border-inline-start:4px solid ${esc(a.color)}"><b>${esc(a.emoji)} ${esc(a.name)}</b> <button class="btn s" data-run="${esc(a.id)}" style="float:inline-end">شغّل</button><p class="small muted" style="margin:4px 0">${esc(a.role)}</p>
          ${a.last ? `<p class="small" style="margin:4px 0">${esc(a.last.note)} <span class="muted">· ${ago(new Date(a.last.at).toISOString())}</span></p>${a.last.ai ? `<p class="small" style="margin:4px 0;white-space:pre-wrap;background:var(--bg2,#f5f5f5);padding:6px;border-radius:8px">🧠 ${esc(a.last.ai)}</p>` : ''}${a.id === 'sec_patch' && a.last.data?.drafts?.length ? `<details class="small"><summary>مسودات الإصلاح (${a.last.data.drafts.length})</summary>${a.last.data.drafts.map((d) => `<p><b>${esc(d.title)}</b><br><span class="muted" style="white-space:pre-wrap">${esc(d.body)}</span></p>`).join('')}<p class="muted">بتتبعت للعقل الرئيسي كمسودة GitHub issue — مش بتتفتح غير بموافقتك.</p></details>` : ''}` : '<p class="small muted">لسه ماشتغلش.</p>'}</div>`).join('')}</div></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card tw"><b>📡 الهجمات لحظة بلحظة</b> <span class="muted small">(بيتحدّث كل 10 ثواني · ${L.tarpitsActive} مهاجم متعلّق في التار-بِت دلوقتي)</span>
          ${L.feed.length ? `<table><thead><tr><th>الوقت</th><th>النوع</th><th>نقاط</th><th>المصدر</th><th>المسار</th></tr></thead><tbody>${L.feed.slice(0, 40).map((f) => `<tr><td class="small">${t(f.at)}</td><td class="small">${esc(REASON(f.reason))}</td><td>${f.points}</td><td class="mono small">${esc(f.client)}</td><td class="mono small">${esc(f.path || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">هدوء تام — مفيش هجمات دلوقتي. 👌</p>'}</div>
        <div class="card tw"><b>🪤 اللي وقعوا في الفخاخ</b>
          ${traps.length ? `<table><tbody>${traps.slice(0, 25).map((f) => `<tr><td class="small">${t(f.at)}</td><td class="small">${esc(REASON(f.reason))}</td><td class="mono small">${esc(f.client)}</td><td class="mono small">${esc(f.path || '')}</td><td class="small muted">${esc((f.ua || '').slice(0, 40))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">محدش وقع في فخ لسه.</p>'}</div></div>
      <div class="card tw" style="margin-top:12px"><b>🏴 أخطر المهاجمين</b> <span class="muted small">الحظر بيتصاعد تلقائيًا: ساعة ← 6 ساعات ← يوم ← أسبوع</span>
        ${L.offenders.length ? `<table><thead><tr><th>المصدر</th><th>محاولات</th><th>مرات الحظر</th><th>الحالة</th><th>الأسباب</th><th>آخر مسارات</th><th></th></tr></thead><tbody>${L.offenders.map((o) => `<tr><td class="mono small">${esc(o.client)}</td><td>${o.hits}</td><td>${o.bans}</td><td class="small">${o.until > Date.now() ? `⛔ لحد ${t(o.until)}` : 'مراقَب'}</td><td class="small">${o.reasons.map((r) => esc(REASON(r))).join('، ')}</td><td class="mono small">${o.paths.map(esc).join('<br>')}</td><td>${o.until > Date.now() ? `<button class="btn s" data-unban="${esc(o.client)}">فك</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">مفيش مهاجمين متسجلين.</p>'}</div>`;
    box.querySelectorAll('[data-run]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { const r = await post('/api/v2/admin/security/agents/run', { id: b.dataset.run }); toast(r.note); renderLive(box); } catch (e) { toast(e.message); b.disabled = false; } }));
    box.querySelectorAll('[data-unban]').forEach((b) => (b.onclick = async () => { await post('/api/v2/admin/security/ban', { ip: b.dataset.unban, unban: true }); toast('اتفك الحظر'); renderLive(box); }));
  }
  VIEWS.security = async (v) => {
    const [s, tf] = await Promise.all([api('/api/v2/admin/security'), api('/api/v2/admin/2fa')]);
    const L = s.layers;
    const yes = (b, t) => `<li>${b ? '✅' : '⚠️'} ${t}</li>`;
    const rows = [...(s.items || []), ...(s.durable ? [] : s.memory || [])];
    v.innerHTML = `<div class="grid g2">
      <div class="card"><b>🔐 التحقق بخطوتين (2FA) للمالك</b>
        <p class="muted small">${tf.enabled ? `شغال من ${ago(tf.enabledAt)} — أي جهاز جديد هيحتاج كود من تطبيق المصادقة.` : 'مقفول. فعّله عشان حتى لو حد خد حساب جوجل بتاعك مايقدرش يدخل اللوحة.'}</p>
        <div id="tfbox">${tf.enabled ? '<button class="btn s" id="tfoff">إيقاف 2FA</button>' : `<button class="btn p" id="tfon" ${tf.encryption ? '' : 'disabled'}>تفعيل 2FA</button>${tf.encryption ? '' : '<p class="small muted">محتاج مفتاح التشفير على السيرفر الأول.</p>'}`}</div></div>
      <div class="card"><b>🧱 طبقات الحماية الشغالة</b><ul class="small" style="margin:8px 0 0;padding-inline-start:18px;line-height:1.9">
        ${yes(L.strictLimiter, 'حد صارم لمحاولات الدخول و2FA (Durable Object)')}${yes(L.rateLimitBindings.length === 5, `حد الطلبات على الحافة (${L.rateLimitBindings.length}/5)`)}
        ${yes(L.fieldEncryption, 'تشفير AES-256-GCM للإيصالات وأسرار 2FA')}
        ${yes(L.signingKey, `توقيع طلبات التطبيق (${esc(L.signing)})`)}
        ${yes(true, `توكن دخول قصير (${L.accessTokenMinutes} دقيقة) + تدوير وكشف إعادة الاستخدام`)}
        ${yes(L.telegramAlerts, 'تنبيهات أمان على تليجرام')}
        ${yes(s.durable, s.durable ? 'سجل الأحداث محفوظ في D1' : 'سجل الأحداث في الذاكرة لحد ما D1 يرجع يكتب')}
        ${yes(true, 'فخاخ (Honeypots) ومسارات أدمن وهمية + تار-بِت بيعطّل المهاجم')}
        ${yes(true, 'كشف SQLi / XSS / Traversal / أدوات الفحص + حظر متصاعد تلقائي')}
        ${yes(true, 'خانة مخفية في فورم الدخول/التسجيل لاصطياد البوتات')}
        ${yes(true, 'Subresource Integrity + CSP صارم على الموقع')}
      </ul></div></div>
      <div id="seclive"><p class="muted small" style="margin-top:12px">بيحمّل البث المباشر…</p></div>
      <div class="card" style="margin-top:12px"><b>⛔ IPs محظورة</b>
        <div class="row" style="margin:8px 0"><input class="input" id="bip" placeholder="IP" style="flex:1"><input class="input" id="bmin" type="number" value="60" style="width:90px"><button class="btn s" id="bban">حظر (دقايق)</button></div>
        ${s.bans.length ? `<table><tbody>${s.bans.map((b) => `<tr><td class="mono">${esc(b.ip)}</td><td class="small">لحد ${esc(new Date(b.until).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }))}</td><td><button class="btn s" data-unban="${esc(b.ip)}">فك الحظر</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">مفيش حد محظور دلوقتي.</p>'}</div>
      <div class="card tw" style="margin-top:12px"><b>🕵️ سجل الأحداث المريبة</b>
        ${rows.length ? `<table><thead><tr><th>الوقت</th><th>النوع</th><th>العدد</th><th>IP</th><th>الحساب</th><th>المسار</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="small">${ago(new Date(Number(r.at)).toISOString())}</td><td>${esc(KIND[r.kind] || r.kind)}</td><td>${esc(r.count)}</td><td class="mono small">${esc(r.ip)}</td><td class="small">${esc(r.who || '')}</td><td class="small mono">${esc(r.path || '')} ${esc(r.detail || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">مفيش أحداث مريبة. 👌</p>'}</div>`;
    v.querySelectorAll('[data-unban]').forEach((b) => (b.onclick = async () => { await post('/api/v2/admin/security/ban', { ip: b.dataset.unban, unban: true }); toast('اتفك الحظر'); VIEWS.security(v); }));
    const live = v.querySelector('#seclive');
    renderLive(live);
    const timer = setInterval(() => { if (!document.body.contains(live)) return clearInterval(timer); if (!document.hidden && !live.querySelector('details[open]')) renderLive(live); }, 10_000);
    v.querySelector('#bban').onclick = async () => { try { await post('/api/v2/admin/security/ban', { ip: v.querySelector('#bip').value.trim(), minutes: Number(v.querySelector('#bmin').value) }); toast('اتحظر ✅'); VIEWS.security(v); } catch (e) { toast(e.message); } };
    const on = v.querySelector('#tfon');
    if (on) on.onclick = async () => {
      try {
        const r = await post('/api/v2/admin/2fa/setup');
        v.querySelector('#tfbox').innerHTML = `<ol class="small" style="line-height:1.9;padding-inline-start:18px"><li>افتح Google Authenticator (أو أي تطبيق مصادقة) ← إضافة ← إدخال مفتاح.</li><li>المفتاح: <b class="mono" style="user-select:all">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</b> — أو <a href="${esc(r.uri)}">افتح الرابط على الموبايل</a>.</li><li>اكتب الكود اللي ظهر:</li></ol><div class="row"><input class="input" id="tfc" inputmode="numeric" maxlength="6" placeholder="123456" style="width:140px"><button class="btn p" id="tfok">تأكيد</button></div>`;
        v.querySelector('#tfok').onclick = async () => { try { const j = await post('/api/v2/admin/2fa/enable', { code: v.querySelector('#tfc').value }); localStorage.setItem('adm.2fa', j.pass); toast('2FA اتفعّل ✅'); VIEWS.security(v); } catch (e) { toast(e.message); } };
      } catch (e) { toast(e.message); }
    };
    const off = v.querySelector('#tfoff');
    if (off) off.onclick = async () => { const code = prompt('اكتب كود 2FA الحالي عشان توقفه'); if (!code) return; try { await post('/api/v2/admin/2fa/disable', { code }); localStorage.removeItem('adm.2fa'); toast('2FA اتوقف'); VIEWS.security(v); } catch (e) { toast(e.message); } };
  };
}

/** Full-screen prompt after Google sign-in when 2FA is on. Resolves once a pass is stored. */
export function otpView($, esc, post, onDone, err = '') {
  $('#app').innerHTML = `<div class="login"><div class="card"><img src="/icons/admin-512.png" alt=""><h2 style="margin:6px 0">🔐 التحقق بخطوتين</h2><p class="muted">اكتب الكود المكوّن من 6 أرقام من تطبيق المصادقة.</p>${err ? `<p class="pill bad" style="white-space:normal">${esc(err)}</p>` : ''}
  <div class="row" style="justify-content:center"><input class="input" id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="width:160px;text-align:center;font-size:22px;letter-spacing:4px"><button class="btn p" id="otpgo">دخول</button></div></div></div>`;
  const go = async () => { try { const j = await post('/api/v2/admin/2fa/verify', { code: $('#otp').value }); if (j.pass) localStorage.setItem('adm.2fa', j.pass); onDone(); } catch (e) { otpView($, esc, post, onDone, e.message); } };
  $('#otpgo').onclick = go; $('#otp').onkeydown = (e) => e.key === 'Enter' && go(); $('#otp').focus();
}
