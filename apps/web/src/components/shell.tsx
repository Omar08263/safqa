import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { FormEvent, ReactNode } from 'react';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { Button } from './ui/button';

const links = [
  ['/', 'nav.deals'],
  ['/search', 'nav.search'],
  ['/assistant', 'nav.assistant'],
  ['/watchlist', 'nav.watchlist'],
  ['/alerts', 'nav.alerts'],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale, theme, toggleTheme } = usePrefs();
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') ?? '');
    void navigate({ to: '/search', search: { q } });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg text-primary-foreground">ص</span>
            <span>
              {t('app.name')}
              <span className="block text-[11px] font-normal text-muted">{t('app.tagline')}</span>
            </span>
          </Link>
          <form onSubmit={onSearch} className="order-last w-full md:order-none md:mx-4 md:w-auto md:flex-1">
            <input
              name="q"
              placeholder={t('search.placeholder')}
              className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary"
            />
          </form>
          <nav className="flex items-center gap-1 text-sm">
            {links.map(([to, key]) => (
              <Link
                key={to}
                to={to}
                className={`rounded-full px-3 py-1.5 ${path === to ? 'bg-accent font-semibold' : 'text-muted'}`}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
              {locale === 'ar' ? 'EN' : 'ع'}
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? t('theme.light') : t('theme.dark')}
            </Button>
            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void logout();
                }}
              >
                {user.name}
              </Button>
            ) : (
              <Link to="/login">
                <Button size="sm">{t('nav.login')}</Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
