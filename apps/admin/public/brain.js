// Safqa Hub — «العقل الرئيسي»: the master AI's plan, team, findings, self-fixes (with undo), owner decisions and GitHub issue drafts.
import { play } from './asmr.js';

export function installBrain({ PAGES, VIEWS, api, post, esc, ago, toast }) {
  PAGES.splice(1, 0, ['brain', '🧬', 'العقل الرئيسي']);
  const SEV = { crit: ['حرج', 'bad', '🔴'], warn: ['تنبيه', 'warn', '🟠'], info: ['معلومة', 'mut', '🔵'], ok: ['تمام', 'ok', '🟢'] };
  const FIX = { cache_purge: '🧹 مسح الكاش', source_pause: '⏸️ إيقاف مصدر مؤقتًا', source_resume: '▶️ تشغيل مصدر', extractor_relearn: '🧠 إعادة تعليم قارئ الأسعار', flag_off: '🎛️ قفل ميزة', run_agent: '🤖 تشغيل وكيل', issue: '🐙 GitHub issue' };
  const ST = { applied: ['اتنفذ — بيتأكد', 'warn'], verified: ['اتأكد إنه نفع', 'ok'], ineffective: ['ما نفعش — للمالك', 'bad'], undone: ['اترجع', 'mut'], failed: ['فشل', 'bad'] };
  const vital = (ok, label, sub) => `<div class="vital ${ok ? 'ok' : 'bad'}"><i></i><b>${label}</b><small>${sub}</small></div>`;

  VIEWS.brain = async (v) => {
    const b = await api('/api/v2/hub/brain');
    const vt = b.vitals || {};
    const crit = b.findings.filter((f) => f.sev === 'crit').length;
    v.innerHTML = `
      <div class="card hero brain-hero" style="padding:18px"><div class="aurora"></div>
        <div class="row" style="position:relative;align-items:flex-start">
          <div class="brain-orb ${crit ? 'alert' : ''}" aria-hidden="true"><span>🧬</span></div>
          <div class="col" style="flex:1;min-width:240px;gap:4px">
            <b style="font-size:21px">العقل الرئيسي</b>
            <span class="small muted">بيشتغل لوحده كل ربع ساعة · ${b.ticks} دورة · آخر دورة ${b.lastTick ? ago(b.lastTick) : '—'} · المخطط: ${esc(b.models.planner)}</span>
            <p style="margin:8px 0 0;font-size:15px;line-height:1.9">${esc(b.plan?.summary || 'لسه أول دورة جاية…')}</p>
          </div>
          <div class="col" style="gap:8px;align-items:flex-end">
            <div class="row"><span class="small">يصلّح لوحده</span><button class="switch ${b.settings.auto ? 'on' : ''}" id="bauto" aria-label="العقل يصلّح لوحده"></button></div>
            <div class="row"><span class="small">يفتح GitHub issues</span><button class="switch ${b.settings.github ? 'on' : ''}" id="bgh" aria-label="فتح issues تلقائي" ${b.github.token ? '' : 'disabled title="محتاج GITHUB_TOKEN"'}></button></div>
            <button class="btn p" id="brun" data-sfx="whoosh">⚡ شغّل دورة دلوقتي</button>
          </div>
        </div>
        <div class="vitals" style="position:relative">
          ${vital(vt.site?.ok, 'الموقع', vt.site ? `${vt.site.status} · ${vt.site.ms}ms` : '—')}
          ${vital(vt.admin?.ok, 'الـ Hub', vt.admin?.status ?? '—')}
          ${vital(vt.d1 && !vt.budget?.exhausted, 'D1', vt.budget?.exhausted ? 'قراءة بس — الحد خلص' : `${vt.budget?.pct ?? 0}% كتابة`)}
          ${vital(vt.kv, 'KV', 'تمام')}
          ${vital((vt.aiLeft ?? 0) > 20, 'AI', `${vt.aiLeft ?? '—'} نداء`)}
          ${vital((vt.clientErrors15 ?? 0) < 60, 'أخطاء المستخدمين', `${vt.clientErrors15 ?? 0} / ربع ساعة`)}
          ${vital(vt.snapshotAgeH == null || vt.snapshotAgeH < 36, 'نسخة الأسعار', vt.snapshotAgeH != null ? `${vt.snapshotAgeH} س` : '—')}
          ${vital(vt.autopilot, 'الطيار الآلي', vt.autopilot ? 'شغال' : 'مقفول')}
        </div>
      </div>

      <div class="grid2">
        <div class="card"><h3>🎯 الخطة</h3>
          ${(b.plan?.focus || []).length ? `<ol class="plan">${b.plan.focus.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="muted small">مفيش أولويات — كله ماشي.</p>'}
          ${(b.plan?.next || []).length ? `<div class="small muted" style="margin-top:6px">الخطوات الجاية</div><ul class="plan next">${b.plan.next.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="card"><h3>👥 فريق الخبراء</h3><div class="team">
          ${b.team.map((t) => `<div class="spec ${t.worst}"><div class="spec-h"><span class="spec-e">${t.emoji}</span><div style="flex:1"><b>${esc(t.ar)}</b><small class="muted">${esc(t.role)}</small></div><span class="pill ${(SEV[t.worst] || SEV.ok)[1]}">${t.findings ? `${t.findings} ${(SEV[t.worst] || SEV.ok)[0]}` : 'تمام'}</span></div>
            <div class="spec-m">${t.members.map((m) => `<span title="${esc(m.rank?.ar || '')}" class="${m.enabled ? '' : 'off'}">${m.emoji} ${esc(m.name)}</span>`).join('') || '<span class="muted">حساسات العقل نفسه</span>'}</div></div>`).join('')}
        </div></div>
      </div>

      <div class="card"><h3>🔎 اللي شايفه دلوقتي <span class="small muted">(${b.findings.length})</span></h3>
        ${b.findings.length ? b.findings.map((f) => `<div class="finding"><span>${SEV[f.sev][2]}</span><div style="flex:1;min-width:0"><b>${esc(f.title)}</b>${f.detail ? `<small class="muted">${esc(f.detail)}</small>` : ''}<div class="fixes">${f.fixes.map((x) => `<span class="pill ${b.safe[x.t] ? 'ok' : 'mut'}">${FIX[x.t]}${b.safe[x.t] ? '' : ' · بموافقتك'}</span>`).join('')}</div></div><span class="pill ${SEV[f.sev][1]}">${SEV[f.sev][0]}</span></div>`).join('') : '<p class="muted">🟢 مفيش مشاكل.</p>'}
      </div>

      <div class="card"><h3>🧑‍⚖️ محتاج قرارك <span class="small muted">(${b.pending.length})</span></h3>
        ${b.pending.length ? b.pending.map((p) => `<div class="finding" data-p="${esc(p.id)}"><span>⏳</span><div style="flex:1"><b>${esc(p.title)}</b><small class="muted">${ago(p.at)}</small></div><button class="btn s p" data-d="apply" data-sfx="ok">✅ نفّذ</button><button class="btn s" data-d="skip" data-sfx="no">تجاهل</button></div>`).join('') : '<p class="muted small">مفيش حاجة مستنياك. الفلوس والحظر والمسح عمرهم ما بيتعملوا لوحدهم.</p>'}
      </div>

      <div class="card"><h3>🛠️ اللي عمله لوحده</h3>
        ${b.done.length ? b.done.slice(0, 20).map((d) => `<div class="finding" data-u="${esc(d.id)}"><span>${d.by === 'auto' ? '🤖' : '👤'}</span><div style="flex:1;min-width:0"><b>${FIX[d.fix.t]} «${esc(d.fix.target)}»</b><small class="muted">${esc(d.note || '')} · ${ago(d.at)}</small></div><span class="pill ${(ST[d.status] || ['', 'mut'])[1]}">${(ST[d.status] || [d.status])[0]}</span>${['applied', 'verified', 'ineffective'].includes(d.status) && ['source_pause', 'source_resume', 'extractor_relearn', 'flag_off'].includes(d.fix.t) ? '<button class="btn s" data-undo data-sfx="whoosh">↩️ رجّع</button>' : ''}</div>`).join('') : '<p class="muted small">لسه ما احتاجش يصلّح حاجة.</p>'}
      </div>

      <div class="card"><h3>🐙 مسودات GitHub <span class="small muted">${esc(b.github.repo)}${b.github.token ? '' : ' · من غير توكن: بتفتح صفحة issue جاهزة وانت اللي تبعت'}</span></h3>
        ${b.issues.length ? b.issues.map((i) => `<div class="finding" data-i="${esc(i.id)}"><span>${i.url ? '✅' : '📝'}</span><div style="flex:1;min-width:0"><b>${esc(i.title)}</b><small class="muted">${esc(i.body.split('\n')[0])} · ${ago(i.at)}</small></div>${i.url ? `<a class="btn s" href="${esc(i.url)}" target="_blank" rel="noopener">افتح</a>` : `<a class="btn s p" href="${esc(i.link)}" target="_blank" rel="noopener" data-sfx="tap">🐙 افتح كمسودة</a>`}</div>`).join('') : '<p class="muted small">مفيش مشاكل محتاجة تعديل كود.</p>'}
      </div>`;
    const again = () => VIEWS.brain(v);
    v.querySelector('#brun').onclick = async (e) => { e.target.disabled = true; e.target.textContent = '🧬 بيفكّر…'; try { await post('/api/v2/hub/brain/run'); play('chime'); toast('🧬 خلصت الدورة'); } catch (x) { play('no'); toast(`⚠️ ${x.message}`); } again(); };
    v.querySelector('#bauto').onclick = async () => { await post('/api/v2/hub/brain/settings', { auto: !b.settings.auto }); play(b.settings.auto ? 'no' : 'chime'); again(); };
    const gh = v.querySelector('#bgh'); if (gh && !gh.disabled) gh.onclick = async () => { await post('/api/v2/hub/brain/settings', { github: !b.settings.github }); again(); };
    v.querySelectorAll('[data-p]').forEach((r) => r.querySelectorAll('[data-d]').forEach((btn) => { btn.onclick = async () => { try { const out = await post(`/api/v2/hub/brain/pending/${r.dataset.p}`, { decision: btn.dataset.d }); toast(out.note || (out.skipped ? 'اتجاهلت 24 ساعة' : '✅')); } catch (x) { toast(`⚠️ ${x.message}`); } again(); }; }));
    v.querySelectorAll('[data-u] [data-undo]').forEach((btn) => { btn.onclick = async () => { if (!confirm('ترجّع الإجراء ده؟')) return; try { await post(`/api/v2/hub/brain/undo/${btn.closest('[data-u]').dataset.u}`); toast('↩️ رجع'); } catch (x) { toast(`⚠️ ${x.message}`); } again(); }; });
  };
}
