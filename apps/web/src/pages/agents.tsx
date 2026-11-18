import { Link } from '@tanstack/react-router';
import { Activity, AlertTriangle, Bot, Download, MessageSquare, Radio } from 'lucide-react';
import { useState } from 'react';
import { AgentAvatar, downloadAvatar } from '../components/agent-avatar';
import { useSignals } from '../components/agents-runtime';
import { Composer, useCommunityBoot } from '../components/community-kit';
import { Button } from '../components/ui/button';
import { Card, PageHeader, Reveal } from '../fx/fx';
import { type Agent, agentById, agentIssues, agents, currentTask, moodLabel, moodOf, statusLabel, statusOf, teamAgents, teams } from '../lib/agents';
import { think } from '../lib/agent-brain';
import { AGENT_LOG_KEY, type AgentLogEntry } from '../lib/agent-log';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { timeAgo } from '../components/community-kit';

export function AgentsPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const signals = useSignals();
  const [log] = useLocal<AgentLogEntry[]>(AGENT_LOG_KEY, []);
  const online = agents.filter((a) => statusOf(a, signals) !== 'sleeping').length;
  return (
    <div className="space-y-8">
      <PageHeader kicker={tr('مقر الوكلاء', 'Agents HQ')} title={tr('الوكلاء الأذكياء', 'AI agent teams')} lede={tr(`${agents.length} وكيل ذكي في ${teams.length} فرق، كل واحد ليه اسم وشخصية ومزاج بيتغير مع اللي بيحصل في الموقع. شغالين بورديات علشان دايمًا في حد صاحي. كلهم بوتات أوفلاين واضحة — مش بشر.`, `${agents.length} AI agents in ${teams.length} teams, each with a name, personality and a mood that follows what happens on the site. Shifts keep someone awake 24/7. All are clearly-labelled offline bots — not humans.`)} icon={<Bot className="h-6 w-6" />}>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-card p-3"><p className="num text-2xl font-bold text-palm">{online}</p><p className="text-xs text-muted">{tr('متصل', 'online')}</p></div>
          <div className="rounded-2xl bg-card p-3"><p className="num text-2xl font-bold">{signals.dropsToday}</p><p className="text-xs text-muted">{tr('تخفيض حقيقي', 'real drops')}</p></div>
          <div className="rounded-2xl bg-card p-3"><p className="num text-2xl font-bold">{signals.productsLive}</p><p className="text-xs text-muted">{tr('منتج متتبّع', 'tracked')}</p></div>
        </div>
      </PageHeader>

      {teams.map((t, ti) => (
        <section key={t.id} className="relative overflow-hidden rounded-[2rem] border border-border p-5" style={{ background: `linear-gradient(135deg, ${t.colors[0]}22, transparent 60%)` }}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold"><span className="text-3xl">{t.emoji}</span>{locale === 'ar' ? t.ar : t.en}</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted">{locale === 'ar' ? t.mission : t.missionEn}</p>
            </div>
            <Link to={t.home as '/'} className="text-sm font-semibold text-primary">{tr('مكان شغلهم ←', 'Where they work →')}</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teamAgents(t.id).map((a, i) => <Reveal key={a.id} delay={(ti * 3 + i) * 30}><AgentCard a={a} /></Reveal>)}
          </div>
        </section>
      ))}

      <Card>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Activity className="h-5 w-5 text-primary" />{tr('سجل نشاط الوكلاء', 'Agent activity log')}</h2>
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {log.slice(0, 60).map((e) => { const a = agentById(e.agentId); return a ? <li key={e.id} className="flex items-center gap-2 text-sm"><AgentAvatar agent={a} size={28} /><span className="font-semibold">{a.name}</span><span className="flex-1 text-muted">{locale === 'ar' ? e.ar : e.en}</span><span className="text-[11px] text-muted">{timeAgo(e.at, locale)}</span></li> : null; })}
          {log.length === 0 ? <p className="text-sm text-muted">{tr('لسه مفيش نشاط مسجل على الجهاز ده.', 'No activity on this device yet.')}</p> : null}
        </ul>
      </Card>
    </div>
  );
}

function AgentCard({ a }: { a: Agent }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const s = useSignals();
  const mood = moodOf(a, s);
  const st = statusOf(a, s);
  const task = currentTask(a, s, st);
  return (
    <Link to="/agents/$id" params={{ id: a.id }} className="lift spotlight block h-full rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <AgentAvatar agent={a} mood={mood} status={st} size={72} />
        <div className="min-w-0">
          <p className="font-bold">{locale === 'ar' ? a.name : a.nameEn}</p>
          <p className="text-xs text-muted">{locale === 'ar' ? a.title : a.titleEn}</p>
          <p className="mt-1 text-[11px]"><span style={{ color: statusLabel[st][2] }}>● {tr(statusLabel[st][0], statusLabel[st][1])}</span> · {moodLabel[mood][2]} {tr(moodLabel[mood][0], moodLabel[mood][1])}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-muted">🛠 {locale === 'ar' ? task[0] : task[1]}</p>
    </Link>
  );
}

export function AgentPage({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const products = useCommunityBoot();
  const s = useSignals();
  const [log] = useLocal<AgentLogEntry[]>(AGENT_LOG_KEY, []);
  const [talk, setTalk] = useState<{ q: string; a: string }[]>([]);
  const a = agentById(id);
  if (!a) return <p className="py-20 text-center text-muted">{tr('الوكيل مش موجود', 'Agent not found')}</p>;
  const t = teams.find((x) => x.id === a.team);
  const mood = moodOf(a, s);
  const st = statusOf(a, s);
  const task = currentTask(a, s, st);
  const issues = agentIssues(a, s);
  const mine = log.filter((e) => e.agentId === a.id);
  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-[2rem] border border-border p-6" style={{ background: `radial-gradient(circle at 20% 20%, ${t?.colors[1]}55, transparent 55%), linear-gradient(135deg, ${t?.colors[0]}, #0b0b12)` }}>
        <div className="relative flex flex-wrap items-center gap-6 text-white">
          <div className="float-slow"><AgentAvatar agent={a} mood={mood} status={st} size={180} /></div>
          <div className="flex-1">
            <p className="text-sm opacity-80">{t?.emoji} {locale === 'ar' ? t?.ar : t?.en}</p>
            <h1 className="text-4xl font-bold">{locale === 'ar' ? a.name : a.nameEn}</h1>
            <p className="mt-1 opacity-90">{locale === 'ar' ? a.title : a.titleEn}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1">🤖 {tr('وكيل ذكي (بوت)', 'AI agent (bot)')}</span>
              <span className="rounded-full bg-white/15 px-3 py-1" style={{ color: statusLabel[st][2] }}>● {tr(statusLabel[st][0], statusLabel[st][1])}</span>
              <span className="rounded-full bg-white/15 px-3 py-1">{moodLabel[mood][2]} {tr(moodLabel[mood][0], moodLabel[mood][1])}</span>
              <span className="rounded-full bg-white/15 px-3 py-1">🕐 {tr('الوردية', 'Shift')} {a.shift[0]}:00–{a.shift[1] % 24}:00 {tr('القاهرة', 'Cairo')}</span>
            </div>
            <p className="mt-3 max-w-2xl text-lg">“{a.catch[0]}” {a.emoji.join(' ')}</p>
          </div>
          <Button variant="outline" className="bg-white/10 text-white" onClick={() => void downloadAvatar(a, mood)}><Download className="h-4 w-4" />{tr('الصورة 4K', '4K avatar')}</Button>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <Card>
          <p className="font-bold">{tr('الشخصية', 'Personality')}</p>
          <p className="mt-1 text-sm text-muted">{a.persona}</p>
          <p className="mt-3 font-bold">{tr('بيقول دايمًا', 'Catchphrases')}</p>
          <ul className="mt-1 space-y-1 text-sm">{a.catch.map((c) => <li key={c}>💬 {c}</li>)}</ul>
          {a.rules ? <p className="mt-3 text-sm">{tr('المواد اللي بيطبّقها:', 'Enforces rules:')} <span className="num font-bold">{a.rules.join('، ')}</span></p> : null}
          <p className="mt-3 text-xs text-muted">{tr('المزاج بيتغير حسب الوردية والإشارات الحقيقية (تخفيضات، مخالفات، حالة سحب الأسعار).', 'Mood follows the shift and real signals (drops, violations, crawl status).')}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 font-bold"><Radio className="h-4 w-4 text-primary" />{tr('شغال على إيه دلوقتي', 'Current task')}</p>
          <p className="mt-1 text-sm">{locale === 'ar' ? task[0] : task[1]}</p>
          <p className="mt-4 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-destructive" />{tr('المشاكل', 'Issues')}</p>
          {issues.length ? <ul className="mt-1 space-y-1 text-sm">{issues.map((i) => <li key={i[0]} className="rounded-xl bg-destructive/10 px-2 py-1">{locale === 'ar' ? i[0] : i[1]}</li>)}</ul> : <p className="mt-1 text-sm text-palm">✅ {tr('مفيش مشاكل', 'No issues')}</p>}
        </Card>
        <Card>
          <p className="font-bold">{tr('السجل', 'Log')}</p>
          <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-sm">{mine.slice(0, 40).map((e) => <li key={e.id}><span className="text-[11px] text-muted">{timeAgo(e.at, locale)}</span> · {locale === 'ar' ? e.ar : e.en}</li>)}{mine.length === 0 ? <li className="text-muted">{tr('لسه مفيش أحداث على الجهاز ده', 'No events on this device yet')}</li> : null}</ul>
        </Card>
      </div>
      <Card>
        <p className="flex items-center gap-2 font-bold"><MessageSquare className="h-4 w-4 text-primary" />{tr(`كلّم ${a.name}`, `Talk to ${a.nameEn}`)}</p>
        <div className="mt-3 space-y-3">
          {talk.map((x, i) => (
            <div key={`${i}-${x.q}`} className="space-y-2">
              <p className="ms-auto w-fit max-w-[80%] rounded-2xl bg-primary/20 px-3 py-2 text-sm">{x.q}</p>
              <div className="flex gap-2"><AgentAvatar agent={a} mood={mood} size={32} /><p className="max-w-[80%] whitespace-pre-line rounded-2xl bg-accent px-3 py-2 text-sm">{x.a}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-3"><Composer compact allowFiles={false} placeholder={tr('اسأله أي حاجة عن الأسعار أو الموقع…', 'Ask about prices or the site…')} onSubmit={async (q) => { setTalk((l) => [...l, { q, a: think(a, q, { products, mood, seed: `${q}${l.length}` }).text }]); return true; }} /></div>
        <p className="mt-2 text-[11px] text-muted">{tr('الردود أوفلاين من محرك قواعد على بيانات صفقة الحقيقية — مش ذكاء اصطناعي سحابي ومش إنسان.', 'Replies come from an offline rule engine over Safqa’s real data — not a cloud AI, not a human.')}</p>
      </Card>
    </div>
  );
}
