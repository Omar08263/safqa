import { Link } from '@tanstack/react-router';
import { Gavel, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { AgentAvatar } from '../components/agent-avatar';
import { timeAgo, useCommunityBoot, useGuard } from '../components/community-kit';
import { Button } from '../components/ui/button';
import { Card, PageHeader, Reveal, useToast } from '../fx/fx';
import { agentById } from '../lib/agents';
import { analyze, fileAppeal, hasAccepted, loadMod, MOD_KEY, type ModState } from '../lib/moderation';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { escalation, RULES_VERSION, ruleById, ruleSections } from '../lib/rules';
import { useTr } from '../lib/tr';

export function RulesPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  useCommunityBoot();
  const guard = useGuard();
  const [mod] = useLocal<ModState>(MOD_KEY, loadMod());
  const [test, setTest] = useState('');
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const accepted = guard.meId ? hasAccepted(guard.meId, RULES_VERSION) : false;
  const mine = mod.penalties.filter((p) => p.memberId === guard.meId);
  const trial = test.trim() ? analyze(test) : [];

  return (
    <div className="space-y-8">
      {guard.dialog}
      <PageHeader kicker={tr(`الإصدار ${RULES_VERSION}`, `Version ${RULES_VERSION}`)} title={tr('القوانين والشروط والإشراف', 'Rules, terms & moderation')} lede={tr('قوانين مكتوبة بدقة، كل عضو بيوافق عليها قبل ما يشارك. الوكلاء القانونيين بيطبقوها تلقائي بجدول تصعيد واضح، وكل عقوبة بتذكر رقم المادة، وتقدر تتظلم.', 'Precise rules every member accepts before taking part. Legal agents enforce them automatically with a clear escalation table; every penalty cites the rule and can be appealed.')} icon={<Scale className="h-6 w-6" />}>
        {guard.me && accepted ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--palm)]/15 px-3 py-1.5 text-sm font-semibold text-palm"><ShieldCheck className="h-4 w-4" />{tr('إنت موافق على الإصدار ده', 'You accepted this version')}</span> : <Button onClick={() => void guard.check('مرحبا', [], 'rules')}><ShieldCheck className="h-4 w-4" />{tr('اقرا ووافق', 'Read & accept')}</Button>}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
        <div className="space-y-4">
          {ruleSections.map((s, i) => (
            <Reveal key={s.id} delay={i * 60}>
              <Card>
                <h2 className="text-lg font-bold">{s.id}. {locale === 'ar' ? s.ar : s.en}</h2>
                <div className="mt-3 space-y-3">
                  {s.rules.map((r) => {
                    const a = agentById(r.agent);
                    return (
                      <div key={r.id} id={`rule-${r.id}`} className="flex scroll-mt-24 gap-3 rounded-2xl bg-accent/60 p-3">
                        <span className="num grid h-10 w-12 flex-none place-items-center rounded-xl bg-card font-bold text-primary">{r.id}</span>
                        <div className="flex-1">
                          <p className="font-semibold">{locale === 'ar' ? r.ar : r.en}</p>
                          {locale === 'ar' ? <p className="mt-0.5 text-sm text-muted">{r.detail}</p> : null}
                          <p className="mt-1 text-[11px] text-muted">{tr('الخطورة', 'Severity')}: <span className="num font-bold">{r.severity}</span> {tr('نقطة', 'pts')} · {tr('بيطبّقها', 'Enforced by')} <Link to="/agents/$id" params={{ id: r.agent }} className="font-semibold text-primary">{locale === 'ar' ? a?.name : a?.nameEn}</Link></p>
                        </div>
                        {a ? <AgentAvatar agent={a} size={40} /> : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Gavel className="h-5 w-5 text-primary" />{tr('جدول التصعيد', 'Escalation table')}</h2>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-1 text-start">{tr('النقاط في 30 يوم', 'Points / 30 days')}</th><th className="text-start">{tr('العقوبة', 'Penalty')}</th></tr></thead>
              <tbody>{escalation.map((e) => <tr key={e.min} className="border-t border-border"><td className="num py-2">{e.min}+</td><td>{locale === 'ar' ? e.ar : e.en}</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{tr('المواد بخطورة 5 (محتوى جنسي، ممنوعات، نصب) = حظر 24 ساعة فوري. المحتوى اللي عليه نقطتين أو أكتر مش بيتنشر. نقطة واحدة = بيتنشر مع إنذار.', 'Severity-5 rules (sexual content, illegal goods, scams) = immediate 24-hour ban. Content scoring 2+ points is blocked; 1 point publishes with a warning.')}</p>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{tr('جرّب الفاحص', 'Try the checker')}</h2>
            <p className="text-xs text-muted">{tr('اكتب أي رسالة وشوف الوكلاء هيحكموا عليها إزاي (من غير ما تتسجل عليك).', 'Type any message to see how the agents would judge it (not recorded).')}</p>
            <textarea value={test} onChange={(e) => setTest(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm" placeholder={tr('مثال: ابعتلي عربون على فودافون كاش', 'e.g. send a deposit via Vodafone Cash')} />
            {test.trim() ? (trial.length ? <ul className="mt-2 space-y-1 text-sm">{trial.map((v) => <li key={v.rule} className="rounded-xl bg-destructive/10 px-3 py-1.5"><span className="num font-bold">{v.rule}</span> {ruleById(v.rule)?.ar} — {v.reason}</li>)}</ul> : <p className="mt-2 rounded-xl bg-[var(--palm)]/15 px-3 py-1.5 text-sm text-palm">✅ {tr('سليمة — هتتنشر عادي', 'Clean — would publish')}</p>) : null}
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{tr('عقوباتي وتظلماتي', 'My penalties & appeals')}</h2>
            {mine.length === 0 ? <p className="mt-2 text-sm text-muted">{tr('سجلك نضيف 👏', 'Clean record 👏')}</p> : null}
            {mine.map((p) => (
              <div key={p.id} className="mt-3 rounded-2xl border border-border p-3 text-sm">
                <p className="font-semibold">{p.action === 'warning' ? tr('إنذار', 'Warning') : p.action === 'mute' ? tr('كتم', 'Mute') : tr('حظر مؤقت', 'Temporary ban')} · {tr('المادة', 'Rule')} {p.rules.join('، ')}</p>
                <p className="text-xs text-muted">{timeAgo(p.at, locale)}{p.until ? ` · ${tr('لحد', 'until')} ${new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.until))} (${tr('القاهرة', 'Cairo')})` : ''}</p>
                <p className="mt-1 text-xs">{p.reasons.join(' · ')}</p>
                {p.appeal ? <p className={`mt-2 rounded-xl px-2 py-1 text-xs ${p.appeal.status === 'accepted' ? 'bg-[var(--palm)]/15 text-palm' : p.appeal.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-accent'}`}>{p.appeal.status === 'pending' ? tr('⏳ التظلم قيد المراجعة عند القاضية سلمى', '⏳ Appeal under review by Judge Salma') : p.appeal.decisionAr}</p> : appealFor === p.id ? (
                  <div className="mt-2 space-y-2"><textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-2 py-1 text-sm" placeholder={tr('اشرح ليه العقوبة غلط…', 'Explain why the penalty is wrong…')} /><Button size="sm" onClick={() => { fileAppeal(p.id, appealText); setAppealFor(null); setAppealText(''); toast(tr('اتقدم التظلم ✅ الحكم خلال ثواني', 'Appeal filed ✅')); }}>{tr('قدّم التظلم', 'File appeal')}</Button></div>
                ) : <Button size="sm" variant="outline" className="mt-2" onClick={() => setAppealFor(p.id)}>⚖️ {tr('تظلّم', 'Appeal')}</Button>}
              </div>
            ))}
          </Card>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">{tr('سجل الإشراف (على الجهاز ده)', 'Moderation log (this device)')}</h2>
        <div className="overflow-hidden rounded-3xl border border-border">
          {mod.penalties.length === 0 ? <p className="bg-card p-6 text-center text-sm text-muted">{tr('مفيش عقوبات متسجلة لسه', 'No penalties recorded yet')}</p> : null}
          {mod.penalties.slice(0, 100).map((p) => {
            const a = agentById(p.agentId);
            return (
              <div key={p.id} className="grid gap-2 border-b border-border bg-card p-3 text-sm last:border-0 md:grid-cols-[auto_1fr_auto] md:items-center">
                {a ? <AgentAvatar agent={a} size={36} /> : null}
                <div>
                  <p><span className="font-semibold">{a?.name}</span> → <span className="font-semibold">{p.memberName}</span>: {p.action} · {tr('المادة', 'rule')} <span className="num">{p.rules.join('، ')}</span> · {p.where}</p>
                  <p className="text-xs text-muted">«{p.excerpt.replace(/\S{3,}/g, (w) => (p.reasons.some((r) => r.includes(w)) ? '•••' : w))}» — {p.reasons.join(' · ')}</p>
                </div>
                <span className="text-xs text-muted">{timeAgo(p.at, locale)}{p.appeal ? ` · ${tr('تظلم', 'appeal')}: ${p.appeal.status}` : ''}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">{tr('النسخة الثابتة: الإشراف بيشتغل على متصفحك، فالسجل ده بيعرض العقوبات اللي حصلت على الجهاز ده بس.', 'Static edition: moderation runs in your browser, so this log shows penalties on this device only.')} <Link to="/terms" className="underline">{tr('الشروط والأحكام', 'Terms')}</Link> · <Link to="/privacy" className="underline">{tr('الخصوصية', 'Privacy')}</Link></p>
      </section>
    </div>
  );
}
