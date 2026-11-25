// Safqa Hub — owner-only genius toolkit: command agent (preview → approve → rollback), CEO brief with voice,
// competitor intel, growth advisor, campaign drafts with images, deal hunter, and the Autopilot switches.
import { play } from './asmr.js';

export function installOwner({ PAGES, VIEWS, api, post, esc, fmt, ago, toast }) {
  PAGES.splice(1, 0, ['genius', '🧠', 'أدواتي الذكية']);
  const TABS = [['cmd', '🧞', 'الأمر'], ['brief', '🎙️', 'موجز المدير'], ['deals', '🎯', 'صيد العروض'], ['campaign', '📣', 'الحملات'], ['growth', '📈', 'النمو'], ['intel', '🕵️', 'المنافسين'], ['auto', '🤖', 'الطيار الآلي']];
  const tab = () => new URLSearchParams(location.hash.split('?')[1] || '').get('t') || 'cmd';
  const speak = (text) => {
    if (!('speechSynthesis' in window)) return toast('المتصفح ده مش بيدعم القراءة بصوت');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_>`]/g, ''));
    const v = speechSynthesis.getVoices().find((x) => /ar[-_]EG/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^ar/i.test(x.lang));
    if (v) u.voice = v; u.lang = v?.lang || 'ar-EG'; u.rate = 0.98; u.pitch = 1;
    speechSynthesis.speak(u);
  };
  const STATUS = { previewed: ['مستني موافقتك', 'warn'], applied: ['اتنفذ', 'ok'], rolled_back: ['اترجع', 'bad'], skipped: ['اتجاهل', 'mut'] };
  const changeRow = (c) => `<div class="chg" data-id="${esc(c.id)}"><span>${c.source === 'auto' ? '🤖' : '🧞'}</span><div style="flex:1;min-width:0"><b>${esc(c.title)}</b><small class="muted">${esc(c.actor)} · ${ago(c.applied_at || c.at)}${c.note && c.status === 'rolled_back' ? ` · ${esc(c.note)}` : ''}</small></div><span class="pill ${(STATUS[c.status] || ['', 'mut'])[1]}">${(STATUS[c.status] || [c.status])[0]}</span>${c.status === 'applied' ? '<button class="btn s" data-rb data-sfx="whoosh">↩️ رجّع</button>' : c.status === 'previewed' ? '<button class="btn s p" data-ap data-sfx="ok">✅ نفّذ</button>' : ''}</div>`;
  const wireChanges = (root, again) => root.querySelectorAll('.chg').forEach((r) => {
    const id = r.dataset.id;
    const rb = r.querySelector('[data-rb]'); if (rb) rb.onclick = async () => { if (!confirm('ترجّع التغيير ده؟')) return; try { await post(`/api/v2/hub/changes/${id}/rollback`); play('ok'); toast('↩️ رجع زي ما كان'); again(); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); } };
    const ap = r.querySelector('[data-ap]'); if (ap) ap.onclick = async () => { try { await post(`/api/v2/hub/changes/${id}/apply`); play('chime'); toast('✅ اتنفذ — وتقدر ترجّعه في أي وقت'); again(); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); } };
  });

  VIEWS.genius = async (v) => {
    const o = await api('/api/v2/hub/owner');
    const t = tab();
    v.innerHTML = `<div class="card hero" style="padding:16px"><div class="aurora"></div><div class="row" style="position:relative">
        <div class="col" style="flex:1;min-width:220px;gap:2px"><b style="font-size:20px">🧠 أدواتي الذكية</b><span class="small muted">للمالك بس · كل حاجة بتتسجل في السجل · فاضل ${o.aiLeft} نداء AI النهارده</span></div>
        <div class="row"><span class="small">الطيار الآلي</span><button class="switch ${o.autopilot ? 'on' : ''}" id="gauto" data-sfx="${o.autopilot ? 'no' : 'chime'}" aria-label="الطيار الآلي العام"></button></div></div>
        <div class="crew" style="position:relative">${o.agents.map((a) => `<div class="mate ${a.enabled ? '' : 'off'}" title="${esc(a.role)}"><div class="ringwrap"><span>${a.emoji}</span></div><b>${esc(a.name)}</b><small>${a.rank.emoji} ${esc(a.rank.ar)} · ${a.auto ? 'لوحده' : 'يقترح'}</small></div>`).join('')}</div></div>
      <div class="tabs" style="margin-top:12px">${TABS.map(([k, e, l]) => `<button class="${k === t ? 'on' : ''}" onclick="location.hash='#/genius?t=${k}'">${e} ${l}</button>`).join('')}</div><div id="gx"></div>`;
    v.querySelector('#gauto').onclick = async (e) => { const on = !e.currentTarget.classList.contains('on'); if (!on && !confirm('تقفل الطيار الآلي؟ الوكلاء هيقترحوا بس.')) return; await post('/api/v2/hub/owner/autopilot', { global: on }); toast(on ? '🤖 الوكلاء بيديروا لوحدهم' : '✋ الوكلاء هيستنوا موافقتك'); VIEWS.genius(v); };
    const gx = v.querySelector('#gx');
    const again = () => VIEWS.genius(v);
    if (t === 'cmd') {
      gx.innerHTML = `<div class="card"><b>🧞 قول لأمين عايز إيه</b><p class="small muted">بالمصري زي ما بتكلم حد: «حط بانر رمضان» · «وقّف برومو الباقة الذهبي» · «اقفل عدسة الأسعار لـ 50%» · «شغّل صيّاد دلوقتي». هيوريك الخطة قبل ما ينفّذ، وتقدر ترجّع أي حاجة. الفلوس والحظر والمسح مش بتتعمل من هنا.</p>
        <div class="row"><input class="input" id="cmd" placeholder="اكتب أمرك…" style="flex:1"><button class="btn g" id="go" data-sfx="whoosh">✨ خطّط</button></div><div id="plan" style="margin-top:12px"></div></div>
        <div class="card"><b>📜 التغييرات (أوامر + تلقائي)</b><div class="col" style="margin-top:8px">${o.changes.map(changeRow).join('') || '<div class="empty">لسه مفيش</div>'}</div></div>`;
      wireChanges(gx, again);
      const run = async () => {
        const text = gx.querySelector('#cmd').value.trim(); if (!text) return;
        const box = gx.querySelector('#plan'); box.innerHTML = '<span class="spin"></span> أمين بيفكّر…';
        try {
          const r = await post('/api/v2/hub/command', { text });
          if (!r.id) { play(r.blocked ? 'no' : 'tap'); box.innerHTML = `<div class="hint">${r.blocked ? '⛔ ' : '🤔 '}${esc(r.say)}</div>`; return; }
          play('ok');
          box.innerHTML = `<p>${esc(r.say)}</p><table><tr><th>إيه</th><th>دلوقتي</th><th>بعد التنفيذ</th></tr>${r.actions.map((a) => `<tr><td>${esc(a.preview?.label)}${a.preview?.exists === false ? ' <span class="pill bad">مش موجود</span>' : ''}</td><td class="muted">${esc(a.preview?.before || '—')}</td><td><b>${esc(a.preview?.after || '')}</b></td></tr>`).join('')}</table>
            <div class="row" style="margin-top:10px"><button class="btn p" id="ok" data-sfx="chime">✅ نفّذ</button><button class="btn" id="no">إلغاء</button><span class="small muted">بيتسجل وتقدر ترجّعه بضغطة. «أمين» بيراقب الأخطاء بعده ويرجّعه لوحده لو حاجة باظت.</span></div>`;
          box.querySelector('#ok').onclick = async () => { try { await post(`/api/v2/hub/changes/${r.id}/apply`); toast('✅ اتنفذ'); again(); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); } };
          box.querySelector('#no').onclick = () => (box.innerHTML = '');
        } catch (e) { play('no'); box.innerHTML = `<div class="hint">⚠️ ${esc(e.message)}</div>`; }
      };
      gx.querySelector('#go').onclick = run; gx.querySelector('#cmd').onkeydown = (e) => e.key === 'Enter' && run();
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const mic = document.createElement('button'); mic.className = 'btn'; mic.textContent = '🎙️'; mic.title = 'قول الأمر بصوتك';
        mic.onclick = () => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new R(); rec.lang = 'ar-EG'; rec.onresult = (e) => { gx.querySelector('#cmd').value = e.results[0][0].transcript; run(); }; rec.start(); play('tap'); };
        gx.querySelector('#go').before(mic);
      }
    }
    if (t === 'brief') {
      const b = o.brief;
      gx.innerHTML = `<div class="card brief"><div class="row"><b style="font-size:18px">🎙️ موجز المدير</b><span class="sp"></span>${b ? `<span class="small muted">${esc(b.day)} · ${b.ai ? 'AI' : 'قالب'}</span>` : ''}</div>
        ${b ? `<div class="report" style="font-size:16px">${esc(b.body)}</div>` : '<div class="empty">الموجز بيطلع كل يوم 8 الصبح (القاهرة)</div>'}
        <div class="row" style="margin-top:12px">${b ? '<button class="btn g" id="say" data-sfx="chime">🔊 اسمعه</button><button class="btn" id="stop">⏹</button>' : ''}<button class="btn" id="fresh" data-sfx="whoosh">🔄 موجز جديد دلوقتي</button></div></div>`;
      if (b) { gx.querySelector('#say').onclick = () => speak(b.body); gx.querySelector('#stop').onclick = () => speechSynthesis.cancel(); }
      gx.querySelector('#fresh').onclick = async (e) => { e.currentTarget.innerHTML = '<span class="spin"></span>'; try { const r = await post('/api/v2/hub/brief'); play('chime'); again(); if (r.brief) setTimeout(() => speak(r.brief.body), 600); } catch (er) { toast(`⚠️ ${er.message}`); again(); } };
    }
    if (t === 'deals') {
      const h = await api('/api/v2/hub/deals-hunt');
      const cur = new Set((o.featured.items || []).map((x) => x.id));
      gx.innerHTML = `<div class="card"><div class="row"><b>🎯 صيّاد: عروض عدّت التحقق</b><span class="sp"></span><span class="pill ${o.featured.on ? 'ok' : 'mut'}">«صيد اليوم» ${o.featured.on ? `ظاهر · ${(o.featured.items || []).length} عرض · ${ago(o.featured.at)}` : 'مش ظاهر'}</span></div>
        <p class="small muted">كل عرض اتأكدنا إن سعره أقل من متوسط 30 يوم فعلًا، ومتوفر، وسعره متحدّث آخر 3 أيام، ومش خصم منفوخ.</p>
        <div class="grid g2">${h.items.map((d) => `<label class="card deal" style="margin:0;display:flex;gap:10px;align-items:center;cursor:pointer"><input type="checkbox" value="${esc(d.id)}" ${cur.has(d.id) || (!cur.size) ? 'checked' : ''}>${d.image ? `<img src="${esc(d.image)}" alt="" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:10px">` : ''}<div style="flex:1;min-width:0"><b class="small">${esc(d.title)}</b><div><b style="color:var(--gold)">${fmt(d.price)} ج</b> <s class="muted small">${fmt(d.old)}</s> <span class="pill ok">−${d.pct}%</span></div><small class="muted">${esc(d.store || '')} · ${esc(d.why)}</small></div></label>`).join('') || '<div class="empty">مفيش عروض عدّت التحقق دلوقتي</div>'}</div>
        <div class="row" style="margin-top:12px"><button class="btn g" id="feat" data-sfx="coin">🎯 نزّل المختار في «صيد اليوم»</button><button class="btn" id="hunt" data-sfx="whoosh">▶ شغّل صيّاد</button></div></div>`;
      gx.querySelector('#feat').onclick = async () => { const ids = [...gx.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value); try { await post('/api/v2/hub/deals-hunt/feature', { ids }); play('chime'); toast('🎯 نزلت في الرئيسية'); again(); } catch (e) { toast(`⚠️ ${e.message}`); } };
      gx.querySelector('#hunt').onclick = async () => { const r = await post('/api/v2/hub/agents/sayyad/run'); toast(r.note || 'تمام'); again(); };
    }
    if (t === 'campaign') {
      const docs = await api('/api/v2/hub/docs?kind=campaign');
      const card = (d) => { const c = d.data?.copy || {}; return `<div class="card camp"><div class="row"><b>${esc(d.title)}</b><span class="sp"></span><span class="pill info">مسودة</span><span class="small muted">${ago(d.at)}</span></div>
        <div class="row" style="align-items:flex-start;margin-top:8px">${d.data?.image ? `<img src="${d.data.image}" alt="صورة الحملة (متولّدة بالذكاء الاصطناعي)" style="width:180px;border-radius:12px">` : ''}<div class="col" style="flex:1;min-width:220px">
        ${[['✈️ تيليجرام', c.telegram], ['💬 واتساب', c.whatsapp], ['📘 فيسبوك', c.facebook], ['𝕏', c.x]].filter((x) => x[1]).map(([l, txt]) => `<div class="note"><div class="row"><b class="small">${l}</b><span class="sp"></span><button class="btn s" data-copy="${esc(txt)}">📋 نسخ</button></div><div class="small" style="white-space:pre-wrap">${esc(txt)}</div></div>`).join('')}</div></div></div>`; };
      gx.innerHTML = `<div class="card"><b>📣 حملة جديدة</b><p class="small muted">مسودات بس: انسخها وانشرها بنفسك. النشر التلقائي بيبقى على قنوات صفقة بس (شريط الموقع، وتيليجرام صفقة لو سمحت بيه في «الطيار الآلي»).</p>
        <div class="row"><input class="input" id="goal" placeholder="مثلاً: عروض الجمعة البيضا على الموبايلات" style="flex:1"><label class="row small" style="margin:0"><input type="checkbox" id="img" checked> بصورة</label><button class="btn g" id="mk" data-sfx="whoosh">✨ اكتبها</button></div></div>
        ${docs.items.map(card).join('') || '<div class="empty">لسه مفيش حملات</div>'}`;
      gx.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.copy); play('ok'); toast('📋 اتنسخت'); }));
      gx.querySelector('#mk').onclick = async (e) => { const b = e.currentTarget; b.innerHTML = '<span class="spin"></span> «حملة» بتكتب…'; try { await post('/api/v2/hub/campaign', { goal: gx.querySelector('#goal').value, image: gx.querySelector('#img').checked }); play('chime'); again(); } catch (er) { play('no'); toast(`⚠️ ${er.message}`); b.textContent = '✨ اكتبها'; } };
    }
    if (t === 'growth') {
      const g = await api('/api/v2/hub/growth');
      const m = g.metrics, ideas = g.latest?.data?.ideas || [];
      const maxD = Math.max(1, ...m.daily.map((x) => x.n));
      const k = (e, l, val, sub) => `<div class="card kpi"><span class="e">${e}</span><div class="v">${val}</div><div class="l">${l}</div><div class="small muted">${sub}</div></div>`;
      const pct = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))}%` : '');
      gx.innerHTML = `<div class="grid g4">${k('👥', 'أعضاء جداد (7 أيام)', m.new7, pct(m.new7, m.newPrev7))}${k('💎', 'مشتركين مدفوعين', m.paid, `${m.users ? ((m.paid / m.users) * 100).toFixed(1) : 0}% تحويل`)}${k('💰', 'إيراد 30 يوم', `${fmt(m.revenue30)} ج`, pct(m.revenue30, m.revenuePrev30))}${k('🧾', 'بدأوا دفع / كمّلوا', `${m.checkoutsStarted30}/${m.checkoutsPaid30}`, 'آخر 30 يوم')}${k('🔔', 'مراقبات', fmt(m.watchlist), `${m.telegram} على تيليجرام`)}${k('🔥', 'تصويتات الأسبوع', fmt(m.votes7), `${m.submissions7} رابط اتضاف`)}</div>
        <div class="card"><b>📈 تسجيلات آخر 14 يوم</b><div class="bar" style="margin-top:10px">${m.daily.map((x) => `<i style="height:${(x.n / maxD) * 100}%" title="${esc(x.day)}: ${x.n}"></i>`).join('')}</div></div>
        <div class="card"><div class="row"><b>💡 نماء بيقول</b><span class="sp"></span><button class="btn s" id="re" data-sfx="whoosh">🔄 حلّل دلوقتي</button></div>${g.latest ? `<div class="report">${esc(g.latest.body)}</div>` : '<div class="empty">التحليل بيطلع كل يوم 10 الصبح</div>'}
        <div class="col" style="margin-top:10px">${ideas.map((i) => `<div class="note"><b>${esc(i.title)}</b><div class="small muted">${esc(i.why)}</div>${i.action ? `<button class="btn s p" style="margin-top:6px" data-idea='${esc(JSON.stringify(i.action))}' data-sfx="ok">⚡ نفّذ (قابل للرجوع)</button>` : ''}</div>`).join('')}</div></div>
        <div class="card"><b>👀 أكتر حاجات بتتشاف</b><div class="tl" style="margin-top:8px">${m.topViewed.map((x) => `<div><span>${fmt(x.views)}</span><div><b class="small">${esc(x.title)}</b><small class="muted">${esc(x.category || '')}</small></div></div>`).join('')}</div></div>`;
      gx.querySelector('#re').onclick = async () => { const r = await post('/api/v2/hub/agents/numuw/run'); toast(r.note || 'تمام'); again(); };
      gx.querySelectorAll('[data-idea]').forEach((b) => (b.onclick = async () => { const a = JSON.parse(b.dataset.idea); const text = a.t === 'banner' ? `حط بانر: ${a.ar}` : `${a.enabled ? 'شغّل' : 'وقّف'} ${a.key}`; location.hash = '#/genius?t=cmd'; setTimeout(() => { const i = document.querySelector('#cmd'); if (i) { i.value = text; document.querySelector('#go').click(); } }, 500); }));
    }
    if (t === 'intel') {
      const docs = await api('/api/v2/hub/docs?kind=intel');
      const last = docs.items[0];
      gx.innerHTML = `<div class="card"><div class="row"><b>🕵️ عين: تحركات المنافسين</b><span class="sp"></span><button class="btn s" id="scan" data-sfx="whoosh">🔄 افحص دلوقتي</button></div>
        <p class="small muted">بيقرا الصفحات العامة بس، بهوية واضحة (SafqaBot)، وبيحترم robots.txt — مرتين في اليوم.</p>
        ${last ? `<div class="report">${esc(last.body)}</div><div class="grid g2" style="margin-top:10px">${(last.data?.sites || []).map((s) => `<div class="note"><div class="row"><b>${esc(s.name)}</b><span class="sp"></span><span class="pill ${s.status === 'ok' ? 'ok' : s.status === 'robots' ? 'warn' : 'bad'}">${s.status === 'ok' ? 'اتقرا' : esc(s.status)}</span></div>${s.title ? `<div class="small muted">${esc(s.title)}</div>` : ''}${(s.promo || []).slice(0, 3).map((p) => `<div class="small">• ${esc(p)}</div>`).join('')}</div>`).join('')}</div>` : '<div class="empty">أول فحص 9 الصبح أو دوس «افحص دلوقتي»</div>'}</div>`;
      gx.querySelector('#scan').onclick = async (e) => { e.currentTarget.innerHTML = '<span class="spin"></span>'; const r = await post('/api/v2/hub/agents/ain/run'); toast(r.note || 'تمام'); again(); };
    }
    if (t === 'auto') {
      gx.innerHTML = `<div class="card"><b>🤖 الطيار الآلي</b><p class="small muted">لما يبقى شغّال، الوكلاء بينفّذوا لوحدهم الحاجات الآمنة اللي ترجع (صيد اليوم، شريط الحملة، ضبط المزايا)، بحد يومي ورتبة كفاية. أي تغيير بيتراقب وبيرجع لوحده لو الأخطاء زادت. <b>الفلوس والحظر والمسح دايمًا بموافقتك.</b></p>
        <div class="row"><span>الطيار الآلي العام</span><button class="switch ${o.autopilot ? 'on' : ''}" id="g2"></button><span class="sp"></span><span>نشر الحملات على تيليجرام صفقة (للمشتركين، مرة في اليوم)</span><button class="switch ${o.campaignTelegram ? 'on' : ''}" id="tg"></button></div></div>
        <div class="grid g2">${o.agents.map((a) => { const r = o.rules[a.id]; return `<div class="card agentcard" style="--c:${a.color}" data-id="${a.id}"><div class="row"><span class="av">${a.emoji}</span><div class="col" style="flex:1;gap:2px"><b>${esc(a.name)} <span class="pill info">${a.rank.emoji} ${esc(a.rank.ar)}</span></b><span class="small muted">${esc(a.role)}</span></div></div>
          <div class="row small" style="margin-top:8px"><span>شغّال</span><button class="switch ${a.enabled ? 'on' : ''}" data-en></button><span>ينفّذ لوحده</span><button class="switch ${a.auto ? 'on' : ''}" data-auto></button><span class="sp"></span>${r ? `<span class="muted">حد يومي ${r.cap} · من رتبة ${esc(r.minRank)}</span>` : ''}</div>
          <div class="small muted" style="margin-top:6px">📝 ${esc(a.lastNote || 'لسه ما اشتغلش')} · ${ago(a.lastRun)}</div><div class="row" style="margin-top:8px"><button class="btn s p" data-run data-sfx="whoosh">▶ شغّله</button></div></div>`; }).join('')}</div>`;
      gx.querySelector('#g2').onclick = () => v.querySelector('#gauto').click();
      gx.querySelector('#tg').onclick = async (e) => { const on = !e.currentTarget.classList.contains('on'); if (on && !confirm('«حملة» هتنشر مرة في اليوم بالكتير على تيليجرام صفقة للمشتركين بس. موافق؟')) return; await post('/api/v2/hub/owner/autopilot', { telegram: on }); play('ok'); again(); };
      gx.querySelectorAll('.agentcard').forEach((c) => {
        const id = c.dataset.id;
        c.querySelector('[data-en]').onclick = async (e) => { await post(`/api/v2/hub/agents/${id}`, { enabled: !e.currentTarget.classList.contains('on') }); play('ok'); again(); };
        c.querySelector('[data-auto]').onclick = async (e) => { await post(`/api/v2/hub/agents/${id}`, { auto: !e.currentTarget.classList.contains('on') }); play('ok'); again(); };
        c.querySelector('[data-run]').onclick = async (e) => { e.currentTarget.innerHTML = '<span class="spin"></span>'; try { const r = await post(`/api/v2/hub/agents/${id}/run`); play('chime'); toast(r.note || 'تمام'); } catch (er) { toast(`⚠️ ${er.message}`); } again(); };
      });
    }
  };
}
