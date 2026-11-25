// Safqa Hub → 🛡️ الأمان: owner 2FA (TOTP), intrusion log, IP bans, active defenses.
export function installSecurity({ PAGES, VIEWS, api, post, esc, ago, toast }) {
  PAGES.splice(PAGES.length - 1, 0, ['security', '🛡️', 'الأمان']);
  const KIND = {
    auth_fail: 'دخول فاشل', login_locked: 'قفل حساب', refresh_reuse: '⚠️ سرقة جلسة محتملة', rate_limited: 'طلبات كتير', sig_fail: 'توقيع غلط', sig_replay: 'إعادة إرسال',
    admin_denied: 'محاولة دخول الإدارة', otp_fail: 'كود 2FA غلط', otp_locked: 'قفل 2FA', origin_blocked: 'موقع غريب', webhook_forged: 'Webhook مزوّر', too_large: 'طلب ضخم', banned_hit: 'IP محظور', csp_report: 'CSP',
  };
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
        ${yes(L.rateLimitBindings.length === 5, `حد الطلبات على الحافة (${L.rateLimitBindings.length}/5)`)}
        ${yes(L.fieldEncryption, 'تشفير AES-256-GCM للإيصالات وأسرار 2FA')}
        ${yes(L.signingKey, `توقيع طلبات التطبيق (${esc(L.signing)})`)}
        ${yes(true, `توكن دخول قصير (${L.accessTokenMinutes} دقيقة) + تدوير وكشف إعادة الاستخدام`)}
        ${yes(L.telegramAlerts, 'تنبيهات أمان على تليجرام')}
        ${yes(s.durable, s.durable ? 'سجل الأحداث محفوظ في D1' : 'سجل الأحداث في الذاكرة لحد ما D1 يرجع يكتب')}
      </ul></div></div>
      <div class="card" style="margin-top:12px"><b>⛔ IPs محظورة</b>
        <div class="row" style="margin:8px 0"><input class="input" id="bip" placeholder="IP" style="flex:1"><input class="input" id="bmin" type="number" value="60" style="width:90px"><button class="btn s" id="bban">حظر (دقايق)</button></div>
        ${s.bans.length ? `<table><tbody>${s.bans.map((b) => `<tr><td class="mono">${esc(b.ip)}</td><td class="small">لحد ${esc(new Date(b.until).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }))}</td><td><button class="btn s" data-unban="${esc(b.ip)}">فك الحظر</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">مفيش حد محظور دلوقتي.</p>'}</div>
      <div class="card tw" style="margin-top:12px"><b>🕵️ سجل الأحداث المريبة</b>
        ${rows.length ? `<table><thead><tr><th>الوقت</th><th>النوع</th><th>العدد</th><th>IP</th><th>الحساب</th><th>المسار</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="small">${ago(new Date(Number(r.at)).toISOString())}</td><td>${esc(KIND[r.kind] || r.kind)}</td><td>${esc(r.count)}</td><td class="mono small">${esc(r.ip)}</td><td class="small">${esc(r.who || '')}</td><td class="small mono">${esc(r.path || '')} ${esc(r.detail || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">مفيش أحداث مريبة. 👌</p>'}</div>`;
    v.querySelectorAll('[data-unban]').forEach((b) => (b.onclick = async () => { await post('/api/v2/admin/security/ban', { ip: b.dataset.unban, unban: true }); toast('اتفك الحظر'); VIEWS.security(v); }));
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
