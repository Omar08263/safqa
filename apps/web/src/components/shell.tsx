import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { PriceFreshness } from './price-freshness';
import { Bell, Command, Menu, MoonStar, Sun, X } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { allNav, primaryNav } from '../features/nav';
import { features } from '../features/registry';
import { BackToTop, Logo, ScrollProgress } from '../fx/fx';
import { track } from '../lib/activity';
import { AppearanceEffect } from '../lib/appearance';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { useQuery } from '@tanstack/react-query';
import { CompareTray, InstallButton, OfflineBanner, OnboardingTour } from './chrome';
import { CommandPalette, ShortcutsDialog } from './palette';
import { Button } from './ui/button';

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const [profile] = useLocal<{ avatar?: string }>('safqa.profile.v1', {});
  const picture = profile.avatar || window.localStorage.getItem('safqa.googlePicture');
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return picture ? (
    <img src={picture} alt="" width={size} height={size} className="rounded-full object-cover ring-2 ring-primary/40" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="grid place-items-center rounded-full bg-gradient-to-br from-[var(--saffron)] to-[var(--palm)] text-xs font-bold text-white" style={{ width: size, height: size }}>{initials || '؟'}</span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const tr = useTr();
  const { locale, setLocale, theme, toggleTheme } = usePrefs();
  const { user, logout, client } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => client.alerts(), enabled: Boolean(user) });
  const unread = (alerts.data?.items ?? []).filter((a) => !a.read).length;

  useEffect(() => track.visit(), []);
  useEffect(() => {
    setMenu(false);
    setUserMenu(false);
    window.scrollTo({ top: 0 });
  }, [path]);

  // Global keyboard shortcuts.
  useEffect(() => {
    let g = false;
    let gTimer = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((o) => !o);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (g) {
        g = false;
        const hit = allNav.find((n) => n.key === e.key.toLowerCase());
        if (hit) {
          e.preventDefault();
          void navigate({ to: hit.to as '/' });
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '?') setShortcuts(true);
      else if (e.key === 'T') toggleTheme();
      else if (e.key === 'L') setLocale(locale === 'ar' ? 'en' : 'ar');
      else if (e.key === 'g') {
        g = true;
        window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => (g = false), 1200);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locale, navigate, setLocale, toggleTheme]);

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') ?? '');
    track.search(q);
    void navigate({ to: '/search', search: { q } });
  }

  const label = (n: { ar: string; en: string }) => (locale === 'ar' ? n.ar : n.en);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <AppearanceEffect />
      <ScrollProgress />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">{tr('تخطّى للمحتوى', 'Skip to content')}</a>
      <OfflineBanner />
      <header className="no-print sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex-none" data-tour="logo" aria-label="Safqa">
            <Logo size={38} sub={tr('ذكاء الأسعار في مصر', 'Price intelligence for Egypt')} />
          </Link>
          <form onSubmit={onSearch} className="hidden flex-1 md:block" data-tour="search">
            <div className="relative mx-auto max-w-md">
              <input ref={searchRef} name="q" placeholder={tr('ابحث عن منتج… (اضغط /)', 'Search products… (press /)')} className="h-10 w-full rounded-full border border-border bg-card/80 px-4 pe-16 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15" />
              <button type="button" onClick={() => setPalette(true)} className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted" aria-label={tr('لوحة الأوامر', 'Command palette')}>
                <Command className="h-3 w-3" />K
              </button>
            </div>
          </form>
          <nav className="hidden items-center gap-0.5 text-sm lg:flex" data-tour="nav" aria-label={tr('القائمة الرئيسية', 'Main')}>
            {primaryNav.slice(1).map((n) => (
              <Link key={n.to} to={n.to as '/'} className={`relative rounded-full px-3 py-1.5 transition ${path === n.to ? 'bg-accent font-semibold' : 'text-muted hover:text-foreground'}`}>
                {label(n)}
                {n.to === '/features' ? <span className="ms-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{features.length}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1" data-tour="prefs">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent md:hidden" onClick={() => setPalette(true)} aria-label={tr('بحث وأوامر', 'Search & commands')}><Command className="h-4 w-4" /></button>
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} aria-label="language">{locale === 'ar' ? 'EN' : 'ع'}</Button>
            <button type="button" onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label={theme === 'dark' ? tr('الوضع النهاري', 'Light mode') : tr('الوضع الليلي', 'Dark mode')}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </button>
            {user ? (
              <Link to="/alerts" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label={tr('التنبيهات', 'Alerts')}>
                <Bell className="h-4 w-4" />
                {unread > 0 ? <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread}</span> : null}
              </Link>
            ) : null}
            <div className="relative" data-tour="account">
              {user ? (
                <button type="button" onClick={() => setUserMenu(!userMenu)} className="flex items-center gap-2 rounded-full p-0.5 hover:bg-accent" aria-haspopup="menu" aria-expanded={userMenu}>
                  <Avatar name={user.name} />
                </button>
              ) : (
                <Link to="/login"><Button size="sm" className="shine">{tr('دخول', 'Sign in')}</Button></Link>
              )}
              {userMenu && user ? (
                <div className="glass page-enter absolute end-0 top-11 z-40 w-56 rounded-2xl bg-card p-2 text-sm shadow-2xl" role="menu">
                  <p className="px-3 py-2 font-semibold">{user.name}<span className="block truncate text-xs font-normal text-muted">{user.email}</span></p>
                  {['/dashboard', '/profile', '/watchlist', '/collections', '/achievements', '/settings'].map((to) => {
                    const n = allNav.find((x) => x.to === to);
                    return n ? (
                      <Link key={to} to={to as '/'} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-accent" role="menuitem"><n.icon className="h-4 w-4 text-primary" />{label(n)}</Link>
                    ) : null;
                  })}
                  <button type="button" className="w-full rounded-xl px-3 py-2 text-start text-destructive hover:bg-accent" onClick={() => void logout()}>{tr('تسجيل الخروج', 'Sign out')}</button>
                </div>
              ) : null}
            </div>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent lg:hidden" onClick={() => setMenu(!menu)} aria-label={tr('القائمة', 'Menu')} aria-expanded={menu}>
              {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menu ? (
          <nav className="page-enter mx-auto grid max-w-7xl grid-cols-2 gap-1 border-t border-border px-4 py-3 sm:grid-cols-3 lg:hidden">
            {allNav.map((n) => (
              <Link key={n.to} to={n.to as '/'} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${path === n.to ? 'bg-accent font-semibold' : ''}`}><n.icon className="h-4 w-4 text-primary" />{label(n)}</Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-8">
        <div key={path} className="page-enter">{children}</div>
      </main>

      <footer className="no-print mt-16 border-t border-border/70 bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo size={44} />
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{tr('صفقة بتتابع أسعار المتاجر المصرية، بتكشف الخصومات المضخّمة، وبتقولك إمتى تشتري.', 'Safqa tracks Egyptian store prices, exposes inflated discounts, and tells you when to buy.')}</p>
            <div className="mt-4 flex flex-wrap gap-2"><InstallButton /><Button variant="outline" size="sm" onClick={() => setShortcuts(true)}>{tr('اختصارات الكيبورد', 'Keyboard shortcuts')} <kbd className="text-[10px]">?</kbd></Button></div>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {allNav.map((n) => (
              <li key={n.to}><Link to={n.to as '/'} className="text-muted hover:text-foreground">{label(n)}</Link></li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center pb-3"><PriceFreshness compact /></div>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pb-3 text-xs text-muted">
          <a href="/privacy.html" className="hover:text-foreground">{tr('سياسة الخصوصية', 'Privacy Policy')}</a>
          <Link to="/privacy" className="hover:text-foreground">{tr('الخصوصية داخل الموقع', 'In-app privacy')}</Link>
          <a href="/terms.html" className="hover:text-foreground">{tr('الشروط والأحكام', 'Terms of Service')}</a>
          <Link to="/terms" className="hover:text-foreground">{tr('قواعد المجتمع', 'Community rules')}</Link>
          <a href="mailto:rxcc@agentmail.to" className="hover:text-foreground">rxcc@agentmail.to</a>
        </p>
        <p className="pb-6 text-center text-xs text-muted">© 2026 Safqa · {tr('صُنع في مصر', 'Made in Egypt')} 🇪🇬</p>
      </footer>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label={tr('تنقل سريع', 'Quick nav')}>
        {primaryNav.map((n) => (
          <Link key={n.to} to={n.to as '/'} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${path === n.to ? 'font-semibold text-primary' : 'text-muted'}`}>
            <n.icon className="h-5 w-5" />
            {label(n)}
          </Link>
        ))}
      </nav>

      <CompareTray />
      <BackToTop label={tr('لفوق', 'Back to top')} />
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <OnboardingTour />
    </div>
  );
}
