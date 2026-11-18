import { localized } from '@safqa/shared';
import { Link, useRouterState } from '@tanstack/react-router';
import { Download, GitCompare, WifiOff, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useCatalog } from '../lib/catalog';
import { useCompare } from '../lib/compare';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { Button } from './ui/button';

export function CompareTray() {
  const tr = useTr();
  const { locale } = usePrefs();
  const { ids, remove, clear } = useCompare();
  const catalog = useCatalog();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (ids.length === 0 || path === '/compare') return null;
  const items = ids.map((id) => catalog.data?.items.find((p) => p.id === id)).filter(Boolean);
  return (
    <div className="compare-tray no-print fixed inset-x-3 z-40 mx-auto max-w-2xl">
      <div className="glass page-enter flex flex-wrap items-center gap-2 rounded-2xl p-3 shadow-2xl">
        <GitCompare className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">{tr('المقارنة', 'Compare')} ({ids.length}/4)</span>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {items.map((p) =>
            p ? (
              <span key={p.id} className="flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs">
                <span className="max-w-32 truncate">{localized(locale, { ar: p.titleAr, en: p.titleEn })}</span>
                <button type="button" aria-label={tr('شيل', 'Remove')} onClick={() => remove(p.id)}><X className="h-3 w-3" /></button>
              </span>
            ) : null,
          )}
        </div>
        <button type="button" className="text-xs text-muted" onClick={clear}>{tr('مسح', 'Clear')}</button>
        <Link to="/compare"><Button size="sm">{tr('قارن دلوقتي', 'Compare now')}</Button></Link>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const tr = useTr();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-clay px-4 py-2 text-center text-sm text-white" style={{ background: 'var(--clay)' }} role="status">
      <WifiOff className="h-4 w-4" /> {tr('انت أوفلاين — بتشوف آخر نسخة محفوظة على جهازك.', 'You are offline — showing the copy saved on this device.')}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    for (const l of listeners) l();
  });
}
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const installed = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  return {
    available: Boolean(deferred),
    installed,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      force((n) => n + 1);
      return choice.outcome === 'accepted';
    },
  };
}
export function InstallButton() {
  const tr = useTr();
  const { available, install } = useInstall();
  if (!available) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => void install()}>
      <Download className="h-4 w-4" /> {tr('ثبّت التطبيق', 'Install app')}
    </Button>
  );
}

// Onboarding tour: highlights elements tagged data-tour="<id>".
const steps = [
  { id: 'logo', ar: 'أهلًا بيك في صفقة! هنا هتعرف السعر العادل لأي منتج في المتاجر المصرية.', en: 'Welcome to Safqa! Find the fair price of any product across Egyptian stores.' },
  { id: 'search', ar: 'ابحث عن أي منتج، أو دوس Ctrl+K عشان لوحة الأوامر.', en: 'Search any product, or press Ctrl+K for the command palette.' },
  { id: 'nav', ar: 'من هنا توصل للمقارنة والأدوات وصفحة المميزات كلها.', en: 'Reach compare, tools and the full features page from here.' },
  { id: 'prefs', ar: 'غيّر اللغة والوضع الليلي، ومن الإعدادات تقدر تكبّر الخط وتغيّر الألوان.', en: 'Switch language and dark mode; settings let you enlarge text and pick colours.' },
  { id: 'account', ar: 'سجّل دخول عشان المراقبة والتنبيهات ولوحة التوفير.', en: 'Sign in for watchlists, alerts and your savings dashboard.' },
];
export function OnboardingTour() {
  const tr = useTr();
  const { locale } = usePrefs();
  const [done, setDone] = useLocal<boolean>('safqa.tourDone.v1', false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  useLayoutEffect(() => {
    if (done || !step) return;
    const measure = () => {
      const el = [...document.querySelectorAll(`[data-tour="${step.id}"]`)].find((n) => (n as HTMLElement).offsetParent !== null);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [done, step]);
  if (done || !step) return null;
  const top = rect ? Math.min(window.innerHeight - 190, rect.bottom + 14) : window.innerHeight / 3;
  return (
    <div className="no-print fixed inset-0 z-[90]" role="dialog" aria-label={tr('جولة تعريفية', 'Guided tour')}>
      {rect ? <div className="tour-ring pointer-events-none fixed" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="fixed inset-0 bg-black/45" />}
      <div className="glass page-enter fixed inset-x-4 mx-auto max-w-sm rounded-2xl bg-card p-4 shadow-2xl" style={{ top }} key={i}>
        <p className="text-xs font-semibold text-primary">{i + 1} / {steps.length}</p>
        <p className="mt-1 text-sm leading-6">{locale === 'ar' ? step.ar : step.en}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="text-xs text-muted" onClick={() => setDone(true)}>{tr('تخطّي', 'Skip')}</button>
          <span className="flex-1" />
          {i > 0 ? <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>{tr('السابق', 'Back')}</Button> : null}
          <Button size="sm" onClick={() => (i + 1 < steps.length ? setI(i + 1) : setDone(true))}>{i + 1 < steps.length ? tr('التالي', 'Next') : tr('يلا بينا', "Let's go")}</Button>
        </div>
      </div>
    </div>
  );
}
