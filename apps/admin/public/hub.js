// Safqa Hub — command center layer on top of the admin PWA: autopilot agents, decisions, remote config, audit,
// reports, deploy status, notifications and native-app pairing. Same Google-only owner session as the admin.
import { play, sound } from './asmr.js';

export function installHub({ PAGES, VIEWS, api, post, esc, fmt, ago, toast }) {
  PAGES.unshift(['hub', '🛰️', 'مركز القيادة'], ['decisions', '🧭', 'قرارات مستنياك'], ['autopilot', '🤝', 'الطيار الآلي']);
  PAGES.push(['flags', '🎛️', 'المزايا والتحكم عن بعد'], ['audit', '📜', 'سجل كل حاجة'], ['reports', '🗞️', 'التقارير اليومية'], ['deploys', '🚀', 'حالة النشر'], ['notify', '🔔', 'إشعار للكل'], ['pair', '📱', 'ربط تطبيق Hub']);
  const SEV = { ok: '✅', info: '•', warn: '⚠️', bad: '⛔', error: '⛔' };
  const ring = (pct, color, size = 64, label = '') => `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 36 36" aria-label="${esc(label)}"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${Math.max(0, Math.min(100, pct)) * 0.974} 100" transform="rotate(-90 18 18)" style="transition:stroke-dasharray 1s cubic-bezier(.2,1.4,.4,1)"/></svg>`;
  const agentPct = (a) => (a.next ? Math.round(((a.xp - a.rank.min) / (a.next.min - a.rank.min)) * 100) : 100);
  const escCard = (e, agents) => {
    const ag = agents.find((x) => x.id === e.agent_id);
    return `<div class="card esc" data-id="${esc(e.id)}"><div class="row"><span class="av" style="border-color:${ag?.color || 'var(--line)'}">${ag?.emoji || '🤖'}</span><div class="col" style="gap:2px;flex:1;min-width:0"><b>${esc(e.title)}</b><span class="small muted">${esc(ag?.name || e.agent_id)} · ${esc(e.kind)} · ${ago(e.at)}</span></div></div>
      ${e.body ? `<p class="small" style="white-space:pre-wrap;margin:10px 0">${esc(e.body)}</p>` : ''}
      ${e.suggestion ? `<p class="small hint">💡 اقتراح الوكيل: <b>${esc((e.options.find((o) => o.id === e.suggestion) || {}).ar || e.suggestion)}</b></p>` : ''}
      <div class="row">${e.options.map((o) => `<button class="btn s ${o.id === e.suggestion ? 'p' : ''}" data-dec="${esc(o.id)}" data-sfx="${o.id === e.suggestion ? 'ok' : 'tap'}">${esc(o.ar)}</button>`).join('')}</div></div>`;
  };
  const wireEsc = (root, after) => root.querySelectorAll('.esc [data-dec]').forEach((b) => (b.onclick = async () => {
    const card = b.closest('.esc'); card.style.opacity = '.5';
    try { const r = await post(`/api/v2/hub/escalations/${card.dataset.id}`, { decision: b.dataset.dec }); play('ok'); toast(r?.note || '✅ اتسجل القرار — والوكيل اتعلّم منه'); card.classList.add('gone'); setTimeout(() => (after ? after() : card.remove()), 350); }
    catch (e) { play('no'); card.style.opacity = ''; toast(`⚠️ ${e.message}`); }
  }));

  VIEWS.hub = async (v) => {
    const [o, dep] = await Promise.all([api('/api/v2/hub/overview'), api('/api/v2/hub/deploys').catch(() => null)]);
    const s = o.stats, h = new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false });
    const hi = +h < 12 ? 'صباح الفل' : +h < 18 ? 'مساء النور' : 'مساء الفل';
    const up = dep?.surfaces?.filter((x) => x.ok).length ?? 0, tot = dep?.surfaces?.length ?? 0;
    const used = (s.aiUsage || []).reduce((a, x) => a + x.calls, 0);
    const maxH = Math.max(1, ...o.hourly.map((x) => x.n));
    const off = o.flags.filter((f) => !f.enabled);
    v.innerHTML = `<section class="hero card"><div class="aurora"></div><div class="row" style="position:relative">
        <div class="col" style="flex:1;min-width:240px"><span class="small muted">SAFQA HUB · ${new Date().toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h2 style="margin:0;font-size:28px">${hi} يا ريّس 👋</h2>
          <p class="muted" style="margin:0">${o.escalations.length ? `في <b style="color:var(--gold)">${o.escalations.length}</b> قرار محتاجك — الباقي الوكلاء ماسكينه.` : 'مفيش حاجة محتاجاك دلوقتي — الوكلاء ماسكين الدنيا ✨'}</p>
          <div class="row" style="margin-top:8px"><button class="btn g" id="runAll" data-sfx="whoosh">⚡ شغّل كل الوكلاء دلوقتي</button><a class="btn" href="#/decisions">🧭 القرارات</a><a class="btn" href="#/flags">🎛️ المزايا</a></div></div>
        <div class="row" style="gap:18px">
          <div class="gauge">${ring(tot ? (up / tot) * 100 : 0, up === tot ? '#22c55e' : '#f59e0b', 84)}<b>${up}/${tot}</b><small>الخدمات شغالة</small></div>
          <div class="gauge">${ring((1 - used / Math.max(1, s.aiBudget)) * 100, '#a78bfa', 84)}<b>${s.aiBudgetLeft}</b><small>نداء AI فاضل</small></div>
          <div class="gauge">${ring(Math.min(100, (o.errors24 / 50) * 100), o.errors24 > 20 ? '#ef4444' : '#38bdf8', 84)}<b>${o.errors24}</b><small>أخطاء 24س</small></div>
        </div></div></section>
      <div class="grid g4" style="margin-top:14px">
        ${[['👥', 'الأعضاء', fmt(s.users), `+${s.newUsers24h} النهارده`], ['💳', 'مدفوعات مستنية', `<a href="#/payments">${s.paymentsPending}</a>`, 'إنستاباي'], ['💰', 'إيراد 30 يوم', `${fmt(s.revenue30)} ج`, `الإجمالي ${fmt(s.revenue)} ج`], ['🛒', 'منتجات', fmt(s.products), s.snapshot ? `آخر سحب ${ago(s.snapshot.recordedAt)}` : '']].map(([e, l, val, sub]) => `<div class="card kpi tilt"><span class="e">${e}</span><div class="v">${val}</div><div class="l">${l}</div><div class="small muted">${sub}</div></div>`).join('')}
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><div class="row"><b>🤝 فريق الإدارة الآلي</b><span class="sp"></span><a class="btn s" href="#/autopilot">كل الوكلاء</a></div>
          <div class="crew">${o.agents.map((a) => `<div class="mate ${a.enabled ? '' : 'off'}" title="${esc(a.role)}"><div class="ringwrap">${ring(agentPct(a), a.color, 58)}<span>${a.emoji}</span></div><b>${esc(a.name)}</b><small>${a.rank.emoji} ${esc(a.rank.ar)} · ${a.xp}XP</small></div>`).join('')}</div></div>
        <div class="card"><div class="row"><b>🧭 قرارات مستنياك</b><span class="sp"></span><a class="btn s" href="#/decisions">الكل</a></div>
          <div class="col" id="escs" style="margin-top:8px">${o.escalations.slice(0, 3).map((e) => escCard(e, o.agents)).join('') || '<div class="empty">🎉 صفر قرارات — استمتع بيومك</div>'}</div></div>
        <div class="card"><b>🗞️ آخر تقرير من راوي</b>${o.report ? `<p class="small muted">${esc(o.report.day)}</p><div class="report">${esc(o.report.body)}</div>` : '<div class="empty">التقرير بيطلع الساعة 10 بالليل (القاهرة)</div>'}</div>
        <div class="card"><div class="row"><b>📜 اللي حصل آخر 24 ساعة</b><span class="sp"></span><a class="btn s" href="#/audit">السجل</a></div>
          <div class="bar" style="margin:10px 0">${o.hourly.map((x) => `<i style="height:${(x.n / maxH) * 100}%" title="${esc(x.h)}: ${x.n}"></i>`).join('')}</div>
          <div class="tl">${o.audit.slice(0, 8).map((a) => `<div><span>${SEV[a.severity] || '•'}</span><div><b>${esc(a.title)}</b><small class="muted">${esc(a.actor)} · ${ago(a.at)}</small></div></div>`).join('')}</div></div>
      </div>
      ${off.length ? `<div class="card" style="margin-top:14px;border-color:var(--warn)">🎛️ مزايا مقفولة: ${off.map((f) => `<span class="pill warn">${esc(f.key)}${f.rolled_back_at ? ' (حارس رجّعها)' : ''}</span>`).join(' ')}</div>` : ''}`;
    wireEsc(v, () => VIEWS.hub(v));
    v.querySelectorAll('.tilt').forEach((el) => { el.onpointermove = (e) => { const r = el.getBoundingClientRect(); el.style.transform = `perspective(600px) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 8}deg) rotateX(${-((e.clientY - r.top) / r.height - 0.5) * 8}deg)`; }; el.onpointerleave = () => (el.style.transform = ''); });
    v.querySelector('#runAll').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> الوكلاء شغالين…';
      try { const r = await post('/api/v2/hub/agents/all/run'); play('chime'); toast(`✅ ${r.items.length} وكلاء خلصوا — ${r.items.map((x) => x.note || x.id).filter(Boolean).slice(0, 2).join(' · ')}`); VIEWS.hub(v); } catch (er) { play('no'); toast(`⚠️ ${er.message}`); b.disabled = false; }
    };
  };

  VIEWS.decisions = async (v) => {
    const st = new URLSearchParams(location.hash.split('?')[1] || '').get('s') || 'open';
    const [r, ag] = await Promise.all([api(`/api/v2/hub/escalations?status=${st}`), api('/api/v2/hub/agents')]);
    v.innerHTML = `<div class="tabs">${[['open', 'مفتوحة'], ['decided', 'اتقررت']].map(([k, t]) => `<button class="${k === st ? 'on' : ''}" data-href="#/decisions?s=${k}">${t}</button>`).join('')}</div>
      <p class="muted small">الوكلاء بيرجعولك في القرارات الحقيقية بس. كل قرار بتاخده بيعلّمهم: لو وافقت اقتراحهم بياخدوا +10 خبرة، لو خالفته −5.</p>
      <div class="grid g2">${r.items.map((e) => (st === 'open' ? escCard(e, ag.items) : `<div class="card"><b>${esc(e.title)}</b><p class="small muted">${esc(e.agent_id)} · القرار: <b>${esc(e.decision)}</b> · ${ago(e.decided_at)}</p></div>`)).join('') || '<div class="empty">مفيش حاجة هنا 🎉</div>'}</div>`;
    wireEsc(v);
  };

  VIEWS.autopilot = async (v) => {
    const r = await api('/api/v2/hub/agents');
    v.innerHTML = `<div class="card ladder"><b>🎖️ سلّم الترقيات</b><div class="row" style="margin-top:8px">${r.ranks.map((k) => `<div class="rk"><span>${k.emoji}</span><b>${esc(k.ar)}</b><small>${k.min}+ XP</small><small class="muted">${esc(k.autonomy)}</small></div>`).join('<i class="arrow">←</i>')}</div>
      <p class="small muted" style="margin:8px 0 0">كل تشغيلة ناجحة = +1 خبرة. موافقتك على اقتراح = +10، رفضك = −5. أمين الخزنة مثلاً مش بيعتمد إيصال لوحده غير لما يبقى «خبير» وثقته ≥ 90%.</p></div>
      <div class="grid g2" style="margin-top:14px">${r.items.map((a) => `<div class="card agentcard" style="--c:${a.color}" data-id="${a.id}">
        <div class="row"><div class="ringwrap">${ring(agentPct(a), a.color, 66)}<span>${a.emoji}</span></div><div class="col" style="gap:2px;flex:1"><b style="font-size:18px">${esc(a.name)} <span class="pill info">${a.rank.emoji} ${esc(a.rank.ar)}${a.rankOverride ? ' (يدوي)' : ''}</span></b><span class="small muted">${esc(a.role)}</span>
          <span class="small">${a.xp} XP${a.next ? ` · فاضل ${a.next.need} لـ ${a.next.emoji} ${esc(a.next.ar)}` : ' · أعلى رتبة 👑'}</span></div><button class="switch ${a.enabled ? 'on' : ''}" data-en aria-label="تشغيل/إيقاف"></button></div>
        <div class="row small muted" style="margin:10px 0">🔁 كل ${a.every >= 60 ? `${a.every / 60} ساعة` : `${a.every} دقيقة`} · ${a.runs} تشغيلة · ✅ ${a.okRuns} · ❌ ${a.failed} · آخر مرة ${ago(a.lastRun)}</div>
        ${a.lastNote ? `<div class="small note">📝 ${esc(a.lastNote)}</div>` : ''}
        <div class="row" style="margin-top:10px"><button class="btn s p" data-run data-sfx="whoosh">▶ شغّله دلوقتي</button><button class="btn s" data-xp="25" data-sfx="coin">🏅 +25 مكافأة</button>
          <select class="s" data-rank style="width:auto;padding:5px 8px"><option value="">رتبة تلقائية</option>${r.ranks.map((k) => `<option value="${k.id}" ${a.rankOverride === k.id ? 'selected' : ''}>${k.emoji} ${esc(k.ar)}</option>`).join('')}</select></div></div>`).join('')}</div>`;
    v.querySelectorAll('.agentcard').forEach((c) => {
      const id = c.dataset.id;
      const upd = async (b) => { try { await post(`/api/v2/hub/agents/${id}`, b); play('ok'); VIEWS.autopilot(v); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); } };
      c.querySelector('[data-en]').onclick = (e) => upd({ enabled: !e.currentTarget.classList.contains('on') });
      c.querySelector('[data-xp]').onclick = () => upd({ xp: 25 });
      c.querySelector('[data-rank]').onchange = (e) => upd({ rankOverride: e.target.value || null });
      c.querySelector('[data-run]').onclick = async (e) => { const b = e.currentTarget; b.innerHTML = '<span class="spin"></span>'; try { const x = await post(`/api/v2/hub/agents/${id}/run`); play('chime'); toast(`${x.note || '✅ خلص'}`); VIEWS.autopilot(v); } catch (er) { play('no'); toast(`⚠️ ${er.message}`); } };
    });
  };

  VIEWS.flags = async (v) => {
    const [r, ev] = await Promise.all([api('/api/v2/hub/flags'), api('/api/v2/hub/events').catch(() => ({ byFlag: [] }))]);
    const errs = Object.fromEntries(ev.byFlag.map((x) => [x.flag, x]));
    v.innerHTML = `<p class="muted small">أي تغيير هنا بيوصل للموقع والتطبيق خلال 5 دقايق من غير تحديث. «حارس» بيقفل أي ميزة عليها حماية لو عملت ≥8 أخطاء عند ≥3 مستخدمين في 15 دقيقة.</p>
      <div class="grid g2">${r.items.map((f) => { const e = errs[f.key]; return `<div class="card flag" data-k="${esc(f.key)}"><div class="row"><div class="col" style="gap:2px;flex:1"><b class="mono" style="text-align:start">${esc(f.key)}</b><span class="small muted">${esc(f.description || '')}</span></div><button class="switch ${f.enabled ? 'on' : ''}" data-en data-sfx="${f.enabled ? 'no' : 'ok'}"></button></div>
        <div class="row small" style="margin-top:10px"><label style="margin:0">نسبة المستخدمين</label><input type="range" min="0" max="100" step="5" value="${f.rollout}" data-roll style="flex:1"><b data-rv>${f.rollout}%</b></div>
        <div class="row small muted" style="margin-top:6px">${f.guard ? '🛡️ محمية بحارس' : '— من غير حماية'} · ${esc(f.updated_by || '')} ${ago(f.updated_at)}${f.rolled_back_at ? ` · <span class="pill bad">اترجعت تلقائيًا ${ago(f.rolled_back_at)}</span>` : ''}${e ? ` · <span class="pill warn">${e.n} خطأ/${e.users} مستخدم (24س)</span>` : ''}</div>
        ${f.key === 'banner' ? `<div class="row" style="margin-top:8px"><input class="input" data-val placeholder="نص الشريط" value="${esc((() => { try { return JSON.parse(f.value || '{}').ar || ''; } catch { return ''; } })())}"><button class="btn s p" data-save>حفظ</button></div>` : ''}</div>`; }).join('')}</div>
      <div class="card" style="margin-top:14px"><b>➕ ميزة جديدة</b><div class="row" style="margin-top:8px"><input class="input mono" id="nk" placeholder="new_feature_key" style="flex:1"><input class="input" id="nd" placeholder="وصف" style="flex:2"><button class="btn p" id="add">إضافة</button></div></div>`;
    const set = async (k, b) => { try { await post(`/api/v2/hub/flags/${k}`, b); toast('✅ اتحفظ — هيوصل للكل خلال دقايق'); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); } };
    v.querySelectorAll('.flag').forEach((c) => {
      const k = c.dataset.k;
      c.querySelector('[data-en]').onclick = async (e) => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); await set(k, { enabled: on }); };
      const rg = c.querySelector('[data-roll]'); rg.oninput = () => (c.querySelector('[data-rv]').textContent = `${rg.value}%`); rg.onchange = () => { play('tap'); set(k, { rollout: +rg.value }); };
      const sv = c.querySelector('[data-save]'); if (sv) sv.onclick = () => set(k, { value: { ar: c.querySelector('[data-val]').value, level: 'info' }, enabled: true });
    });
    v.querySelector('#add').onclick = async () => { const k = v.querySelector('#nk').value.trim(); if (!/^[a-z0-9_]{2,40}$/.test(k)) return toast('الاسم: حروف إنجليزي صغيرة وأرقام و _'); await set(k, { enabled: false, description: v.querySelector('#nd').value }); VIEWS.flags(v); };
  };

  VIEWS.audit = async (v) => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const r = await api(`/api/v2/hub/audit${q.get('kind') ? `?kind=${encodeURIComponent(q.get('kind'))}` : ''}`);
    const kinds = [...new Set(r.items.map((x) => x.kind))];
    v.innerHTML = `<div class="tabs"><button class="${!q.get('kind') ? 'on' : ''}" data-href="#/audit">الكل</button>${kinds.map((k) => `<button class="${q.get('kind') === k ? 'on' : ''}" data-href="#/audit?kind=${esc(k)}">${esc(k)}</button>`).join('')}</div>
      <div class="grid g2"><div class="card"><b>🤖 الوكلاء والنظام</b><div class="tl" style="margin-top:8px">${r.items.map((a) => `<div><span>${SEV[a.severity] || '•'}</span><div><b>${esc(a.title)}</b><small class="muted">${esc(a.actor)} · ${esc(a.kind)} · ${ago(a.at)}</small>${a.detail ? `<details><summary class="small muted">تفاصيل</summary><pre class="mono small">${esc(a.detail)}</pre></details>` : ''}</div></div>`).join('') || '<div class="empty">فاضي</div>'}</div></div>
      <div class="card"><b>👤 عمليات الإدارة</b><div class="tl" style="margin-top:8px">${r.admin.map((a) => `<div><span>•</span><div><b>${esc(a.title)}</b><small class="muted">${esc(a.actor)} · ${ago(a.at)}</small></div></div>`).join('') || '<div class="empty">فاضي</div>'}</div></div></div>`;
  };

  VIEWS.reports = async (v) => {
    const r = await api('/api/v2/hub/reports');
    v.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn g" id="gen" data-sfx="whoosh">📜 اطلب تقرير دلوقتي</button><span class="muted small">راوي بيكتب تقرير كل يوم الساعة 10 بالليل بتوقيت القاهرة (نداء AI واحد).</span></div>
      <div class="col">${r.items.map((x) => `<div class="card"><div class="row"><b>${esc(x.day)}</b><span class="pill ${x.ai ? 'info' : 'mut'}">${x.ai ? 'كتبه AI' : 'تقرير تلقائي من غير AI'}</span><span class="sp"></span><span class="small muted">${ago(x.at)}</span></div><div class="report">${esc(x.body)}</div>
        <div class="row small muted" style="margin-top:8px">${Object.entries(x.stats || {}).slice(0, 10).map(([k, val]) => `<span class="pill mut">${esc(k)}: ${esc(typeof val === 'object' ? JSON.stringify(val) : val)}</span>`).join('')}</div></div>`).join('') || '<div class="empty">لسه مفيش تقارير</div>'}</div>`;
    v.querySelector('#gen').onclick = async () => { try { await post('/api/v2/hub/agents/rawi/run'); play('chime'); VIEWS.reports(v); } catch (e) { toast(`⚠️ ${e.message}`); } };
  };

  VIEWS.deploys = async (v) => {
    const d = await api('/api/v2/hub/deploys');
    v.innerHTML = `<div class="grid g4">${d.surfaces.map((s) => `<div class="card kpi"><span class="e">${s.ok ? '🟢' : '🔴'}</span><div class="v" style="font-size:20px">${esc(s.ar)}</div><div class="l">${s.ok ? `شغال · ${s.ms}ms` : `واقع (${s.status})`}</div><a class="small" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace('https://', ''))}</a></div>`).join('')}
      <div class="card kpi"><span class="e">✨</span><div class="v" style="font-size:20px">${esc(d.changelog)}</div><div class="l">آخر إصدار في «الجديد»</div></div></div>
      <div class="grid g2" style="margin-top:14px"><div class="card"><b>🧾 آخر التعديلات (GitHub)</b><div class="tl" style="margin-top:8px">${d.commits.map((c) => `<div><span class="mono small">${esc(c.sha)}</span><div><b>${esc(c.msg)}</b><small class="muted">${esc(c.author)} · ${ago(c.at)}</small></div></div>`).join('')}</div></div>
      <div class="card"><b>📦 الإصدارات وملفات APK</b><div class="col" style="margin-top:8px">${d.releases.map((r) => `<div class="row"><a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.tag)}</b></a><span class="small muted">${ago(r.at)}</span><span class="sp"></span>${r.assets.map((a) => `<a class="btn s" href="${esc(a.url)}">⬇ ${esc(a.name)} · ${(a.size / 1048576).toFixed(0)}MB · ${a.downloads}</a>`).join('')}</div>`).join('') || '<div class="empty">مفيش</div>'}</div></div></div>
      <p class="small muted">بيتحدّث كل 5 دقايق · ${ago(d.at)}</p>`;
  };

  VIEWS.notify = async (v) => {
    v.innerHTML = `<div class="card" style="max-width:640px"><label>العنوان</label><input class="input" id="t" maxlength="120" placeholder="مثلاً: عروض الجمعة البيضا بدأت 🔥"><label style="margin-top:10px">التفاصيل</label><textarea id="b" rows="4" maxlength="1000"></textarea>
      <div class="row" style="margin-top:10px"><label style="margin:0">النوع</label><select id="l" style="width:auto"><option value="info">معلومة</option><option value="deal">عرض</option><option value="warn">تنبيه</option></select>
      <label class="row" style="margin:0"><input type="checkbox" id="bn" checked> شريط فوق الموقع والتطبيق</label><label class="row" style="margin:0"><input type="checkbox" id="tg"> تيليجرام (المشتركين بس)</label></div>
      <button class="btn g" id="send" style="margin-top:14px" data-sfx="whoosh">🔔 ابعت</button><p class="small muted">بيتنشر كإعلان داخل الموقع. تيليجرام بيوصل بس للي اشتركوا بنفسهم في @SafqaDealsBot.</p></div>`;
    v.querySelector('#send').onclick = async () => {
      const t = v.querySelector('#t').value.trim(); if (!t) return toast('اكتب عنوان');
      if (!confirm(`هيتنشر للكل:\n«${t}»\nمتأكد؟`)) return;
      try { const r = await post('/api/v2/hub/notify', { title: t, body: v.querySelector('#b').value, level: v.querySelector('#l').value, banner: v.querySelector('#bn').checked, telegram: v.querySelector('#tg').checked }); play('chime'); toast(`✅ اتنشر${r.telegram ? ` · ${r.telegram} على تيليجرام` : ''}`); } catch (e) { play('no'); toast(`⚠️ ${e.message}`); }
    };
  };

  VIEWS.pair = async (v) => {
    v.innerHTML = `<div class="card pairc" style="max-width:560px;text-align:center"><div style="font-size:54px">📱</div><h2 style="margin:4px 0">اربط تطبيق Safqa Hub</h2>
      <p class="muted">نزّل تطبيق Safqa Hub على أندرويد، وافتحه، واكتب الكود ده. الكود صالح 5 دقايق ولمرة واحدة، وبيتسجل في السجل.</p>
      <button class="btn g" id="mk" data-sfx="coin">🔑 اعمل كود ربط</button><div id="code"></div>
      <p class="small"><a id="apk" href="https://github.com/Omar08263/safqa/releases" target="_blank" rel="noopener">⬇ تنزيل تطبيق Safqa Hub (APK)</a></p></div>`;
    api('/api/v2/hub/deploys').then((d) => { const a = d.releases.flatMap((r) => r.assets).find((x) => /hub/i.test(x.name)); if (a) v.querySelector('#apk').href = a.url; }).catch(() => 0);
    let timer;
    v.querySelector('#mk').onclick = async () => {
      const r = await post('/api/v2/hub/pair'); play('ok'); clearInterval(timer);
      const end = Date.now() + r.expiresIn * 1000;
      const draw = () => { const left = Math.max(0, Math.round((end - Date.now()) / 1000)); v.querySelector('#code').innerHTML = left ? `<div class="digits mono">${r.code.slice(0, 4)} ${r.code.slice(4)}</div><div class="small muted">فاضل ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · <a href="safqahub://pair?code=${r.code}">افتح في التطبيق</a></div>` : '<p class="muted">الكود خلص — اعمل واحد جديد</p>'; if (!left) clearInterval(timer); };
      draw(); timer = setInterval(draw, 1000);
    };
  };

  // Settings: sound toggle (floating)
  const fab = document.createElement('button');
  fab.className = 'sfab'; fab.title = 'أصوات الواجهة';
  const paint = () => (fab.textContent = sound.on ? '🔊' : '🔇');
  fab.onclick = () => { sound.on = !sound.on; paint(); play('ok'); }; paint();
  document.body.append(fab);
}
