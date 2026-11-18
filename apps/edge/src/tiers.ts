// The 4 Safqa memberships — same ids, names and limits as apps/web/src/lib/tiers.ts
// (the UI). Prices are EGP / month and are the single source of truth for
// payments; the web, app and admin read them from GET /api/v2/tiers.
export type TierId = 'free' | 'silver' | 'gold' | 'diamond';
export interface Tier { id: TierId; ar: string; en: string; emoji: string; price: number; color: string; rank: number; perks: string[]; support: string; limits: { watchlist: number; alerts: number; collections: number; agentQuestionsPerDay: number } }

export const TIERS: Tier[] = [
  { id: 'free', ar: 'مجاني', en: 'Free', emoji: '🌱', price: 0, color: '#1FA67A', rank: 0, support: 'المجتمع', limits: { watchlist: 10, alerts: 5, collections: 3, agentQuestionsPerDay: 20 }, perks: ['مقارنة الأسعار في كل المتاجر', '10 منتجات في المراقبة', 'كاشف الخصومات الوهمية', 'المجتمع والدردشة والوكلاء الأذكياء'] },
  { id: 'silver', ar: 'فضّي', en: 'Silver', emoji: '🥈', price: 49, color: '#B8C4D3', rank: 1, support: 'خلال 48 ساعة', limits: { watchlist: 30, alerts: 20, collections: 10, agentQuestionsPerDay: 50 }, perks: ['30 منتج في المراقبة', 'تنبيهات تيليجرام خاصة', 'تاريخ السعر كامل', 'إطار فضي 🥈 في المجتمع', '50 سؤال يوميًا للوكلاء'] },
  { id: 'gold', ar: 'ذهبي', en: 'Gold', emoji: '👑', price: 99, color: '#F5B524', rank: 2, support: 'خلال 24 ساعة', limits: { watchlist: 100, alerts: 75, collections: 30, agentQuestionsPerDay: 200 }, perks: ['100 منتج في المراقبة', 'وصول مبكر لعروض الرادار بساعة', 'إطار ذهبي متحرك 👑', '200 سؤال يوميًا للوكلاء', 'دعم بأولوية'] },
  { id: 'diamond', ar: 'ماسي', en: 'Diamond', emoji: '💎', price: 199, color: '#7C9CFF', rank: 3, support: 'نفس اليوم', limits: { watchlist: 500, alerts: 300, collections: 100, agentQuestionsPerDay: 500 }, perks: ['كل حاجة بلا حدود (500 منتج)', 'عروض الرادار قبلها بـ 3 ساعات', 'إطار ماسي لامع 💎', '500 سؤال يوميًا للوكلاء', 'أولوية أولى في الدعم'] },
];
export const tierById = (id: string) => TIERS.find((t) => t.id === id);
