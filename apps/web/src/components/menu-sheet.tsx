import { Link, useRouterState } from '@tanstack/react-router';
import { MoonStar, PanelBottomClose, PanelBottomOpen, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { allNav, type NavItem } from '../features/nav';
import { useDevice } from '../lib/device';
import { usePrefs } from '../lib/prefs';
import { feedback, setSoundEnabled, useSound } from '../lib/sound';
import { useTr } from '../lib/tr';
import { AppearancePicker } from './appearance-picker';
import { useBottomBarMode } from './bottom-nav';

const groups: { ar: string; en: string; paths: string[] }[] = [
  { ar: 'تسوّق بذكاء', en: 'Shop smart', paths: ['/', '/search', '/radar', '/compare', '/categories', '/stores', '/calendar', '/insights'] },
  { ar: 'حسابي', en: 'My stuff', paths: ['/dashboard', '/watchlist', '/alerts', '/collections', '/savings', '/achievements', '/profile', '/plans'] },
  { ar: 'المجتمع والوكلاء', en: 'Community & agents', paths: ['/community', '/chat', '/agents', '/rules', '/assistant', '/referral'] },
  { ar: 'أدوات وتطبيقات', en: 'Tools & apps', paths: ['/toolbox', '/tools', '/app', '/channels', '/features'] },
  { ar: 'صفقة', en: 'Safqa', paths: ['/settings', '/help', '/about'] },
];

/** Full menu: a bottom sheet on phones, a side panel on tablets. */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useTr();
  const { locale, theme, toggleTheme } = usePrefs();
  const device = useDevice();
  const [sound] = useSound();
  const [bar, setBar] = useBottomBarMode();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || device === 'desktop') return null;
  const byPath = new Map(allNav.map((n) => [n.to, n] as const));
  const label = (n: { ar: string; en: string }) => (locale === 'ar' ? n.ar : n.en);
  const phone = device === 'phone';
  return (
    <div className="no-print fixed inset-0 z-[45]" role="dialog" aria-modal="true" aria-label={tr('القائمة الكاملة', 'Full menu')}>
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label={tr('اقفل القائمة', 'Close menu')} onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={phone
          ? 'sheet-up absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-4 pb-[calc(var(--bottom-bar,0px)+16px)] pt-2 shadow-2xl outline-none'
          : 'sheet-side absolute bottom-0 end-0 top-0 w-[360px] max-w-[85vw] overflow-y-auto border-s border-border bg-background p-5 shadow-2xl outline-none'}
      >
        {phone ? <div className="mx-auto mb-3 mt-1 h-1.5 w-12 rounded-full bg-border" aria-hidden="true" /> : null}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold">{tr('كل حاجة في صفقة', 'Everything in Safqa')}</p>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent" aria-label={tr('اقفل', 'Close')}><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Toggle on={theme === 'dark'} onClick={() => { toggleTheme(); feedback('tap'); }} icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />} text={theme === 'dark' ? tr('نهاري', 'Light') : tr('ليلي', 'Dark')} />
          <Toggle on={sound} onClick={() => setSoundEnabled(!sound)} icon={sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} text={sound ? tr('الصوت شغّال', 'Sound on') : tr('الصوت مقفول', 'Sound off')} />
          {phone ? (
            <Toggle on={bar !== 'hidden'} onClick={() => { setBar(bar === 'hidden' ? 'auto' : 'hidden'); feedback('tap'); }} icon={bar === 'hidden' ? <PanelBottomOpen className="h-4 w-4" /> : <PanelBottomClose className="h-4 w-4" />} text={bar === 'hidden' ? tr('أظهر الشريط', 'Show bar') : tr('خبّي الشريط', 'Hide bar')} />
          ) : <span />}
        </div>
        <div className="mb-4 rounded-2xl border border-border p-3"><AppearancePicker compact /></div>
        {groups.map((g) => (
          <section key={g.en} className="mb-4">
            <h2 className="mb-1.5 px-1 text-xs font-semibold text-muted">{label(g)}</h2>
            <ul className={`grid gap-1.5 ${phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {g.paths.map((to) => byPath.get(to)).filter((n): n is NavItem => Boolean(n)).map((n) => (
                <li key={n.to}>
                  <Link to={n.to as '/'} onClick={() => { feedback('tap'); onClose(); }} className={`flex min-h-11 items-center gap-2.5 rounded-2xl border px-3 py-2 text-sm transition ${path === n.to ? 'border-primary/40 bg-primary/10 font-semibold' : 'border-border/60 bg-card hover:bg-accent'}`}>
                    <n.icon className="h-4 w-4 flex-none text-primary" />
                    <span className="min-w-0 truncate">{label(n)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, icon, text }: { on: boolean; onClick: () => void; icon: React.ReactNode; text: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] ${on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted'}`}>
      {icon}
      <span className="whitespace-nowrap">{text}</span>
    </button>
  );
}
