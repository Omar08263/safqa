import { formatEGP, localized, type ProductCard } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { Crown, FlaskConical, MessageSquare, Pin, Search, Trophy, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Composer, MemberAvatar, MemberName, ReactionBar, RuleChip, timeAgo, useCommunityBoot, useCommunityState, useGuard } from '../components/community-kit';
import { ProductThumb } from '../features/visuals';
import { Card, PageHeader, Reveal, useToast } from '../fx/fx';
import { agentById } from '../lib/agents';
import { think } from '../lib/agent-brain';
import { normalizeAr } from '../lib/arabic';
import { communityBadges, type CommunityState, dmKey, ensureMember, grantBadge, grantXp, type Member, rankOf, ranks, readCommunity, toggleReaction, writeCommunity, XP } from '../lib/community';
import { logAgent } from '../lib/agent-log';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { Attachments } from '../components/uploader';
import { Button } from '../components/ui/button';

type Tab = 'feed' | 'groups' | 'leaderboard' | 'members';

export function CommunityPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const { user } = useSession();
  const products = useCommunityBoot();
  const state = useCommunityState();
  const guard = useGuard();
  const [tab, setTab] = useState<Tab>('feed');
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'hot'>('hot');
  if (!state) return <div className="skeleton h-96 rounded-3xl" />;
  const me = guard.meId ? state.members[guard.meId] : null;

  const posts = state.posts
    .filter((p) => group === 'all' || p.groupId === group)
    .filter((p) => !q || normalizeAr(p.text).includes(normalizeAr(q)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (sort === 'new' ? b.at.localeCompare(a.at) : score(b) - score(a)));

  async function publish(text: string, files: import('../lib/uploads').Attachment[]) {
    const v = await guard.check(text, files, 'community');
    if (!v.ok || !user) return false;
    const s = readCommunity();
    if (!s) return false;
    const m = ensureMember(s, user);
    const gid = group === 'all' ? 'general' : group;
    const first = !s.posts.some((p) => p.authorId === m.id);
    const post = { id: crypto.randomUUID(), authorId: m.id, groupId: gid, text, attachments: files, at: new Date().toISOString(), reactions: {}, comments: [] as CommunityState['posts'][number]['comments'], kind: 'post' as const, warned: v.warned };
    // Group host agent replies when the post asks something.
    const host = agentById(s.groups.find((g) => g.id === gid)?.host ?? 'sherif');
    if (host && /[؟?]|ازاي|فين|مين|كام|احسن|ارخص|انهي/.test(normalizeAr(text))) {
      const r = think(host, text, { products, mood: host.baseMood, userName: m.name, seed: post.id });
      post.comments.push({ id: crypto.randomUUID(), authorId: `agent:${host.id}`, text: r.text, attachments: [], at: new Date(Date.now() + 1000).toISOString(), reactions: {} });
      logAgent({ agentId: host.id, kind: 'community', ar: `رد على سؤال ${m.name} في جروب ${gid}`, en: `Answered ${m.name}'s question in ${gid}` });
    }
    s.posts.unshift(post);
    grantXp(s, m.id, XP.post, 'منشور');
    if (first) grantBadge(s, m.id, 'first-post');
    writeCommunity(s);
    toast(tr(`اتنشر! +${XP.post} XP`, `Posted! +${XP.post} XP`));
    return true;
  }

  return (
    <div className="space-y-6">
      {guard.dialog}
      <PageHeader kicker={tr('مجتمع صفقة', 'Safqa community')} title={tr('المجتمع', 'Community')} lede={tr('اسأل، قارن، شارك صور وفيديو، واكسب XP ورتب. الوكلاء الأذكياء بيرحبوا ويجاوبوا ويطبّقوا القوانين على مدار الساعة.', 'Ask, compare, share photos and videos, earn XP and ranks. AI agents greet, answer and enforce the rules around the clock.')} icon={<Users className="h-6 w-6" />}>
        <div className="flex gap-2">
          <Link to="/chat"><Button variant="outline"><MessageSquare className="h-4 w-4" />{tr('الدردشة', 'Chat')}</Button></Link>
          <Link to="/rules"><Button variant="outline">⚖️ {tr('القوانين', 'Rules')}</Button></Link>
        </div>
      </PageHeader>
      <p className="flex items-center gap-1.5 rounded-2xl bg-accent px-4 py-2 text-xs text-muted"><FlaskConical className="h-3.5 w-3.5" />{tr('النسخة الثابتة المجانية: المجتمع بيتحفظ على جهازك بس (localStorage + IndexedDB). الأعضاء المكتوب جنبهم «عضو تجريبي» محتوى تجريبي، والوكلاء بوتات ذكية واضحة.', 'Free static edition: the community is stored on this device only. Members marked “Demo member” are sample content; agents are clearly marked AI bots.')}</p>

      <div className="flex flex-wrap gap-1 rounded-full bg-accent p-1 text-sm" role="tablist">
        {([['feed', tr('المنشورات', 'Feed')], ['groups', tr('الجروبات', 'Groups')], ['leaderboard', tr('الترتيب', 'Leaderboard')], ['members', tr('الأعضاء', 'Members')]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 font-semibold ${tab === id ? 'bg-card shadow' : 'text-muted'}`}>{label}</button>
        ))}
      </div>

      {tab === 'feed' ? (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr_280px] [&>*]:min-w-0">
          <aside className="space-y-1">
            <button type="button" onClick={() => setGroup('all')} className={`w-full rounded-2xl px-3 py-2 text-start text-sm font-semibold ${group === 'all' ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`}>🌐 {tr('كل الجروبات', 'All groups')}</button>
            {state.groups.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-start text-sm ${group === g.id ? 'bg-primary/15 font-semibold text-primary' : 'hover:bg-accent'}`}>
                <span className="grid h-7 w-7 place-items-center rounded-lg text-base" style={{ background: `${g.color}22` }}>{g.emoji}</span>
                <span className="flex-1">{locale === 'ar' ? g.name : g.nameEn}</span>
                <span className="num text-[11px] text-muted">{state.posts.filter((p) => p.groupId === g.id).length}</span>
              </button>
            ))}
          </aside>
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-3">
                <MemberAvatar m={me ?? undefined} size={40} />
                <p className="text-sm text-muted">{me ? tr(`بتنشر في: ${group === 'all' ? 'العام' : state.groups.find((g) => g.id === group)?.name}`, 'Posting to the selected group') : tr('سجّل دخول علشان تنشر', 'Sign in to post')}</p>
              </div>
              <div className="mt-3"><Composer placeholder={tr('اكتب سؤال أو عرض لقيته أو تجربة… (الوكلاء بيردوا على الأسئلة)', 'Ask, share a deal or an experience… (agents answer questions)')} onSubmit={publish} /></div>
            </Card>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-full border border-border bg-card px-3"><Search className="h-4 w-4 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر في المنشورات', 'Search posts')} className="h-9 flex-1 bg-transparent text-sm outline-none" /></label>
              <select value={sort} onChange={(e) => setSort(e.target.value as 'new')} className="h-9 rounded-full border border-border bg-card px-3 text-sm"><option value="hot">{tr('الأكثر تفاعل 🔥', 'Hot 🔥')}</option><option value="new">{tr('الأحدث', 'Newest')}</option></select>
            </div>
            {posts.map((p, i) => <PostCard key={p.id} postId={p.id} state={state} products={products} me={me ?? null} index={i} />)}
            {posts.length === 0 ? <p className="py-10 text-center text-muted">{tr('مفيش منشورات هنا لسه', 'No posts yet')}</p> : null}
          </div>
          <aside className="space-y-4">
            {me ? <MyRankCard m={me} /> : null}
            <MiniLeaderboard state={state} />
          </aside>
        </div>
      ) : null}

      {tab === 'groups' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.groups.map((g, i) => {
            const joined = me ? g.members.includes(me.id) : false;
            const host = agentById(g.host ?? '');
            return (
              <Reveal key={g.id} delay={i * 50}>
                <Card className="h-full">
                  <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: `${g.color}26` }}>{g.emoji}</span><div><p className="font-bold">{locale === 'ar' ? g.name : g.nameEn}</p><p className="text-xs text-muted">{g.members.length} {tr('عضو', 'members')} · {state.posts.filter((p) => p.groupId === g.id).length} {tr('منشور', 'posts')}</p></div></div>
                  <p className="mt-2 text-sm text-muted">{g.desc}</p>
                  {host ? <p className="mt-2 text-xs">{tr('المشرف:', 'Host:')} <Link to="/agents/$id" params={{ id: host.id }} className="font-semibold text-primary">{host.name} 🤖</Link></p> : null}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant={joined ? 'outline' : 'default'} onClick={() => { if (!user) return toast(tr('سجّل دخول الأول', 'Sign in first'), 'error'); const s = readCommunity(); if (!s) return; const m = ensureMember(s, user); const gg = s.groups.find((x) => x.id === g.id); if (!gg) return; gg.members = joined ? gg.members.filter((x) => x !== m.id) : [...gg.members, m.id]; writeCommunity(s); }}>{joined ? tr('خروج', 'Leave') : tr('انضم', 'Join')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setGroup(g.id); setTab('feed'); }}>{tr('افتح', 'Open')}</Button>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      ) : null}

      {tab === 'leaderboard' ? <Leaderboard state={state} /> : null}
      {tab === 'members' ? <Members state={state} /> : null}
    </div>
  );
}

function score(p: CommunityState['posts'][number]) {
  const reacts = Object.values(p.reactions).reduce((n, l) => n + l.length, 0);
  const age = (Date.now() - Date.parse(p.at)) / 3600_000;
  return (reacts * 2 + p.comments.length * 3 + 1) / (age + 2) ** 1.3;
}

function PostCard({ postId, state, products, me, index }: { postId: string; state: CommunityState; products: ProductCard[]; me: Member | null; index: number }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const { user } = useSession();
  const guard = useGuard();
  const [open, setOpen] = useState(false);
  const p = state.posts.find((x) => x.id === postId);
  if (!p) return null;
  const author = state.members[p.authorId];
  const product = p.productId ? products.find((x) => x.id === p.productId) : null;
  const group = state.groups.find((g) => g.id === p.groupId);
  const react = (emoji: string) => {
    if (!me) return;
    const s = readCommunity();
    const x = s?.posts.find((y) => y.id === p.id);
    if (!s || !x) return;
    const had = (x.reactions[emoji] ?? []).includes(me.id);
    toggleReaction(x.reactions, emoji, me.id);
    if (!had && x.authorId !== me.id) grantXp(s, x.authorId, XP.reactionReceived, 'تفاعل على منشوره');
    writeCommunity(s);
  };
  async function comment(text: string, files: import('../lib/uploads').Attachment[]) {
    const v = await guard.check(text, files, 'community');
    if (!v.ok || !user) return false;
    const s = readCommunity();
    const x = s?.posts.find((y) => y.id === postId);
    if (!s || !x) return false;
    const m = ensureMember(s, user);
    x.comments.push({ id: crypto.randomUUID(), authorId: m.id, text, attachments: files, at: new Date().toISOString(), reactions: {}, warned: v.warned });
    grantXp(s, m.id, XP.comment, 'تعليق');
    // Mentioned agent answers.
    const mention = text.match(/@([a-z]+)/i)?.[1];
    const a = mention ? agentById(mention.toLowerCase()) : x.authorId.startsWith('agent:') ? agentById(x.authorId.slice(6)) : null;
    if (a) x.comments.push({ id: crypto.randomUUID(), authorId: `agent:${a.id}`, text: think(a, text, { products, mood: a.baseMood, userName: m.name, seed: text }).text, attachments: [], at: new Date(Date.now() + 1000).toISOString(), reactions: {} });
    writeCommunity(s);
    return true;
  }
  return (
    <Reveal delay={Math.min(index, 6) * 40}>
      <article className={`rounded-3xl border bg-card p-4 ${p.kind === 'deal' ? 'border-primary/50 shadow-[0_0_0_3px_var(--glow)]' : 'border-border'}`}>
        {guard.dialog}
        <header className="flex items-start gap-3">
          <MemberAvatar m={author} size={44} />
          <div className="min-w-0 flex-1">
            <MemberName m={author} />
            <p className="text-[11px] text-muted">{group ? `${group.emoji} ${locale === 'ar' ? group.name : group.nameEn} · ` : ''}{timeAgo(p.at, locale)}{p.pinned ? <span className="ms-1 inline-flex items-center gap-0.5 text-primary"><Pin className="h-3 w-3" />{tr('مثبّت', 'Pinned')}</span> : null}</p>
          </div>
          {p.kind === 'deal' ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">🎯 {tr('صفقة اليوم', 'Deal of the day')}</span> : null}
        </header>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7" dir="auto">{p.text}</p>
        {p.warned ? <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">{tr('اتنشر مع إنذار:', 'Published with a warning:')} {p.warned.split('، ').map((r) => <RuleChip key={r} id={r} />)}</div> : null}
        <Attachments items={p.attachments} size={110} />
        {product ? (
          <Link to="/product/$id" params={{ id: product.id }} className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-background p-2 hover:border-primary">
            <ProductThumb id={product.id} slug={product.category?.slug} className="h-14 w-14 flex-none" />
            <div className="min-w-0"><p className="line-clamp-1 text-sm font-semibold">{localized(locale, { ar: product.titleAr, en: product.titleEn })}</p><p className="num text-sm font-bold text-primary">{product.lowestPriceEgp ? formatEGP(product.lowestPriceEgp, locale) : ''}</p></div>
          </Link>
        ) : null}
        <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <ReactionBar reactions={p.reactions} me={me?.id ?? null} onToggle={react} />
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"><MessageSquare className="h-4 w-4" />{p.comments.length} {tr('تعليق', 'comments')}</button>
        </footer>
        {open || p.comments.length <= 2 ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {p.comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <MemberAvatar m={state.members[c.authorId]} size={30} />
                <div className="min-w-0 flex-1 rounded-2xl bg-accent px-3 py-2">
                  <div className="flex items-center gap-2 text-xs"><MemberName m={state.members[c.authorId]} showRank={false} /><span className="text-muted">{timeAgo(c.at, locale)}</span></div>
                  <p className="mt-0.5 whitespace-pre-line text-sm" dir="auto">{c.text}</p>
                  <Attachments items={c.attachments} size={72} />
                </div>
              </div>
            ))}
            <Composer compact placeholder={tr('اكتب تعليق… (اكتب @saqr أو @hala تنادي وكيل)', 'Comment… (type @saqr or @hala to call an agent)')} onSubmit={comment} />
          </div>
        ) : null}
      </article>
    </Reveal>
  );
}

function MyRankCard({ m }: { m: Member }) {
  const tr = useTr();
  const r = rankOf(m.xp);
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -end-6 -top-6 text-7xl opacity-20">{r.emoji}</div>
      <p className="text-xs text-muted">{tr('رتبتك', 'Your rank')}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: r.color }}>{r.emoji} {tr(r.ar, r.en)}</p>
      <p className="num text-sm">Lv {r.level} · {m.xp} XP</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full" style={{ width: `${r.progress * 100}%`, background: r.color }} /></div>
      {r.next ? <p className="mt-1 text-[11px] text-muted">{tr(`فاضل ${r.next.min - m.xp} XP على «${r.next.ar}»`, `${r.next.min - m.xp} XP to “${r.next.en}”`)}</p> : null}
      <div className="mt-3 flex flex-wrap gap-1">{m.badges.map((b) => { const d = communityBadges.find((x) => x.id === b); return d ? <span key={b} title={tr(d.ar, d.en)} className="rounded-full bg-accent px-2 py-0.5 text-sm">{d.emoji}</span> : null; })}</div>
    </Card>
  );
}

function humans(state: CommunityState) {
  return Object.values(state.members).filter((m) => !m.agent).sort((a, b) => b.xp - a.xp);
}

function MiniLeaderboard({ state }: { state: CommunityState }) {
  const tr = useTr();
  return (
    <Card>
      <p className="mb-2 flex items-center gap-2 font-bold"><Trophy className="h-4 w-4 text-primary" />{tr('أعلى 5', 'Top 5')}</p>
      <ol className="space-y-2">{humans(state).slice(0, 5).map((m, i) => <li key={m.id} className="flex items-center gap-2 text-sm"><span className="num w-5 font-bold">{['🥇', '🥈', '🥉', '4', '5'][i]}</span><MemberAvatar m={m} size={26} /><span className="line-clamp-1 flex-1">{m.name}</span><span className="num text-xs text-muted">{m.xp}</span></li>)}</ol>
    </Card>
  );
}

function Leaderboard({ state }: { state: CommunityState }) {
  const tr = useTr();
  const list = humans(state);
  const top = list.slice(0, 3);
  return (
    <div className="space-y-6">
      <div className="grid items-end gap-4 sm:grid-cols-3">
        {[1, 0, 2].map((k) => {
          const m = top[k];
          if (!m) return <div key={k} />;
          const h = k === 0 ? 'sm:h-64' : k === 1 ? 'sm:h-52' : 'sm:h-44';
          return (
            <Reveal key={m.id} delay={k * 120}>
              <div className={`glass flex flex-col items-center justify-end rounded-3xl p-4 text-center ${h}`}>
                {k === 0 ? <Crown className="float mb-1 h-8 w-8 text-[var(--saffron)]" /> : null}
                <MemberAvatar m={m} size={k === 0 ? 72 : 56} />
                <div className="mt-2"><MemberName m={m} /></div>
                <p className="num mt-1 text-2xl font-bold">{m.xp} XP</p>
                <p className="text-3xl">{['🥇', '🥈', '🥉'][k]}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-2 text-start">#</th><th className="text-start">{tr('العضو', 'Member')}</th><th className="text-start">{tr('الرتبة', 'Rank')}</th><th className="text-start">XP</th><th className="text-start">{tr('الشارات', 'Badges')}</th></tr></thead>
          <tbody>{list.map((m, i) => { const r = rankOf(m.xp); return <tr key={m.id} className="border-t border-border"><td className="num py-2">{i + 1}</td><td><span className="flex items-center gap-2"><MemberAvatar m={m} size={26} /><MemberName m={m} showRank={false} /></span></td><td><span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: r.color }}>{r.emoji} {tr(r.ar, r.en)}</span></td><td className="num">{m.xp}</td><td>{m.badges.map((b) => communityBadges.find((x) => x.id === b)?.emoji).join(' ')}</td></tr>; })}</tbody>
        </table>
      </Card>
      <Card>
        <p className="font-bold">{tr('نظام الرتب', 'Rank ladder')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{ranks.map((r) => <div key={r.min} className="rounded-2xl p-3 text-center text-white" style={{ background: r.color }}><p className="text-2xl">{r.emoji}</p><p className="text-sm font-bold">{tr(r.ar, r.en)}</p><p className="num text-xs opacity-90">{r.min}+ XP</p></div>)}</div>
        <p className="mt-3 text-xs text-muted">{tr(`طرق كسب XP: منشور +${XP.post}، تعليق +${XP.comment}، تقييم +${XP.review} (+${XP.reviewMedia} بصور)، إجابة سؤال +${XP.answer}، تفاعل على محتواك +${XP.reactionReceived}، الموافقة على القوانين +${XP.rules}. العقوبات بتخصم: إنذار ${XP.warning}، كتم ${XP.mute}، حظر ${XP.ban}.`, 'Earn XP by posting, commenting, reviewing, answering and getting reactions. Penalties deduct XP.')}</p>
      </Card>
    </div>
  );
}

function Members({ state }: { state: CommunityState }) {
  const tr = useTr();
  const [q, setQ] = useState('');
  const list = useMemo(() => Object.values(state.members).filter((m) => !q || normalizeAr(`${m.name} ${m.handle}`).includes(normalizeAr(q))), [state, q]);
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر على عضو أو وكيل', 'Find a member or agent')} className="h-10 w-full max-w-sm rounded-full border border-border bg-card px-4 text-sm" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <Link key={m.id} to="/u/$id" params={{ id: m.id }} className="lift flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <MemberAvatar m={m} size={48} />
            <div className="min-w-0"><MemberName m={m} /><p className="line-clamp-1 text-xs text-muted">{m.bio ?? `@${m.handle}`}</p></div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MemberPage({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const { user } = useSession();
  useCommunityBoot();
  const state = useCommunityState();
  const m = state?.members[id];
  if (!state || !m) return <p className="py-20 text-center text-muted">{tr('العضو مش موجود', 'Member not found')}</p>;
  const r = rankOf(m.xp);
  const posts = state.posts.filter((p) => p.authorId === id);
  const reviews = state.reviews.filter((x) => x.authorId === id);
  const meId = user ? `u:${user.email.toLowerCase()}` : null;
  const agent = m.agent ? agentById(m.agent) : null;
  return (
    <div className="space-y-6">
      <header className="page-hero relative overflow-hidden rounded-[2rem] border border-border p-6">
        <div className="mesh" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-5">
          <MemberAvatar m={m} size={112} />
          <div className="flex-1">
            <MemberName m={m} />
            <p className="text-sm text-muted">@{m.handle} · {tr('انضم', 'Joined')} {timeAgo(m.joinedAt, locale)}</p>
            {m.bio ? <p className="mt-2">{m.bio}</p> : null}
            {!agent ? <div className="mt-3 max-w-sm"><div className="h-2 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full" style={{ width: `${r.progress * 100}%`, background: r.color }} /></div><p className="num mt-1 text-xs">{m.xp} XP · Lv {r.level}</p></div> : null}
          </div>
          {agent ? <Link to="/agents/$id" params={{ id: agent.id }}><Button>{tr('ملف الوكيل', 'Agent profile')}</Button></Link> : meId && meId !== id ? <Link to="/chat" search={{ dm: id }}><Button><MessageSquare className="h-4 w-4" />{tr('رسالة خاصة', 'Message')}</Button></Link> : null}
        </div>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-muted">{tr('منشورات', 'Posts')}</p><p className="num text-3xl font-bold">{posts.length}</p></Card>
        <Card><p className="text-xs text-muted">{tr('تقييمات', 'Reviews')}</p><p className="num text-3xl font-bold">{reviews.length}</p></Card>
        <Card><p className="text-xs text-muted">{tr('الشارات', 'Badges')}</p><p className="text-2xl">{m.badges.map((b) => communityBadges.find((x) => x.id === b)?.emoji).join(' ') || '—'}</p></Card>
      </div>
      <Card>
        <p className="mb-2 font-bold">{tr('آخر النشاط', 'Recent activity')}</p>
        {posts.slice(0, 10).map((p) => <p key={p.id} className="border-t border-border py-2 text-sm"><span className="text-muted">{timeAgo(p.at, locale)} · </span>{p.text.slice(0, 160)}</p>)}
        {posts.length === 0 ? <p className="text-sm text-muted">{tr('مفيش نشاط لسه', 'No activity yet')}</p> : null}
      </Card>
    </div>
  );
}
export { dmKey };
