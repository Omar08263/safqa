// Safqa Hub — «🧩 الأنظمة»: v6 open-source systems registry (same data the master AI reads at
// /api/v6/hub/systems). Each system = one remote-config flag (sys_*) + live status.
import { play } from './asmr.js';

export function installSystems({ PAGES, VIEWS, api, post, esc, ago, toast }) {
  const at = PAGES.findIndex((p) => p[0] === 'flags');
  PAGES.splice(at < 0 ? PAGES.length : at, 0, ['systems', '🧩', 'الأنظمة']);
  const pct = (x) => (x == null ? '—' : `${x}%`);
  const statusLine = (s) => {
    const st = s.status;
    if (!st) return '<span class="pill mut">لسه مفيش قياس</span>';
    if (st.error) return `<span class="pill warn">مش متاح (${esc(String(st.error))})</span>`;
    if (s.id === 'ntfy') return `<span class="pill info">${st.optedIn ?? '—'} مشترك فعّل الجرس</span>`;
    if (s.id === 'twins') return `<span class="pill ok">${st.withTwins} منتج ليه توأم · ${st.topGaps?.length ?? 0} فرق سعر كبير</span> <span class="small muted">اتبنى ${ago(st.at)}</span>`;
    if (s.id === 'uptime') return `<span class="pill ${st.ok ? 'ok' : 'bad'}">${st.ok ? 'كله شغال' : 'في عطل'}</span> ${(st.checks || []).map((c) => `<span class="pill ${c.ok ? 'ok' : 'bad'}" title="${c.ms}ms">${esc(c.id)} ${pct(c.uptime24)}</span>`).join(' ')}`;
    if (s.id === 'quality') return `<span class="pill info">⚡ ${st.avg?.performance ?? '—'}</span> <span class="pill ok">♿ ${st.avg?.accessibility ?? '—'}</span> <span class="pill info">✔ ${st.avg?.bestPractices ?? '—'}</span> <span class="pill info">🔎 ${st.avg?.seo ?? '—'}</span> <span class="small muted">${ago(st.at)}</span>`;
    return '';
  };

  VIEWS.systems = async (v) => {
    const [r, me] = await Promise.all([api('/api/v6/hub/systems'), api('/api/v6/ntfy').catch(() => null)]);
    const twins = r.items.find((s) => s.id === 'twins')?.status;
    const q = r.items.find((s) => s.id === 'quality')?.status;
    v.innerHTML = `
      <p class="muted small">أنظمة v6 المبنية على أفكار مفتوحة المصدر. كل نظام = ميزة واحدة في الإعدادات عن بُعد (<span class="mono">sys_*</span>) — العقل الرئيسي والوكلاء بيقروها من نفس المكان ويقدروا يقفلوها لو عملت مشاكل («حارس» بيحميها).</p>
      <div class="grid g2">${r.items.map((s) => `
        <div class="card sys" data-id="${esc(s.id)}">
          <div class="row"><div class="col" style="gap:2px;flex:1"><b style="font-size:17px">${s.emoji} ${esc(s.nameAr)}</b><span class="small muted">${esc(s.forUsers)}</span></div>
            <button class="switch ${s.state?.on ? 'on' : ''}" data-en data-sfx="${s.state?.on ? 'no' : 'ok'}" aria-label="تشغيل/إيقاف ${esc(s.nameAr)}"></button></div>
          <div class="row small" style="margin-top:8px;flex-wrap:wrap;gap:6px">${statusLine(s)}</div>
          <div class="small muted" style="margin-top:8px">🧱 <a href="${esc(s.oss.url)}" target="_blank" rel="noopener">${esc(s.oss.name)}</a> · ${esc(s.oss.license)} · ${esc(s.oss.what)}</div>
          <div class="small muted" style="margin-top:4px">📍 ${s.surfaces.map(esc).join(' · ')} · <span class="mono">${esc(s.flag)}</span> ${s.state?.source === 'default' ? '(افتراضي)' : ''}</div>
        </div>`).join('')}</div>
      ${me ? `<div class="card" style="margin-top:14px"><b>🔔 جرس المالك على موبايلك</b><p class="small muted" style="margin:6px 0">القرارات المهمة (escalations) هترن على موبايلك عن طريق تطبيق ntfy — حتى من غير تيليجرام. اشترك في القناة دي في التطبيق:</p>
        <div class="row"><code class="mono" style="user-select:all">${esc(me.topic)}</code><button class="btn s" id="ntcopy">نسخ</button><button class="switch ${me.enabled ? 'on' : ''}" id="nten" aria-label="جرس المالك"></button><button class="btn s" id="nttest">تجربة</button></div></div>` : ''}
      ${twins?.topGaps?.length ? `<div class="card" style="margin-top:14px"><b>🧬 أكبر فروق أسعار لنفس المنتج بين المحلات</b><p class="small muted" style="margin:6px 0">فرص لـ«صيد اليوم» أو حملة. التطابق بالذكاء + حراس رقم الموديل والسعة — راجع قبل النشر.</p>
        <div class="col" style="gap:6px">${twins.topGaps.slice(0, 12).map((g) => `<div class="row small" style="gap:8px"><span class="pill ok">−${g.pct}%</span><a href="https://safqaeg.pages.dev/p/${esc(g.twin.id)}" target="_blank" rel="noopener" style="flex:1">${esc(g.t).slice(0, 70)}</a><span class="muted">${esc(g.s)} ${Math.round(g.p)} ← ${esc(g.twin.s)} ${Math.round(g.twin.p)} ج</span></div>`).join('')}</div></div>` : ''}
      ${q?.pages?.length ? `<div class="card" style="margin-top:14px"><b>♿ مفتّش الجودة — أهم الملاحظات</b><div class="col" style="gap:6px;margin-top:8px">${q.pages.map((p) => `<div class="small"><b>${esc(p.page)}</b> ⚡${p.performance} ♿${p.accessibility} 🔎${p.seo} · LCP ${(p.lcpMs / 1000).toFixed(1)}s · CLS ${p.cls}<div class="muted">${p.issues.slice(0, 4).map((i) => esc(i.title)).join(' · ')}</div></div>`).join('')}</div></div>` : ''}`;
    v.querySelectorAll('.sys').forEach((c) => {
      c.querySelector('[data-en]').onclick = async (e) => {
        const b = e.currentTarget; const on = !b.classList.contains('on'); b.classList.toggle('on', on);
        try { await post(`/api/v6/hub/systems/${c.dataset.id}`, { enabled: on }); play('ok'); toast(on ? '✅ اتشغّل — هيوصل للكل خلال دقايق' : '⏸️ اتقفل'); } catch (er) { b.classList.toggle('on', !on); play('no'); toast(`⚠️ ${er.message}`); }
      };
    });
    const nt = v.querySelector('#nten');
    if (nt) {
      v.querySelector('#ntcopy').onclick = () => { navigator.clipboard?.writeText(me.topic); toast('اتنسخ'); };
      nt.onclick = async () => { const on = !nt.classList.contains('on'); try { const x = await api('/api/v6/ntfy', { method: 'PUT', body: JSON.stringify({ enabled: on }) }); nt.classList.toggle('on', x.enabled); toast(x.enabled ? '🔔 الجرس شغّال' : 'الجرس اتقفل'); } catch (er) { play('no'); toast(`⚠️ ${er.message}`); } };
      v.querySelector('#nttest').onclick = async () => { try { const x = await post('/api/v6/ntfy/test', {}); toast(x.ok ? '📲 بص على موبايلك' : 'ntfy مردش'); } catch (er) { toast(`⚠️ ${er.message}`); } };
    }
  };
}
