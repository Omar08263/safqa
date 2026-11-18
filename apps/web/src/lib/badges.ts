import type { Activity, Collection, Purchase } from './activity';
import { streak } from './activity';

export interface BadgeDef {
  id: string;
  emoji: string;
  ar: string;
  en: string;
  dar: string;
  den: string;
  test: (c: BadgeCtx) => boolean;
  progress: (c: BadgeCtx) => [number, number];
}
export interface BadgeCtx {
  a: Activity;
  purchases: Purchase[];
  collections: Collection[];
  watchCount: number;
  signedIn: boolean;
}
const saved = (c: BadgeCtx) => c.purchases.reduce((s, p) => s + Math.max(0, p.referenceEgp - p.paidEgp), 0);
const mk = (id: string, emoji: string, ar: string, en: string, dar: string, den: string, value: (c: BadgeCtx) => number, goal: number): BadgeDef => ({
  id, emoji, ar, en, dar, den,
  test: (c) => value(c) >= goal,
  progress: (c) => [Math.min(goal, value(c)), goal],
});
export const badges: BadgeDef[] = [
  mk('welcome', '👋', 'أهلًا بيك', 'Welcome', 'سجّل دخول أو اعمل حساب', 'Sign in or create an account', (c) => (c.signedIn ? 1 : 0), 1),
  mk('explorer', '🧭', 'مستكشف', 'Explorer', 'افتح 5 منتجات', 'Open 5 products', (c) => c.a.views.length, 5),
  mk('hunter', '🔎', 'صياد صفقات', 'Deal hunter', 'افتح 10 منتجات', 'Open 10 products', (c) => c.a.views.length, 10),
  mk('searcher', '🗂️', 'باحث محترف', 'Pro searcher', 'اعمل 5 عمليات بحث', 'Run 5 searches', (c) => c.a.searches.length, 5),
  mk('judge', '⚖️', 'القاضي', 'The judge', 'استخدم المقارنة', 'Use compare', (c) => c.a.compares, 1),
  mk('watcher', '👀', 'عين الصقر', 'Hawk eye', 'راقب 3 منتجات', 'Watch 3 products', (c) => c.watchCount, 3),
  mk('curator', '🎁', 'منظّم', 'Curator', 'اعمل مجموعة', 'Create a collection', (c) => c.collections.length, 1),
  mk('sharer', '📣', 'كريم', 'Generous', 'شارك لينك أو QR', 'Share a link or QR', (c) => c.a.shares, 1),
  mk('saver', '💰', 'موفّر', 'Saver', 'وفّر 1000 جنيه', 'Save EGP 1,000', saved, 1000),
  mk('mogul', '🏆', 'ملك التوفير', 'Savings mogul', 'وفّر 10000 جنيه', 'Save EGP 10,000', saved, 10000),
  mk('mathlete', '🧮', 'عبقري حسابات', 'Mathlete', 'جرّب 4 أدوات حسابية', 'Try 4 money tools', (c) => c.a.toolsUsed.length, 4),
  mk('streak3', '🔥', 'مولّع', 'On fire', 'ادخل 3 أيام ورا بعض', 'Visit 3 days in a row', (c) => streak(c.a.visitDays), 3),
  mk('streak7', '🌟', 'أسبوع كامل', 'Full week', 'ادخل 7 أيام ورا بعض', 'Visit 7 days in a row', (c) => streak(c.a.visitDays), 7),
  mk('chatty', '🤖', 'صاحب المساعد', 'AI buddy', 'اسأل المساعد 3 مرات', 'Ask the assistant 3 times', (c) => c.a.chats, 3),
];
