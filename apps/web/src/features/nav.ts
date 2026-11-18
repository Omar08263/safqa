import {
  Award, BarChart3, Bell, Bot, CalendarDays, Calculator, Gift, GitCompare, HeartHandshake, HelpCircle, Home, LayoutDashboard,
  LayoutGrid, Layers, Crown, Send, MessagesSquare, Users, Radar, Wrench, Smartphone, ShieldCheck, Cpu, PiggyBank, Search, Settings, Sparkles, Store, UserCircle, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  key?: string; // g + key shortcut
}

/** Desktop header (lg+) and tablet rail. */
export const primaryNav: NavItem[] = [
  { to: '/', ar: 'الرئيسية', en: 'Home', icon: Home, key: 'h' },
  { to: '/search', ar: 'بحث', en: 'Search', icon: Search, key: 's' },
  { to: '/radar', ar: 'العروض', en: 'Deals', icon: Radar, key: 'y' },
  { to: '/compare', ar: 'مقارنة', en: 'Compare', icon: GitCompare, key: 'c' },
  { to: '/toolbox', ar: 'أدوات', en: 'Tools', icon: Wrench, key: 't' },
  { to: '/live', ar: 'المجتمع', en: 'Community', icon: Users, key: 'u' },
  { to: '/plans', ar: 'الباقات', en: 'Plans', icon: Crown, key: 'v' },
];

/** Phone bottom bar: exactly 4 links + «المزيد» (opens the full menu sheet). */
export const bottomNav: NavItem[] = [
  { to: '/', ar: 'الرئيسية', en: 'Home', icon: Home },
  { to: '/search', ar: 'بحث', en: 'Search', icon: Search },
  { to: '/radar', ar: 'العروض', en: 'Deals', icon: Radar },
  { to: '/live', ar: 'المجتمع', en: 'Community', icon: Users },
];

export const allNav: NavItem[] = [
  ...primaryNav,
  { to: '/features', ar: 'كل المميزات', en: 'All features', icon: Sparkles, key: 'f' },
  { to: '/channels', ar: 'واتساب وتيليجرام', en: 'WhatsApp & Telegram', icon: Send },
  { to: '/agents', ar: 'مقر الوكلاء', en: 'Agents HQ', icon: Cpu, key: 'j' },
  { to: '/rules', ar: 'القواعد والإشراف', en: 'Rules & moderation', icon: ShieldCheck },
  { to: '/app', ar: 'نزّل التطبيق', en: 'Get the app', icon: Smartphone, key: 'n' },
  { to: '/tools', ar: 'الأدوات الكلاسيكية', en: 'Classic tools', icon: Calculator },
  { to: '/dashboard', ar: 'لوحة التحكم', en: 'Dashboard', icon: LayoutDashboard, key: 'd' },
  { to: '/watchlist', ar: 'المراقبة', en: 'Watchlist', icon: Eye, key: 'w' },
  { to: '/alerts', ar: 'التنبيهات', en: 'Alerts', icon: Bell, key: 'a' },
  { to: '/collections', ar: 'المجموعات', en: 'Collections', icon: Layers, key: 'l' },
  { to: '/savings', ar: 'التوفير والميزانية', en: 'Savings & budget', icon: PiggyBank, key: 'b' },
  { to: '/calendar', ar: 'تقويم المواسم', en: 'Sale calendar', icon: CalendarDays, key: 'e' },
  { to: '/categories', ar: 'الأقسام', en: 'Categories', icon: LayoutGrid, key: 'g' },
  { to: '/stores', ar: 'المتاجر', en: 'Stores', icon: Store, key: 'm' },
  { to: '/insights', ar: 'تحليلات السوق', en: 'Market insights', icon: BarChart3, key: 'i' },
  { to: '/assistant', ar: 'المساعد الذكي', en: 'AI assistant', icon: Bot, key: 'x' },
  { to: '/achievements', ar: 'الإنجازات', en: 'Achievements', icon: Award, key: 'r' },
  { to: '/referral', ar: 'ادعُ صاحبك', en: 'Invite a friend', icon: Gift },
  { to: '/profile', ar: 'الملف الشخصي', en: 'Profile', icon: UserCircle, key: 'p' },
  { to: '/settings', ar: 'الإعدادات وسهولة الاستخدام', en: 'Settings & accessibility', icon: Settings, key: 'o' },
  { to: '/help', ar: 'مركز المساعدة', en: 'Help center', icon: HelpCircle, key: 'q' },
  { to: '/about', ar: 'عن صفقة', en: 'About Safqa', icon: HeartHandshake },
];
