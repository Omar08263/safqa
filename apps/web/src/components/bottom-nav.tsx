import { sectionFor } from '../brand/tokens';
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutGrid } from 'lucide-react';
import { useEffect } from 'react';
import { bottomNav, primaryNav } from '../features/nav';
import { useDevice, useScrollingDown } from '../lib/device';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { feedback } from '../lib/sound';
import { useTr } from '../lib/tr';

export type BottomBarMode = 'auto' | 'always' | 'hidden';
export const BOTTOM_BAR_KEY = 'safqa.bottomBar.v1';
export const useBottomBarMode = () => useLocal<BottomBarMode>(BOTTOM_BAR_KEY, 'auto');

/**
 * Phone bottom bar: 4 links + «المزيد». Tucks away while scrolling down,
 * comes back on scroll up, can be hidden from Settings. Publishes its height
 * as --bottom-bar on <html> so toasts, the compare tray and «لفوق» sit above it.
 */
export function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const device = useDevice();
  const [mode] = useBottomBarMode();
  const down = useScrollingDown();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const shown = device === 'phone' && mode !== 'hidden' && (mode === 'always' || !down || moreOpen);

  useEffect(() => {
    document.documentElement.style.setProperty('--bottom-bar', shown ? 'calc(64px + env(safe-area-inset-bottom))' : '0px');
  }, [shown]);

  if (device !== 'phone' || mode === 'hidden') return null;
  const label = (n: { ar: string; en: string }) => (locale === 'ar' ? n.ar : n.en);
  return (
    <nav
      className={`bottom-bar no-print fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background transition-transform duration-300 ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={tr('تنقل سريع', 'Quick navigation')}
      aria-hidden={!shown}
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {bottomNav.map((n) => {
          const active = n.to === '/' ? path === '/' : path.startsWith(n.to);
          return (
            <li key={n.to}>
              <Link
                to={n.to as '/'}
                data-section={sectionFor(n.to)}
                onClick={() => feedback('tap')}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] leading-none ${active ? 'font-semibold text-primary' : 'text-muted'}`}
                aria-current={active ? 'page' : undefined}
                tabIndex={shown ? 0 : -1}
              >
                {active ? <span className="absolute top-1.5 h-1 w-6 rounded-full bg-primary" aria-hidden="true" /> : null}
                <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                <span className="whitespace-nowrap">{label(n)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => { feedback('tap'); onMore(); }}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] leading-none ${moreOpen ? 'font-semibold text-primary' : 'text-muted'}`}
            aria-expanded={moreOpen}
            tabIndex={shown ? 0 : -1}
          >
            <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={1.8} />
            <span>{tr('المزيد', 'More')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Tablet navigation rail on the start edge (right in Arabic). */
export function NavRail() {
  const { locale } = usePrefs();
  const tr = useTr();
  const device = useDevice();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (device !== 'tablet') return null;
  return (
    <nav className="nav-rail no-print fixed bottom-0 start-0 top-[65px] z-20 flex w-[84px] flex-col items-center gap-1 overflow-y-auto border-e border-border/70 bg-background/80 py-3 backdrop-blur-xl" aria-label={tr('القائمة الرئيسية', 'Main navigation')}>
      {primaryNav.map((n) => {
        const active = n.to === '/' ? path === '/' : path.startsWith(n.to);
        return (
          <Link key={n.to} to={n.to as '/'} data-section={sectionFor(n.to)} onClick={() => feedback('tap')} className={`flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] leading-tight transition ${active ? 'bg-primary/15 font-semibold text-primary' : 'text-muted hover:bg-accent hover:text-foreground'}`} aria-current={active ? 'page' : undefined}>
            <n.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.8} />
            <span className="text-center">{locale === 'ar' ? n.ar : n.en}</span>
          </Link>
        );
      })}
    </nav>
  );
}
