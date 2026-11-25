import type { ProductCard } from '@safqa/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, FlaskConical, Gavel, Loader2, Send, ShieldCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { confetti, useToast } from '../fx/fx';
import { agentById, moodOf, statusOf, type Signals } from '../lib/agents';
import { modNotice } from '../lib/agent-brain';
import { hash32 } from '../lib/arabic';
import { useCatalog } from '../lib/catalog';
import { type CommunityState, ensureMember, ensureSeeded, grantBadge, grantXp, type Member, memberIdFor, rankOf, reactionSet, readCommunity, type Reactions, writeCommunity, XP } from '../lib/community';
import { acceptRules, hasAccepted, type Penalty, review } from '../lib/moderation';
import { RULES_VERSION, ruleById, ruleSections } from '../lib/rules';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import type { Attachment } from '../lib/uploads';
import { AgentAvatar } from './agent-avatar';
import { Button } from './ui/button';
import { Uploader } from './uploader';

/** Seeds the per-browser community once the real catalog is loaded. */
export function useCommunityBoot() {
  const catalog = useCatalog();
  const items = (catalog.data?.items ?? []) as ProductCard[];
  useEffect(() => {
    if (items.length) ensureSeeded(items);
  }, [items]);
  return items;
}

export const quietSignals: Signals = { dropsToday: 0, fakeFlags: 0, storeFailures: 0, violationsHour: 0, pendingAppeals: 0, newMembers: 0, chatMessagesHour: 0, productsLive: 0, hoursSinceRefresh: 0 };

export function MemberAvatar({ m, size = 40 }: { m: Member | undefined; size?: number }) {
  if (!m) return <span className="inline-block rounded-full bg-accent" style={{ width: size, height: size }} />;
  if (m.agent) {
    const a = agentById(m.agent);
    if (a) return <AgentAvatar agent={a} mood={moodOf(a, quietSignals)} status={statusOf(a, quietSignals)} size={size} />;
  }
  const h = hash32(m.id);
  const hue = h % 360;
  const initials = m.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  return (
    <span className="grid flex-none place-items-center rounded-full font-bold text-white shadow-inner" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 70% 55%))` }}>
      {initials}
    </span>
  );
}

export function MemberName({ m, showRank = true }: { m: Member | undefined; showRank?: boolean }) {
  const tr = useTr();
  if (!m) return <span className="text-muted">—</span>;
  const r = rankOf(m.xp);
  const a = m.agent ? agentById(m.agent) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Link to="/u/$id" params={{ id: m.id }} className="font-semibold hover:underline">{m.name}</Link>
      {a ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary"><Bot className="h-3 w-3" />{tr('وكيل ذكي', 'AI agent')}</span> : null}
      {m.demo ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-muted"><FlaskConical className="h-3 w-3" />{tr('عضو تجريبي', 'Demo member')}</span> : null}
      {showRank && !a ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: r.color }}>{r.emoji} {tr(r.ar, r.en)} · Lv{r.level}</span> : null}
    </span>
  );
}

export function ReactionBar({ reactions, me, onToggle }: { reactions: Reactions; me: string | null; onToggle: (emoji: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {reactionSet.map((e) => {
        const list = reactions[e] ?? [];
        const mine = me ? list.includes(me) : false;
        return (
          <button key={e} type="button" onClick={(ev) => { if (!mine && e === '🔥') confetti({ x: ev.clientX, y: ev.clientY, count: 24 }); onToggle(e); }} className={`rounded-full px-2 py-0.5 text-sm transition hover:scale-110 ${mine ? 'bg-primary/20 ring-1 ring-primary' : list.length ? 'bg-accent' : 'opacity-60 hover:opacity-100'}`} aria-pressed={mine}>
            {e}{list.length ? <span className="num ms-1 text-xs">{list.length}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Rules acceptance dialog (shown once per rules version per member). */
export function RulesDialog({ open, onAccept, onClose }: { open: boolean; onAccept: () => void; onClose: () => void }) {
  const tr = useTr();
  const [ok, setOk] = useState(false);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="page-enter max-h-[88vh] w-full max-w-2xl overflow-auto rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <AgentAvatar agent={agentById('nabil') as NonNullable<ReturnType<typeof agentById>>} size={56} />
          <div>
            <h2 className="text-xl font-bold">{tr('قوانين مجتمع صفقة', 'Safqa community rules')}</h2>
            <p className="text-xs text-muted">{tr(`إصدار ${RULES_VERSION} · لازم توافق قبل ما تنشر أو تعلّق أو تقيّم أو تدردش`, `Version ${RULES_VERSION} · required before posting, commenting, reviewing or chatting`)}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {ruleSections.map((s) => (
            <div key={s.id}>
              <p className="font-bold">{s.id}. {s.ar}</p>
              <ul className="mt-1 space-y-0.5 text-muted">{s.rules.map((r) => <li key={r.id}><span className="num font-semibold text-foreground">{r.id}</span> {r.ar}</li>)}</ul>
            </div>
          ))}
          <p className="rounded-2xl bg-accent p-3 text-xs leading-6">{tr('الوكلاء القانونيين (بوتات أوفلاين) بيفحصوا كل رسالة. المخالفة = نقاط. النقاط في 30 يوم بتحدد العقوبة: إنذار ← كتم 10 دقايق ← كتم ساعة ← حظر 24 ساعة ← حظر 7 أيام. النصب والممنوعات = حظر فوري. كل عقوبة بتذكر رقم المادة وتقدر تتظلم منها.', 'Offline legal agents check every message. Violations add points; points in 30 days set the penalty: warning → 10-min mute → 1-hour mute → 24-hour ban → 7-day ban. Scams and illegal goods = immediate ban. Every penalty cites the rule and can be appealed.')}</p>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm font-semibold">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--saffron)]" />
          {tr('قريت القوانين وموافق عليها، وفاهم إن المخالفة عليها عقوبة تلقائية.', 'I have read and accept the rules and understand violations are penalised automatically.')}
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{tr('مش دلوقتي', 'Not now')}</Button>
          <Button disabled={!ok} onClick={onAccept}><ShieldCheck className="h-4 w-4" />{tr('موافق', 'I accept')}</Button>
        </div>
      </div>
    </div>
  );
}

export interface Guard {
  me: Member | null;
  meId: string | null;
  /** Run moderation + gates. Returns the member id when the content may be published. */
  check: (text: string, files: Attachment[], where: string) => Promise<{ ok: boolean; warned?: string; penalty?: Penalty }>;
  dialog: ReactNode;
}

export function useGuard(): Guard {
  const { user } = useSession();
  const tr = useTr();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<((v: boolean) => void) | null>(null);
  const meId = memberIdFor(user);
  const state = readCommunity();
  const me = meId && state ? state.members[meId] ?? null : null;

  async function check(text: string, files: Attachment[], where: string) {
    if (!user) {
      toast(tr('سجّل دخول الأول علشان تشارك في المجتمع', 'Sign in first to take part'), 'error');
      void navigate({ to: '/login' });
      return { ok: false };
    }
    const s = readCommunity();
    if (!s) return { ok: false };
    const m = ensureMember(s, user);
    writeCommunity(s);
    if (!hasAccepted(m.id, RULES_VERSION)) {
      const accepted = await new Promise<boolean>((resolve) => {
        setPending(() => resolve);
        setOpen(true);
      });
      if (!accepted) return { ok: false };
    }
    const verdict = review(m.id, m.name, text, where, files);
    if (verdict.ok) return { ok: true };
    const p = verdict.penalty;
    const agent = agentById(p.agentId) ?? agentById('nabil');
    const actionAr = p.action === 'warning' ? 'إنذار' : p.action === 'mute' ? 'كتم' : 'حظر مؤقت';
    const s2 = readCommunity();
    if (s2 && (p.at > new Date(Date.now() - 2000).toISOString())) {
      grantXp(s2, m.id, p.action === 'warning' ? XP.warning : p.action === 'mute' ? XP.mute : XP.ban, `عقوبة ${p.rules.join('، ')}`);
      writeCommunity(s2);
    }
    toast(`${agent?.emoji[0] ?? '⚖️'} ${agent ? modNotice(agent, actionAr, p.rules, p.until) : ''}`, 'error');
    if (verdict.blocked) return { ok: false, penalty: p };
    return { ok: true, warned: p.rules.join('، '), penalty: p };
  }

  const dialog = (
    <RulesDialog
      open={open}
      onClose={() => { setOpen(false); pending?.(false); }}
      onAccept={() => {
        const s = readCommunity();
        if (s && user) {
          const m = ensureMember(s, user);
          acceptRules(m.id, RULES_VERSION);
          grantXp(s, m.id, XP.rules, 'وافق على القوانين');
          grantBadge(s, m.id, 'law-abiding');
          writeCommunity(s);
          // Mona welcomes the newcomer in the general group.
          s.posts.unshift({ id: crypto.randomUUID(), authorId: 'agent:mona', groupId: 'general', text: `🌸 رحبوا معايا بـ ${m.name}! نوّرت مجتمع صفقة. ابدأ بمنشور تعرّفنا فيه بنفسك أو اسأل عن أي منتج 🎉`, attachments: [], at: new Date().toISOString(), reactions: {}, comments: [], kind: 'welcome' });
          writeCommunity(s);
        }
        setOpen(false);
        pending?.(true);
        toast(tr('أهلًا بيك في المجتمع! +20 XP و شارة «ملتزم بالقوانين» ⚖️', 'Welcome! +20 XP and the Law-abiding badge ⚖️'));
      }}
    />
  );
  return { me, meId, check, dialog };
}

export function Composer({ placeholder, onSubmit, compact = false, allowFiles = true, cta }: { placeholder: string; onSubmit: (text: string, files: Attachment[]) => Promise<boolean>; compact?: boolean; allowFiles?: boolean; cta?: string }) {
  const tr = useTr();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim() && files.length === 0) return;
    setBusy(true);
    const ok = await onSubmit(text.trim(), files);
    setBusy(false);
    if (ok) {
      setText('');
      setFiles([]);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && compact) { e.preventDefault(); void send(); } }} rows={compact ? 1 : 3} placeholder={placeholder} className="min-h-10 flex-1 resize-y rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" maxLength={4000} />
        <Button onClick={() => void send()} disabled={busy} aria-label={tr('إرسال', 'Send')}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{compact ? null : cta ?? tr('انشر', 'Post')}</Button>
      </div>
      {allowFiles ? <Uploader value={files} onChange={setFiles} compact={compact} /> : null}
    </div>
  );
}

export function RuleChip({ id }: { id: string }) {
  const r = ruleById(id);
  return <Link to="/rules" hash={`rule-${id}`} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"><Gavel className="h-3 w-3" />{id} {r?.ar}</Link>;
}

export function timeAgo(iso: string, locale: 'ar' | 'en' = 'ar') {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en', { numeric: 'auto' });
  if (s < 60) return rtf.format(-Math.round(s), 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

export function useCommunityState(): CommunityState | null {
  const [, force] = useState(0);
  useEffect(() => {
    const h = (e: Event) => { if (!(e instanceof CustomEvent) || e.detail === 'safqa.community.v1') force((x) => x + 1); };
    window.addEventListener('safqa:local', h);
    window.addEventListener('storage', h);
    // Seeding may have happened in an earlier effect of the same render, before this listener existed.
    force((x) => x + 1);
    return () => { window.removeEventListener('safqa:local', h); window.removeEventListener('storage', h); };
  }, []);
  return readCommunity();
}
