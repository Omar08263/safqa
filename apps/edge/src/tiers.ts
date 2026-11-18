// The 4 Safqa membership tiers. Single source of truth for prices (EGP / month);
// the web, app and admin read them from GET /api/v2/tiers.
export type TierId = 'free' | 'plus' | 'pro' | 'vip';
export interface Tier { id: TierId; ar: string; en: string; emoji: string; price: number; color: string; rank: number; perks: string[]; support: string }

export const TIERS: Tier[] = [
  { id: 'free', ar: 'صفقة مجاني', en: 'Safqa Free', emoji: '🌱', price: 0, color: '#64748b', rank: 0, support: 'المجتمع', perks: ['مقارنة الأسعار في كل المتاجر', '10 منتجات في المتابعة', 'تنبيه سعر يومي', 'المجتمع والدردشة'] },
  { id: 'plus', ar: 'صفقة بلس', en: 'Safqa Plus', emoji: '⚡', price: 49, color: '#0ea5e9', rank: 1, support: 'خلال 24 ساعة', perks: ['50 منتج في المتابعة', 'تنبيهات فورية', 'سجل أسعار 90 يوم', 'شارة بلس ⚡', '50 سؤال يوميًا للوكلاء الأذكياء'] },
  { id: 'pro', ar: 'صفقة برو', en: 'Safqa Pro', emoji: '💎', price: 99, color: '#a855f7', rank: 2, support: 'أولوية — خلال 6 ساعات', perks: ['متابعة بلا حدود', 'تنبيهات تيليجرام وإيميل', 'توقع السعر بالذكاء الاصطناعي', 'ملخصات ذكية بلا حدود', 'شارة برو 💎 ولون اسم مميز'] },
  { id: 'vip', ar: 'صفقة VIP', en: 'Safqa VIP', emoji: '👑', price: 199, color: '#f59e0b', rank: 3, support: 'أولوية قصوى — خلال ساعة', perks: ['كل مميزات برو', 'رادار العروض الحصرية قبل الكل', 'وكيل شخصي بيدوّرلك على العروض', 'إطار تاج 👑 وشات VIP', 'دعم مباشر بأولوية قصوى'] },
];
export const tierById = (id: string) => TIERS.find((t) => t.id === id);
