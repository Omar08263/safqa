// Community, chat, reviews and Q&A store for the static demo. Everything is
// per-browser (localStorage + IndexedDB for files). Seeded demo members are
// clearly flagged `demo: true` and labelled "عضو تجريبي" in the UI; agents are
// flagged `agent` and labelled "🤖 وكيل ذكي".
import { useCallback } from 'react';
import { agents } from './agents';
import { hash32 } from './arabic';
import { readLocal, useLocal, writeLocal } from './local';
import type { Attachment } from './uploads';

export const COMMUNITY_KEY = 'safqa.community.v1';

export interface Member {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  city?: string;
  joinedAt: string;
  demo?: boolean;
  agent?: string; // agent id
  xp: number;
  badges: string[];
}
export interface Reactions { [emoji: string]: string[] }
export interface Comment { id: string; authorId: string; text: string; attachments: Attachment[]; at: string; reactions: Reactions; warned?: string }
export interface Post {
  id: string;
  authorId: string;
  groupId: string;
  text: string;
  attachments: Attachment[];
  productId?: string;
  at: string;
  reactions: Reactions;
  comments: Comment[];
  pinned?: boolean;
  kind?: 'post' | 'deal' | 'welcome' | 'mod' | 'challenge';
  warned?: string; // rule cited on a warning that still allowed publishing
}
export interface Group { id: string; name: string; nameEn: string; desc: string; emoji: string; color: string; members: string[]; host?: string }
export interface Message { id: string; authorId: string; text: string; attachments: Attachment[]; at: string; reactions: Reactions; productId?: string; system?: boolean }
export interface Room { id: string; name: string; nameEn: string; topic: string; emoji: string; host: string }
export interface Review { id: string; productId: string; authorId: string; stars: number; title: string; text: string; attachments: Attachment[]; at: string; helpful: string[]; verified: boolean; pros?: string; cons?: string }
export interface Question { id: string; productId: string; authorId: string; text: string; at: string; answers: { id: string; authorId: string; text: string; at: string; votes: string[]; fromSpecs?: boolean }[] }

export interface CommunityState {
  v: number;
  members: Record<string, Member>;
  posts: Post[];
  groups: Group[];
  rooms: Room[];
  messages: Record<string, Message[]>; // roomId or dm:<a>|<b>
  reviews: Review[];
  questions: Question[];
  follows: Record<string, string[]>;
  seededAt: string;
  xpLog: { memberId: string; amount: number; reason: string; at: string }[];
}

const now = () => new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const demoPeople: [string, string, string, string][] = [
  ['demo-ahmed', 'أحمد من المعادي', 'ahmed_maadi', 'بحب أقارن قبل ما أشتري — خصوصًا الموبايلات'],
  ['demo-sara', 'سارة م.', 'sara_m', 'أم لطفلين وصيادة عروض أجهزة منزلية 🏠'],
  ['demo-omar', 'عمر التِك', 'omar_tech', 'مهندس برمجيات وبحب السماعات'],
  ['demo-nada', 'ندى', 'nada_deals', 'مش بشتري حاجة غير لما تنزل لأقل سعر'],
  ['demo-mahmoud', 'محمود الإسكندراني', 'mahmoud_alex', 'من إسكندرية — التكييفات تخصصي ❄️'],
  ['demo-heba', 'هبة', 'heba_h', 'بجمع كوبونات وعروض البنوك'],
  ['demo-youssef', 'يوسف', 'yousef_gamer', 'جيمر وبدوّر على أحسن شاشة'],
  ['demo-mariam', 'مريم', 'mariam_w', 'بحب الساعات الذكية والرياضة 🏃‍♀️'],
];

export const defaultGroups: Group[] = [
  { id: 'general', name: 'العام', nameEn: 'General', desc: 'كل حاجة عن التوفير والصفقات', emoji: '💬', color: '#c9840a', members: [], host: 'sherif' },
  { id: 'phones', name: 'الموبايلات', nameEn: 'Phones', desc: 'مقارنات وعروض الموبايلات', emoji: '📱', color: '#1f6fb2', members: [], host: 'fahd' },
  { id: 'home', name: 'الأجهزة المنزلية', nameEn: 'Home appliances', desc: 'تكييفات وغسالات ومايكرويف', emoji: '🏠', color: '#3d5a80', members: [], host: 'nemr' },
  { id: 'audio', name: 'سماعات وساعات', nameEn: 'Audio & wearables', desc: 'كل ما يخص الصوت والساعات الذكية', emoji: '🎧', color: '#6d4ad8', members: [], host: 'ghazala' },
  { id: 'tvs', name: 'الشاشات', nameEn: 'TVs', desc: 'شاشات سمارت و4K', emoji: '📺', color: '#0e6b52', members: [], host: 'hala' },
  { id: 'savings', name: 'تحديات التوفير', nameEn: 'Savings challenges', desc: 'تحديات أسبوعية وجوايز XP', emoji: '🏆', color: '#be123c', members: [], host: 'yasmine' },
  { id: 'help', name: 'أسئلة ومساعدة', nameEn: 'Q&A and help', desc: 'اسأل والمجتمع والوكلاء يردوا', emoji: '🛟', color: '#1d4ed8', members: [], host: 'hoda' },
];
export const defaultRooms: Room[] = [
  { id: 'lobby', name: 'الصالة العامة', nameEn: 'Lobby', topic: 'دردشة عامة عن الأسعار والعروض', emoji: '☕', host: 'sherif' },
  { id: 'phones', name: 'غرفة الموبايلات', nameEn: 'Phones room', topic: 'اسأل عن أي موبايل', emoji: '📱', host: 'hala' },
  { id: 'home', name: 'غرفة البيت', nameEn: 'Home room', topic: 'تكييفات وغسالات وأجهزة', emoji: '🏠', host: 'abuali' },
  { id: 'night', name: 'سهرانين', nameEn: 'Night owls', topic: 'للي صاحي بالليل', emoji: '🌙', host: 'layla' },
  { id: 'support', name: 'الدعم الفني', nameEn: 'Support', topic: 'مشكلة في الموقع؟ إحنا هنا', emoji: '🛟', host: 'hoda' },
];

export function seedState(products: { id: string; titleAr: string; category?: { slug: string } | null; lowestPriceEgp: number | null }[]): CommunityState {
  const members: Record<string, Member> = {};
  for (const [id, name, handle, bio] of demoPeople) members[id] = { id, name, handle, bio, joinedAt: ago(60 * 24 * (3 + (hash32(id) % 20))), demo: true, xp: 40 + (hash32(id) % 900), badges: [] };
  for (const a of agents) members[`agent:${a.id}`] = { id: `agent:${a.id}`, name: a.name, handle: a.id, bio: a.persona, joinedAt: '2026-11-18T00:00:00.000Z', agent: a.id, xp: 0, badges: [] };
  const groups = defaultGroups.map((g) => ({ ...g, members: [...demoPeople.filter((_, i) => (hash32(g.id) + i) % 3 !== 0).map((d) => d[0])] }));
  const p = (i: number) => products[i % Math.max(1, products.length)];
  const posts: Post[] = [];
  const add = (authorId: string, groupId: string, text: string, mins: number, extra: Partial<Post> = {}) =>
    posts.push({ id: `seed-${posts.length}`, authorId, groupId, text, attachments: [], at: ago(mins), reactions: {}, comments: [], kind: 'post', ...extra });
  add('agent:mona', 'general', 'أهلًا بيكم في مجتمع صفقة 🌸 هنا بنتكلم عن الأسعار الحقيقية بس. قبل ما تكتب، اقرا القوانين ووافق عليها — الوكلاء القانونيين بيطبقوها تلقائي ⚖️', 60 * 30, { pinned: true, kind: 'welcome' });
  add('demo-ahmed', 'phones', `حد جرّب ${p(0)?.titleAr ?? 'آيفون 17'}؟ السعر عندنا دلوقتي مستاهل ولا أستنى وايت فرايدي؟ (منشور تجريبي)`, 60 * 9, { productId: p(0)?.id });
  add('demo-sara', 'home', 'نصيحة: قبل ما تشتري تكييف، استخدموا حاسبة استهلاك الكهرباء في الأدوات — فرق الإنفرتر بيبان في الفاتورة 💡 (منشور تجريبي)', 60 * 7);
  add('demo-omar', 'audio', `${p(1)?.titleAr ?? 'سماعة'} — العزل كويس جدًا للسعر ده. (منشور تجريبي)`, 60 * 5, { productId: p(1)?.id });
  add('agent:yasmine', 'savings', '🏆 تحدي الأسبوع: قارن منتج في 3 متاجر قبل ما تشتري، واكتب هنا وفرت كام. أكتر واحد وفّر ياخد شارة «ملك التوفير» و+100 XP! (التحدي حقيقي، والـ XP على جهازك)', 60 * 4, { kind: 'challenge', pinned: true });
  add('demo-nada', 'general', 'الموقع هنا بيقولك لو الخصم مضروب — دي أهم ميزة بالنسبالي 👏 (منشور تجريبي)', 60 * 3);
  add('demo-youssef', 'tvs', 'محتاج شاشة 55 للبلايستيشن تحت 25 ألف، اقتراحاتكم؟ (منشور تجريبي)', 60 * 2);
  posts[1]?.comments.push({ id: 'seed-c1', authorId: 'agent:fahd', text: 'بص في سجل الأسعار تحت الصورة — لو السعر عند أقل نقطة سجلناها يبقى مستاهل. ولو عايز تستنى، اعمل تنبيه بسعر مستهدف 🐆', attachments: [], at: ago(60 * 8), reactions: {} });
  posts[6]?.comments.push({ id: 'seed-c2', authorId: 'agent:hala', text: 'جرّب فلتر قسم الشاشات وحدد أقصى سعر 25000 — هتلاقي الخيارات الحقيقية اللي بنتابعها 📺', attachments: [], at: ago(60), reactions: {} });
  for (const post of posts) for (const [i, d] of demoPeople.entries()) if ((hash32(post.id) >> i) % 3 === 0) (post.reactions[['👍', '🔥', '❤️', '😂'][i % 4] as string] ??= []).push(d[0]);
  const messages: Record<string, Message[]> = {};
  for (const r of defaultRooms) messages[r.id] = [{ id: `seed-${r.id}`, authorId: `agent:${r.host}`, text: welcomeLine(r), attachments: [], at: ago(30), reactions: {}, system: false }];
  messages.lobby?.push({ id: 'seed-l2', authorId: 'demo-heba', text: 'صباح الخير يا جماعة ☀️ (رسالة تجريبية)', attachments: [], at: ago(20), reactions: {} });
  return { v: 1, members, posts, groups, rooms: defaultRooms, messages, reviews: [], questions: [], follows: {}, seededAt: now(), xpLog: [] };
}

function welcomeLine(r: Room) {
  const a = agents.find((x) => x.id === r.host);
  return `${a?.emoji[0] ?? '👋'} أهلًا في «${r.name}»! أنا ${a?.name ?? 'المضيف'} (وكيل ذكي 🤖). ${r.topic}. اسألني عن أرخص سعر، أحسن عرض، أو أي منتج — بجاوب من أسعار صفقة الحقيقية.`;
}

export function readCommunity(): CommunityState | null {
  return readLocal<CommunityState | null>(COMMUNITY_KEY, null);
}
export function writeCommunity(s: CommunityState) {
  writeLocal(COMMUNITY_KEY, s);
}

export function useCommunity() {
  const [state] = useLocal<CommunityState | null>(COMMUNITY_KEY, null);
  const update = useCallback((fn: (s: CommunityState) => void) => {
    const cur = readCommunity();
    if (!cur) return;
    fn(cur);
    writeCommunity(cur);
  }, []);
  return { state, update };
}

export function ensureSeeded(products: Parameters<typeof seedState>[0]) {
  const cur = readCommunity();
  if (!cur && products.length) writeCommunity(seedState(products));
}

/** XP and ranks. */
export const XP = { post: 10, comment: 4, reactionReceived: 2, review: 15, reviewMedia: 10, question: 3, answer: 8, rules: 20, chat: 1, dailyVisit: 5, warning: -5, mute: -15, ban: -40 };
export const ranks = [
  { min: 0, ar: 'عضو جديد', en: 'Newcomer', emoji: '🌱', color: '#94a3b8' },
  { min: 50, ar: 'متسوّق ذكي', en: 'Smart shopper', emoji: '🛒', color: '#22c55e' },
  { min: 150, ar: 'صياد عروض', en: 'Deal hunter', emoji: '🎯', color: '#0ea5e9' },
  { min: 350, ar: 'خبير توفير', en: 'Savings expert', emoji: '💰', color: '#a855f7' },
  { min: 700, ar: 'محترف صفقة', en: 'Safqa pro', emoji: '💎', color: '#f59e0b' },
  { min: 1200, ar: 'أسطورة صفقة', en: 'Safqa legend', emoji: '👑', color: '#ef4444' },
];
export function rankOf(xp: number) {
  const idx = ranks.reduce((acc, r, i) => (xp >= r.min ? i : acc), 0);
  const r = ranks[Math.max(0, idx)] as (typeof ranks)[number];
  const next = ranks[idx + 1];
  return { ...r, level: Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1, next, progress: next ? (xp - r.min) / (next.min - r.min) : 1 };
}
export const communityBadges = [
  { id: 'first-post', emoji: '✍️', ar: 'أول منشور', en: 'First post' },
  { id: 'reviewer', emoji: '⭐', ar: 'مقيّم', en: 'Reviewer' },
  { id: 'photographer', emoji: '📸', ar: 'مصوّر', en: 'Photographer' },
  { id: 'helper', emoji: '🤝', ar: 'مساعد', en: 'Helper' },
  { id: 'chatter', emoji: '💬', ar: 'رغّاي', en: 'Chatter' },
  { id: 'law-abiding', emoji: '⚖️', ar: 'ملتزم بالقوانين', en: 'Law-abiding' },
  { id: 'popular', emoji: '🔥', ar: 'محبوب', en: 'Popular' },
];

export function grantXp(s: CommunityState, memberId: string, amount: number, reason: string) {
  const m = s.members[memberId];
  if (!m) return;
  m.xp = Math.max(0, m.xp + amount);
  s.xpLog = [{ memberId, amount, reason, at: now() }, ...s.xpLog].slice(0, 300);
}
export function grantBadge(s: CommunityState, memberId: string, badge: string) {
  const m = s.members[memberId];
  if (m && !m.badges.includes(badge)) m.badges.push(badge);
}

/** The signed-in user's community identity (created on first use). */
export function memberIdFor(user: { email: string } | null) {
  return user ? `u:${user.email.toLowerCase()}` : null;
}
export function ensureMember(s: CommunityState, user: { email: string; name?: string | null }) {
  const id = memberIdFor(user) as string;
  if (!s.members[id]) {
    const base = (user.name || user.email.split('@')[0] || 'member').trim();
    s.members[id] = { id, name: base, handle: base.toLowerCase().replace(/[^a-z0-9_]+/gi, '_').slice(0, 20) || `member${hash32(id) % 1000}`, joinedAt: now(), xp: 0, badges: [] };
  }
  return s.members[id] as Member;
}

export function toggleReaction(r: Reactions, emoji: string, memberId: string) {
  const list = (r[emoji] ??= []);
  const i = list.indexOf(memberId);
  if (i >= 0) list.splice(i, 1);
  else list.push(memberId);
}
export const reactionSet = ['👍', '❤️', '🔥', '😂', '😮', '💰'];
export const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join('|')}`;
