import { Link } from '@tanstack/react-router';
import { Bot, Hash, Lock, MessageSquare, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AgentAvatar } from '../components/agent-avatar';
import { Composer, MemberAvatar, MemberName, quietSignals, ReactionBar, timeAgo, useCommunityBoot, useCommunityState, useGuard } from '../components/community-kit';
import { Attachments } from '../components/uploader';
import { PageHeader, useToast } from '../fx/fx';
import { agentById, agents, moodOf, onShift, statusLabel, statusOf } from '../lib/agents';
import { modNotice, think } from '../lib/agent-brain';
import { logAgent } from '../lib/agent-log';
import { hasAny } from '../lib/arabic';
import { dmKey, ensureMember, grantBadge, grantXp, type Message, readCommunity, toggleReaction, writeCommunity, XP } from '../lib/community';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import type { Attachment } from '../lib/uploads';

export function ChatPage({ dm }: { dm?: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { user } = useSession();
  const products = useCommunityBoot();
  const state = useCommunityState();
  const guard = useGuard();
  const meId = user ? `u:${user.email.toLowerCase()}` : null;
  const [room, setRoom] = useState<string>(dm && meId ? dmKey(meId, dm) : 'lobby');
  const [typing, setTyping] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (dm && meId) setRoom(dmKey(meId, dm)); }, [dm, meId]);
  const msgs = state?.messages[room] ?? [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, typing]);
  if (!state) return <div className="skeleton h-96 rounded-3xl" />;
  const isDm = room.startsWith('dm:');
  const peerId = isDm && meId ? room.slice(3).split('|').find((x) => x !== meId) ?? '' : '';
  const peer = state.members[peerId];
  const roomDef = state.rooms.find((r) => r.id === room);
  const host = isDm ? (peer?.agent ? agentById(peer.agent) : null) : agentById(roomDef?.host ?? 'sherif');
  // Off-shift hosts hand over to an on-shift teammate.
  const responder = host && !onShift(host) ? agents.find((a) => a.team === host.team && onShift(a)) ?? host : host;
  const dms = meId ? Object.keys(state.messages).filter((k) => k.startsWith('dm:') && k.includes(meId)) : [];

  async function send(text: string, files: Attachment[]) {
    const v = await guard.check(text, files, isDm ? 'dm' : 'chat');
    if (!v.ok || !user) {
      if (v.penalty && !isDm) {
        const s = readCommunity();
        const a = agentById(v.penalty.agentId);
        if (s && a) {
          (s.messages[room] ??= []).push({ id: crypto.randomUUID(), authorId: `agent:${a.id}`, text: modNotice(a, v.penalty.action === 'warning' ? 'إنذار' : v.penalty.action === 'mute' ? 'كتم' : 'حظر مؤقت', v.penalty.rules, v.penalty.until), attachments: [], at: new Date().toISOString(), reactions: {}, system: true });
          writeCommunity(s);
          logAgent({ agentId: a.id, kind: 'moderation', ar: `${v.penalty.action} لـ ${v.penalty.memberName} — المادة ${v.penalty.rules.join('، ')}`, en: `${v.penalty.action} for ${v.penalty.memberName} — rule ${v.penalty.rules.join(', ')}` });
        }
      }
      return false;
    }
    const s = readCommunity();
    if (!s) return false;
    const m = ensureMember(s, user);
    const msg: Message = { id: crypto.randomUUID(), authorId: m.id, text, attachments: files, at: new Date().toISOString(), reactions: {} };
    (s.messages[room] ??= []).push(msg);
    s.messages[room] = (s.messages[room] ?? []).slice(-300);
    grantXp(s, m.id, XP.chat, 'رسالة دردشة');
    if ((s.messages[room] ?? []).filter((x) => x.authorId === m.id).length >= 20) grantBadge(s, m.id, 'chatter');
    writeCommunity(s);
    // Agent reply: always in DMs with agents; in rooms when addressed, asked, or greeted.
    const addressed = isDm ? Boolean(peer?.agent) : /[؟?]|@/.test(text) || hasAny(text, ['ارخص', 'احسن', 'بكام', 'سعر', 'اهلا', 'السلام', 'ازيك', 'مين', 'عرض', 'خصم', 'تحت']);
    if (responder && addressed) {
      setTyping(responder.name);
      const delay = 700 + Math.min(2200, text.length * 25);
      setTimeout(() => {
        const s2 = readCommunity();
        if (!s2) return;
        const r = think(responder, text, { products, mood: moodOf(responder, quietSignals), userName: m.name, seed: msg.id });
        (s2.messages[room] ??= []).push({ id: crypto.randomUUID(), authorId: `agent:${responder.id}`, text: r.text, attachments: [], at: new Date().toISOString(), reactions: {}, productId: r.productIds[0] });
        writeCommunity(s2);
        setTyping(null);
        logAgent({ agentId: responder.id, kind: 'chat', ar: `رد على ${m.name} في ${isDm ? 'رسالة خاصة' : roomDef?.name}`, en: `Replied to ${m.name}` });
      }, delay);
    } else if (isDm && peer?.demo) {
      toast(tr('ده عضو تجريبي — مش هيرد. جرّب تكلم وكيل ذكي 🤖', 'This is a demo member — no replies. Try an AI agent 🤖'));
    }
    return true;
  }

  const react = (mid: string, e: string) => {
    if (!meId) return;
    const s = readCommunity();
    const m = s?.messages[room]?.find((x) => x.id === mid);
    if (!s || !m) return;
    toggleReaction(m.reactions, e, meId);
    writeCommunity(s);
  };

  return (
    <div className="space-y-4">
      {guard.dialog}
      <PageHeader kicker={tr('دردشة صفقة', 'Safqa chat')} title={tr('الدردشة', 'Chat')} lede={tr('غرف عامة بمضيفين أذكياء على مدار الساعة، ورسايل خاصة مع الأعضاء والوكلاء. كل رسالة بتعدّي على الوكلاء القانونيين.', 'Public rooms with 24/7 AI hosts, and DMs with members and agents. Every message passes the legal agents.')} icon={<MessageSquare className="h-6 w-6" />} />
      <div className="grid h-[70vh] min-h-[520px] gap-4 lg:grid-cols-[260px_1fr] [&>*]:min-w-0">
        <aside className="glass flex flex-col overflow-y-auto rounded-3xl p-3">
          <p className="mb-1 px-2 text-xs font-bold text-muted">{tr('الغرف', 'Rooms')}</p>
          {state.rooms.map((r) => {
            const h = agentById(r.host);
            return (
              <button key={r.id} type="button" onClick={() => setRoom(r.id)} className={`flex items-center gap-2 rounded-2xl px-2 py-2 text-start text-sm ${room === r.id ? 'bg-primary/15 font-semibold' : 'hover:bg-accent'}`}>
                <span className="text-lg">{r.emoji}</span>
                <span className="flex-1"><span className="block">{locale === 'ar' ? r.name : r.nameEn}</span><span className="block text-[10px] text-muted">{h?.name} {h && onShift(h) ? '🟢' : '🌙'}</span></span>
                <span className="num text-[10px] text-muted">{state.messages[r.id]?.length ?? 0}</span>
              </button>
            );
          })}
          <p className="mb-1 mt-4 px-2 text-xs font-bold text-muted">{tr('رسايل خاصة', 'Direct messages')}</p>
          {dms.map((k) => { const pid = k.slice(3).split('|').find((x) => x !== meId) ?? ''; const pm = state.members[pid]; return <button key={k} type="button" onClick={() => setRoom(k)} className={`flex items-center gap-2 rounded-2xl px-2 py-1.5 text-start text-sm ${room === k ? 'bg-primary/15' : 'hover:bg-accent'}`}><MemberAvatar m={pm} size={26} /><span className="line-clamp-1">{pm?.name}</span></button>; })}
          <p className="mt-2 px-2 text-[11px] text-muted">{tr('ابدأ محادثة مع وكيل:', 'Start a chat with an agent:')}</p>
          <div className="mt-1 flex flex-wrap gap-1 px-1">
            {['saqr', 'hala', 'abuali', 'hoda', 'nour'].map((id) => { const a = agentById(id); return a ? <button key={id} type="button" title={a.name} onClick={() => { if (!meId) return toast(tr('سجّل دخول الأول', 'Sign in first'), 'error'); setRoom(dmKey(meId, `agent:${id}`)); }}><AgentAvatar agent={a} size={34} /></button> : null; })}
          </div>
        </aside>
        <section className="glass flex flex-col overflow-hidden rounded-3xl">
          <header className="flex items-center gap-3 border-b border-border p-3">
            {isDm ? <><MemberAvatar m={peer} size={36} /><div><MemberName m={peer} /><p className="flex items-center gap-1 text-[11px] text-muted"><Lock className="h-3 w-3" />{tr('رسالة خاصة · محفوظة على جهازك', 'Private · stored on this device')}</p></div></> : <><Hash className="h-5 w-5 text-primary" /><div><p className="font-bold">{roomDef ? (locale === 'ar' ? roomDef.name : roomDef.nameEn) : ''}</p><p className="text-[11px] text-muted">{roomDef?.topic}</p></div></>}
            {responder ? <span className="ms-auto flex items-center gap-2 text-xs"><AgentAvatar agent={responder} mood={moodOf(responder, quietSignals)} size={30} /><span><span className="font-semibold">{responder.name}</span><span className="block text-[10px]" style={{ color: statusLabel[statusOf(responder, quietSignals)][2] }}>● {tr(statusLabel[statusOf(responder, quietSignals)][0], statusLabel[statusOf(responder, quietSignals)][1])}</span></span></span> : null}
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.map((m) => {
              const a = state.members[m.authorId];
              const mine = m.authorId === meId;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  <MemberAvatar m={a} size={32} />
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${m.system ? 'border border-destructive/40 bg-destructive/10' : mine ? 'bg-primary/20' : 'bg-card'}`}>
                    <div className="flex items-center gap-2 text-[11px]"><MemberName m={a} showRank={false} /><span className="text-muted">{timeAgo(m.at, locale)}</span></div>
                    <p className="mt-0.5 whitespace-pre-line text-sm leading-6" dir="auto">{m.text}</p>
                    <Attachments items={m.attachments} size={120} />
                    {m.productId ? <Link to="/product/$id" params={{ id: m.productId }} className="mt-1 inline-block text-xs font-semibold text-primary">{tr('افتح المنتج ←', 'Open product →')}</Link> : null}
                    <div className="mt-1 opacity-70 hover:opacity-100"><ReactionBar reactions={m.reactions} me={meId} onToggle={(e) => react(m.id, e)} /></div>
                  </div>
                </div>
              );
            })}
            {typing ? <p className="flex items-center gap-2 text-xs text-muted"><Bot className="h-4 w-4 animate-pulse" />{typing} {tr('بيكتب…', 'is typing…')}</p> : null}
            <div ref={end} />
          </div>
          <div className="border-t border-border p-3">
            {user ? <Composer compact placeholder={tr('اكتب رسالة… (Enter للإرسال)', 'Message… (Enter to send)')} onSubmit={send} /> : <p className="text-center text-sm"><Link to="/login" className="font-semibold text-primary">{tr('سجّل دخول', 'Sign in')}</Link> {tr('علشان تشارك في الدردشة', 'to chat')}</p>}
          </div>
        </section>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-muted"><Users className="h-3 w-3" />{tr('الدردشة في النسخة الثابتة محلية على متصفحك — مفيش سيرفر بيوصّل رسايلك لناس تانيين. الوكلاء بيردوا أوفلاين من بيانات صفقة الحقيقية.', 'In the static edition chat is local to your browser — no server relays messages to others. Agents answer offline from Safqa’s real data.')}</p>
    </div>
  );
}
