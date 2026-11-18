// «المجتمع المباشر»: real, server-synced community feed + chat rooms with the
// AI agents (Workers AI). Works the same on the web and the app.
import { Bot, Loader2, MessageSquare, Paperclip, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TelegramFollowButton } from '../components/telegram-follow';
import { Card, PageHeader } from '../fx/fx';
import { edge, EdgeError, edgeUp, mediaUrl, signedInToBackend, uploadMedia } from '../lib/edge';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

type Att = { id: string; name: string; type: string; size: number; url: string };
type Author = { id: string; name: string; picture?: string | null; tier?: string; ai?: boolean; title?: string; emoji?: string; rank?: { ar: string; emoji: string; color: string } };
type Msg = { id: string; seq: number; authorId: string; text: string; attachments: Att[]; reactions: Record<string, string[]>; ai: boolean; at: string };
type Post = { id: string; authorId: string; groupId: string; text: string; attachments: Att[]; reactions: Record<string, string[]>; at: string; pinned: boolean; comments: { id: string; authorId: string; text: string; at: string }[] };
const TIER_FLAIR: Record<string, string> = { silver: '🥈', gold: '👑', diamond: '💎' };
const REACTIONS = ['👍', '❤️', '🔥', '😂', '💰'];

function Attachments({ items }: { items: Att[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => a.type.startsWith('image/') ? <img key={a.id} src={mediaUrl(a.url)} alt={a.name} loading="lazy" className="max-h-56 rounded-xl" /> : a.type.startsWith('video/') ? <video key={a.id} src={mediaUrl(a.url)} controls className="max-h-64 rounded-xl" /> : <a key={a.id} href={mediaUrl(a.url)} target="_blank" rel="noreferrer" className="underline">📎 {a.name}</a>)}
    </div>
  );
}
function Name({ a }: { a?: Author }) {
  if (!a) return <b>عضو</b>;
  return <span className="inline-flex flex-wrap items-center gap-1.5"><b>{a.emoji ? `${a.emoji} ` : ''}{a.name}</b>{a.ai ? <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-600">🤖 وكيل ذكاء اصطناعي</span> : null}{a.tier && TIER_FLAIR[a.tier] ? <span title={a.tier}>{TIER_FLAIR[a.tier]}</span> : null}{a.rank ? <span className="t-meta" style={{ color: a.rank.color }}>{a.rank.emoji} {a.rank.ar}</span> : null}</span>;
}

export function LivePage() {
  const tr = useTr();
  const { user } = useSession();
  const [up, setUp] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'chat' | 'feed'>(() => (new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search).get('tab') === 'feed' ? 'feed' : 'chat'));
  const [rules, setRules] = useState<{ rules: { id: string; ar: string }[]; version: string } | null>(null);
  const [needRules, setNeedRules] = useState(false);
  const linked = Boolean(user) && signedInToBackend();
  useEffect(() => { void edgeUp(true).then(setUp); edge<any>('/api/v2/rules').then(setRules).catch(() => 0); }, []);
  const acceptRules = async () => { await edge('/api/v2/rules/accept', { body: {} }); setNeedRules(false); };
  const onErr = (e: unknown) => { if (e instanceof EdgeError && e.code === 'rules_required') setNeedRules(true); return e instanceof EdgeError ? e.message : 'حصلت مشكلة'; };

  return (
    <div className="space-y-6">
      <PageHeader kicker={tr('متزامن على الموقع والتطبيق وتيليجرام', 'Synced across web, app and Telegram')} title={tr('المجتمع المباشر', 'Live community')} lede={tr('دردشة ومنشورات حقيقية مع أعضاء صفقة، ووكلاء ذكاء اصطناعي 🤖 بيردوا بأسعار حقيقية. القوانين بتتطبق تلقائي.', 'Real chat and posts with Safqa members, plus AI agents 🤖 answering with real prices. Rules are enforced automatically.')} icon={<Users className="h-6 w-6" />}>
        <TelegramFollowButton compact />
      </PageHeader>
      {up === false ? <Card>⚠️ {tr('السيرفر مش متاح دلوقتي. المجتمع المحلي لسه شغال من صفحة المجتمع.', 'The server is unreachable; the local community page still works.')}</Card> : null}
      {needRules && rules ? (
        <Card>
          <p className="font-bold">⚖️ {tr('قوانين المجتمع (لازم توافق قبل ما تكتب)', 'Community rules (accept before posting)')}</p>
          <ul className="t-body mt-2 grid gap-1 sm:grid-cols-2">{rules.rules.map((r) => <li key={r.id}><b>{r.id}</b> {r.ar}</li>)}</ul>
          <button type="button" onClick={acceptRules} className="press mt-3 rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground">{tr('موافق على القوانين', 'I accept the rules')}</button>
        </Card>
      ) : null}
      {!linked ? <Card>{tr('سجّل دخول عشان تكتب. القراءة متاحة للكل.', 'Sign in to write. Reading is open to everyone.')} <a className="text-primary underline" href="#/login">{tr('تسجيل الدخول', 'Sign in')}</a></Card> : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('chat')} className={`press rounded-full px-4 py-2 font-semibold ${tab === 'chat' ? 'bg-primary text-primary-foreground' : 'border border-border'}`}><MessageSquare className="me-1 inline h-4 w-4" />{tr('الدردشة', 'Chat')}</button>
        <button type="button" onClick={() => setTab('feed')} className={`press rounded-full px-4 py-2 font-semibold ${tab === 'feed' ? 'bg-primary text-primary-foreground' : 'border border-border'}`}><Users className="me-1 inline h-4 w-4" />{tr('المنشورات', 'Posts')}</button>
      </div>
      {up ? (tab === 'chat' ? <Chat linked={linked} onErr={onErr} /> : <Feed linked={linked} onErr={onErr} />) : up === null ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
    </div>
  );
}

function Composer({ onSend, linked, placeholder }: { onSend: (text: string, att: Att[]) => Promise<void>; linked: boolean; placeholder: string }) {
  const [text, setText] = useState('');
  const [att, setAtt] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (!text.trim() && !att.length) return;
    setBusy(true); setErr('');
    try { await onSend(text, att); setText(''); setAtt([]); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr('');
    try { const a = (await uploadMedia(f)) as Att; setAtt((x) => [...x, a].slice(0, 4)); } catch (er) { setErr((er as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      {att.length ? <div className="mb-2 flex flex-wrap gap-2">{att.map((a) => <span key={a.id} className="rounded-full border border-border px-2 py-0.5 text-xs">📎 {a.name}</span>)}</div> : null}
      <div className="flex items-center gap-2">
        <label className={`press grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-border ${linked ? '' : 'pointer-events-none opacity-40'}`} title="صور / فيديو / PDF">
          <Paperclip className="h-4 w-4" />
          <input type="file" accept="image/*,video/mp4,video/webm,application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <input disabled={!linked} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void send(); }} placeholder={placeholder} className="h-11 min-w-0 flex-1 rounded-full border border-border bg-transparent px-4" />
        <button type="button" disabled={!linked || busy} onClick={() => void send()} className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
      </div>
      {err ? <p className="mt-2 text-sm text-red-600">⚠️ {err}</p> : null}
    </div>
  );
}

function Chat({ linked, onErr }: { linked: boolean; onErr: (e: unknown) => string }) {
  const tr = useTr();
  const [rooms, setRooms] = useState<{ id: string; name: string; emoji: string; topic: string; host: string; today: number }[]>([]);
  const [room, setRoom] = useState('lobby');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { edge<any>('/api/v2/chat/rooms').then((r) => { setRooms(r.rooms); if (r.rooms[0] && !r.rooms.some((x: { id: string }) => x.id === 'lobby')) setRoom(r.rooms[0].id); }).catch(() => 0); }, []);
  const poll = useCallback(async (reset = false) => {
    const r = await edge<{ messages: Msg[]; authors: Record<string, Author> }>(`/api/v2/chat/rooms/${encodeURIComponent(room)}/messages${reset ? '' : `?after=${last.current}`}`).catch(() => null);
    if (!r) return;
    setAuthors((a) => ({ ...a, ...r.authors }));
    if (r.messages.length || reset) {
      setMsgs((m) => (reset ? r.messages : [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]));
      last.current = r.messages.at(-1)?.seq ?? last.current;
      requestAnimationFrame(() => box.current?.scrollTo({ top: 1e9, behavior: 'smooth' }));
    }
  }, [room]);
  useEffect(() => {
    last.current = 0; setMsgs([]); void poll(true);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 4000);
    return () => clearInterval(t);
  }, [poll]);
  const host = rooms.find((r) => r.id === room)?.host;
  const react = async (m: Msg, e: string) => {
    const r = await edge<any>('/api/v2/community/react', { body: { type: 'message', id: m.id, emoji: e } }).catch(() => null);
    if (r?.reactions) setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, reactions: r.reactions } : x)));
  };
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div className="flex gap-2 overflow-x-auto md:flex-col">
        {rooms.map((r) => <button key={r.id} type="button" onClick={() => setRoom(r.id)} className={`press shrink-0 rounded-2xl px-3 py-2 text-start ${room === r.id ? 'bg-primary text-primary-foreground' : 'glass'}`}><span className="me-1">{r.emoji}</span>{r.name}{r.today ? <span className="t-meta ms-1">· {r.today}</span> : null}</button>)}
      </div>
      <Card className="flex h-[65vh] flex-col">
        {host ? <p className="t-meta mb-2"><Bot className="me-1 inline h-4 w-4" />{tr(`مضيف الغرفة وكيل ذكاء اصطناعي (@${host}) — اسأل بعلامة ؟ أو اكتب @اسم_الوكيل`, `The room host is an AI agent (@${host}) — ask with ? or mention @agent`)}</p> : null}
        <div ref={box} className="flex-1 space-y-3 overflow-y-auto pe-1">
          {msgs.map((m) => (
            <div key={m.id} className={`rounded-2xl p-3 ${m.ai ? 'border border-sky-500/30 bg-sky-500/5' : 'bg-black/5 dark:bg-white/5'}`}>
              <div className="flex items-center gap-2 text-sm"><Name a={authors[m.authorId]} /><span className="t-meta">{new Date(m.at).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}</span></div>
              <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
              <Attachments items={m.attachments} />
              <div className="mt-1 flex gap-1">{REACTIONS.map((e) => <button key={e} type="button" disabled={!linked} className="press rounded-full px-1.5 text-sm opacity-70 hover:opacity-100" onClick={() => void react(m, e)}>{e}{m.reactions?.[e]?.length ? <span className="text-xs"> {m.reactions[e].length}</span> : null}</button>)}</div>
            </div>
          ))}
          {!msgs.length ? <p className="t-meta py-10 text-center">{tr('لسه مفيش رسايل — ابدأ إنت 👋', 'No messages yet — say hi 👋')}</p> : null}
        </div>
        <div className="mt-3"><Composer linked={linked} placeholder={tr('اكتب رسالة…', 'Write a message…')} onSend={async (text, att) => { try { await edge(`/api/v2/chat/rooms/${encodeURIComponent(room)}/messages`, { body: { text, attachments: att } }); } catch (e) { throw new Error(onErr(e)); } finally { await poll(); setTimeout(() => void poll(), 6000); } }} /></div>
      </Card>
    </div>
  );
}

function Feed({ linked, onErr }: { linked: boolean; onErr: (e: unknown) => string }) {
  const tr = useTr();
  const [data, setData] = useState<{ posts: Post[]; authors: Record<string, Author>; groups: { id: string; name: string; emoji: string }[] } | null>(null);
  const [group, setGroup] = useState('all');
  const load = useCallback(() => edge<any>(`/api/v2/community/feed${group === 'all' ? '' : `?group=${group}`}`).then(setData).catch(() => 0), [group]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 20000); return () => clearInterval(t); }, [load]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[{ id: 'all', name: tr('الكل', 'All'), emoji: '🌐' }, ...(data?.groups ?? [])].map((g) => <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={`press rounded-full px-3 py-1.5 text-sm ${group === g.id ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>{g.emoji} {g.name}</button>)}</div>
      <Card><Composer linked={linked} placeholder={tr('شارك عرض أو اسأل المجتمع… (الأسئلة بيرد عليها وكيل ذكي)', 'Share a deal or ask… (an AI agent answers questions)')} onSend={async (text, att) => { try { await edge('/api/v2/community/posts', { body: { groupId: group === 'all' ? 'general' : group, text, attachments: att } }); } catch (e) { throw new Error(onErr(e)); } await load(); setTimeout(() => void load(), 8000); }} /></Card>
      {data?.posts?.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center gap-2 text-sm"><Name a={data.authors[p.authorId]} /><span className="t-meta">{new Date(p.at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>{p.pinned ? <span>📌</span> : null}</div>
          <p className="mt-2 whitespace-pre-wrap">{p.text}</p>
          <Attachments items={p.attachments} />
          <div className="mt-2 flex gap-1">{REACTIONS.map((e) => <button key={e} type="button" disabled={!linked} className="press rounded-full border border-border px-2 text-sm" onClick={async () => { await edge('/api/v2/community/react', { body: { type: 'post', id: p.id, emoji: e } }).catch(() => 0); void load(); }}>{e}{p.reactions?.[e]?.length ? ` ${p.reactions[e].length}` : ''}</button>)}</div>
          <div className="mt-3 space-y-2 border-s-2 border-border ps-3">
            {(p.comments ?? []).map((c) => <div key={c.id} className={`rounded-xl p-2 text-sm ${data.authors[c.authorId]?.ai ? 'bg-sky-500/5' : ''}`}><Name a={data.authors[c.authorId]} /><p className="whitespace-pre-wrap">{c.text}</p></div>)}
            {linked ? <CommentBox onSend={async (t) => { try { await edge(`/api/v2/community/posts/${p.id}/comments`, { body: { text: t } }); } catch (e) { throw new Error(onErr(e)); } await load(); }} /> : null}
          </div>
        </Card>
      ))}
      {data && !data.posts?.length ? <p className="t-meta text-center">{tr('لسه مفيش منشورات هنا', 'No posts yet')}</p> : null}
    </div>
  );
}
function CommentBox({ onSend }: { onSend: (t: string) => Promise<void> }) {
  const [t, setT] = useState('');
  const [err, setErr] = useState('');
  const go = async () => { if (!t.trim()) return; try { await onSend(t); setT(''); setErr(''); } catch (er) { setErr((er as Error).message); } };
  return <div><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} placeholder="اكتب تعليق… (@saqr أو @hala عشان وكيل يرد)" className="h-9 w-full rounded-full border border-border bg-transparent px-3 text-sm" />{err ? <p className="text-xs text-red-600">⚠️ {err}</p> : null}</div>;
}
