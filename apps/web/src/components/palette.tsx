import * as Dialog from '@radix-ui/react-dialog';
import { localized } from '@safqa/shared';
import { useNavigate } from '@tanstack/react-router';
import { Clock, Command, Languages, MoonStar, Package, Printer, Search, Shuffle } from 'lucide-react';
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { allNav } from '../features/nav';
import { track, useActivity } from '../lib/activity';
import { useCatalog } from '../lib/catalog';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
  group: string;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tr = useTr();
  const { locale, setLocale, toggleTheme } = usePrefs();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [activity] = useActivity();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => {
      onOpenChange(false);
      fn();
    };
    const pages: Item[] = allNav.map((n) => ({
      id: `page:${n.to}`,
      group: tr('الصفحات', 'Pages'),
      label: locale === 'ar' ? n.ar : n.en,
      hint: n.key ? `g ${n.key}` : undefined,
      icon: <n.icon className="h-4 w-4" />,
      run: close(() => void navigate({ to: n.to })),
    }));
    const products: Item[] = (catalog.data?.items ?? []).map((p) => ({
      id: `product:${p.id}`,
      group: tr('المنتجات', 'Products'),
      label: localized(locale, { ar: p.titleAr, en: p.titleEn }),
      hint: p.bestOffer ? `${p.bestOffer.priceEgp.toLocaleString()} EGP` : undefined,
      icon: <Package className="h-4 w-4" />,
      run: close(() => void navigate({ to: '/product/$id', params: { id: p.id } })),
    }));
    const actions: Item[] = [
      { id: 'a:theme', group: tr('أوامر', 'Actions'), label: tr('تبديل الوضع الليلي/النهاري', 'Toggle dark / light'), hint: 'Shift+T', icon: <MoonStar className="h-4 w-4" />, run: close(toggleTheme) },
      { id: 'a:lang', group: tr('أوامر', 'Actions'), label: tr('Switch to English', 'التحويل للعربي'), hint: 'Shift+L', icon: <Languages className="h-4 w-4" />, run: close(() => setLocale(locale === 'ar' ? 'en' : 'ar')) },
      { id: 'a:print', group: tr('أوامر', 'Actions'), label: tr('اطبع الصفحة', 'Print this page'), icon: <Printer className="h-4 w-4" />, run: close(() => window.print()) },
      {
        id: 'a:random', group: tr('أوامر', 'Actions'), label: tr('فاجئني بصفقة عشوائية', 'Surprise me with a deal'), icon: <Shuffle className="h-4 w-4" />,
        run: close(() => {
          const list = catalog.data?.items ?? [];
          const pick = list[Math.floor(Math.random() * list.length)];
          if (pick) void navigate({ to: '/product/$id', params: { id: pick.id } });
        }),
      },
    ];
    const recent: Item[] = activity.searches.slice(0, 5).map((s) => ({
      id: `recent:${s.q}`,
      group: tr('عمليات بحث سابقة', 'Recent searches'),
      label: s.q,
      icon: <Clock className="h-4 w-4" />,
      run: close(() => void navigate({ to: '/search', search: { q: s.q } })),
    }));
    return [...recent, ...pages, ...products, ...actions];
  }, [activity.searches, catalog.data, locale, navigate, onOpenChange, setLocale, toggleTheme, tr]);

  const needle = q.trim().toLowerCase();
  const filtered = needle ? items.filter((i) => i.label.toLowerCase().includes(needle) || i.hint?.toLowerCase().includes(needle)) : items;
  const withSearch: Item[] = needle
    ? [
        {
          id: 'search', group: tr('بحث', 'Search'), label: tr(`ابحث عن «${q}»`, `Search for “${q}”`), icon: <Search className="h-4 w-4" />,
          run: () => {
            onOpenChange(false);
            track.search(q);
            void navigate({ to: '/search', search: { q } });
          },
        },
        ...filtered,
      ]
    : filtered;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(withSearch.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      withSearch[active]?.run();
    }
  }
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="page-enter fixed inset-x-3 top-[10vh] z-[81] mx-auto max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl" onKeyDown={onKey} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{tr('لوحة الأوامر', 'Command palette')}</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Command className="h-5 w-5 text-primary" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={tr('اكتب صفحة، منتج، أو أمر…', 'Type a page, product, or command…')} className="h-14 flex-1 bg-transparent outline-none" />
            <kbd className="rounded-md border border-border px-1.5 text-[10px] text-muted">Esc</kbd>
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {withSearch.length === 0 ? <p className="p-6 text-center text-sm text-muted">{tr('مفيش نتايج', 'No results')}</p> : null}
            {withSearch.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold text-muted">{header}</p> : null}
                  <button type="button" role="option" aria-selected={index === active} data-index={index} onMouseEnter={() => setActive(index)} onClick={item.run} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm ${index === active ? 'bg-accent' : ''}`}>
                    <span className="text-primary">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint ? <span className="num text-[11px] text-muted">{item.hint}</span> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const rows: [string, string][] = [
    ['Ctrl / ⌘ + K', tr('افتح لوحة الأوامر', 'Open command palette')],
    ['/', tr('روح لخانة البحث', 'Focus search')],
    ['?', tr('اعرض الاختصارات', 'Show shortcuts')],
    ['Shift + T', tr('بدّل الوضع الليلي', 'Toggle dark mode')],
    ['Shift + L', tr('بدّل اللغة', 'Switch language')],
    ...allNav.filter((n) => n.key).map((n) => [`g ${n.key}`, locale === 'ar' ? n.ar : n.en] as [string, string]),
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="page-enter fixed inset-x-3 top-[8vh] z-[81] mx-auto max-h-[84vh] max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl" aria-describedby={undefined}>
          <Dialog.Title className="text-xl font-bold">{tr('اختصارات الكيبورد', 'Keyboard shortcuts')}</Dialog.Title>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt><kbd className="num rounded-lg border border-border bg-accent px-2 py-0.5 text-xs">{k}</kbd></dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <Dialog.Close className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{tr('تمام', 'Done')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
