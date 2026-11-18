import {
  Award, BarChart3, Bell, Bot, CalendarDays, Calculator, Gift, GitCompare, HeartHandshake, HelpCircle, Home, LayoutDashboard,
  LayoutGrid, Layers, PiggyBank, Search, Settings, Sparkles, Store, UserCircle, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  key?: string; // g + key shortcut
}

export const primaryNav: NavItem[] = [
  { to: '/', ar: 'الرئيسية', en: 'Home', icon: Home, key: 'h' },
  { to: '/search', ar: 'بحث', en: 'Search', icon: Search, key: 's' },
  { to: '/compare', ar: 'مقارنة', en: 'Compare', icon: GitCompare, key: 'c' },
  { to: '/tools', ar: 'أدوات', en: 'Tools', icon: Calculator, key: 't' },
  { to: '/features', ar: 'المميزات', en: 'Features', icon: Sparkles, key: 'f' },
];

export const allNav: NavItem[] = [
  ...primaryNav,
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
