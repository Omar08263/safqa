import { useNavigate } from '@tanstack/react-router';
import { Bookmark, BookmarkPlus, Mic, MicOff, Search, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useToast } from '../fx/fx';
import { keys, track } from '../lib/activity';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import type { SearchFilters } from '../pages/search';
import { Button } from './ui/button';

interface Saved { id: string; name: string; filters: SearchFilters }
// biome-ignore lint/suspicious/noExplicitAny: Web Speech API is not in lib.dom for every browser.
type Rec = any;

export function SearchTop({ search, count }: { search: SearchFilters; count?: number }) {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const navigate = useNavigate();
  const [saved, setSaved] = useLocal<Saved[]>(keys.savedSearches, []);
  const [listening, setListening] = useState(false);
  const [q, setQ] = useState(search.q ?? '');
  const rec = useRef<Rec>(null);
  useEffect(() => setQ(search.q ?? ''), [search.q]);
  const SpeechRec: Rec = typeof window !== 'undefined' ? (window as Rec).SpeechRecognition || (window as Rec).webkitSpeechRecognition : null;

  function go(e?: FormEvent) {
    e?.preventDefault();
    track.search(q);
    void navigate({ to: '/search', search: { ...search, q: q || undefined } });
  }
  function voice() {
    if (!SpeechRec) {
      toast(tr('المتصفح ده مش بيدعم البحث بالصوت (جرّب كروم).', 'This browser does not support voice search (try Chrome).'), 'error');
      return;
    }
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechRec();
    r.lang = locale === 'ar' ? 'ar-EG' : 'en-US';
    r.interimResults = false;
    r.onresult = (ev: Rec) => {
      const text = String(ev.results?.[0]?.[0]?.transcript ?? '');
      setQ(text);
      track.search(text);
      void navigate({ to: '/search', search: { ...search, q: text || undefined } });
    };
    r.onerror = () => toast(tr('مقدرتش أسمعك — اسمح بالمايك وجرّب تاني.', 'Could not hear you — allow the mic and retry.'), 'error');
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }
  function save() {
    const name = window.prompt(tr('اسم البحث المحفوظ', 'Name for this search'), search.q || tr('بحثي', 'My search'));
    if (!name) return;
    setSaved([{ id: crypto.randomUUID(), name, filters: search }, ...saved].slice(0, 12));
    toast(tr('البحث اتحفظ', 'Search saved'));
  }
  return (
    <div className="mb-6 space-y-3">
      <form onSubmit={go} className="glass flex items-center gap-2 rounded-full p-1.5 ps-4">
        <Search className="h-5 w-5 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('ابحث', 'Search')} placeholder={tr('ابحث بالاسم، الماركة، أو الموديل…', 'Search by name, brand or model…')} className="h-11 flex-1 bg-transparent outline-none" />
        <button type="button" onClick={voice} aria-pressed={listening} aria-label={tr('بحث بالصوت', 'Voice search')} title={tr('بحث بالصوت', 'Voice search')} className={`grid h-10 w-10 place-items-center rounded-full ${listening ? 'pulse-dot bg-destructive text-white' : 'hover:bg-accent'}`}>{listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
        <Button type="submit">{tr('دوّر', 'Search')}</Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {count != null ? <span className="font-semibold">{tr(`${count} نتيجة`, `${count} results`)}</span> : null}
        <span className="text-muted">·</span>
        {[[tr('أقل من 5000', 'Under 5,000'), { maxPrice: 5000, minPrice: undefined }], [tr('5000–20000', '5,000–20,000'), { minPrice: 5000, maxPrice: 20000 }], [tr('فوق 20000', 'Over 20,000'), { minPrice: 20000, maxPrice: undefined }]].map(([label, patch]) => (
          <button key={String(label)} type="button" onClick={() => void navigate({ to: '/search', search: { ...search, ...(patch as SearchFilters) } })} className="rounded-full border border-border bg-card px-3 py-1 hover:border-primary">{String(label)}</button>
        ))}
        <button type="button" onClick={save} className="flex items-center gap-1 rounded-full border border-primary/50 px-3 py-1 font-semibold text-primary"><BookmarkPlus className="h-3.5 w-3.5" />{tr('احفظ البحث', 'Save search')}</button>
      </div>
      {saved.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Bookmark className="h-4 w-4 text-primary" />
          {saved.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1">
              <button type="button" onClick={() => void navigate({ to: '/search', search: s.filters })} className="font-semibold">{s.name}</button>
              <button type="button" aria-label={tr('امسح', 'Delete')} onClick={() => setSaved(saved.filter((x) => x.id !== s.id))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
