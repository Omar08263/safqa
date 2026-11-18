import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import Fuse from 'fuse.js';
import { Copy, Search, Share2, Star, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PriceFreshness } from '../components/price-freshness';
import { Card, PageHeader, useToast } from '../fx/fx';
import { useCatalog } from '../lib/catalog';
import { useLocal } from '../lib/local';
import type { ProductMedia } from '../lib/media';
import { usePrefs } from '../lib/prefs';
import { canonical, canonLabels } from '../lib/product-intel';
import { allTools, type Ctx, type Tool, toolById, toolCats, type Values } from '../lib/toolbox';
import { useTr } from '../lib/tr';
import type { ProductCard } from '@safqa/shared';

const FAV_KEY = 'safqa.toolbox.favs.v1';
const RECENT_KEY = 'safqa.toolbox.recent.v1';

function useFx() {
  return useQuery({
    queryKey: ['fx'],
    queryFn: async () => {
      try {
        const r = await fetch('/api/fx');
        if (r.ok) {
          const j = (await r.json()) as { rates: Record<string, number>; updatedAt: string };
          localStorage.setItem('safqa.fx.cache.v1', JSON.stringify(j));
          return j;
        }
      } catch {}
      const c = localStorage.getItem('safqa.fx.cache.v1');
      return c ? (JSON.parse(c) as { rates: Record<string, number>; updatedAt: string }) : null;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function ToolboxPage({ q: initialQ, tool: initialTool }: { q?: string; tool?: string }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQ ?? '');
  const [cat, setCat] = useState<string>('all');
  const [favs, setFavs] = useLocal<string[]>(FAV_KEY, []);
  const [recent, setRecent] = useLocal<string[]>(RECENT_KEY, []);
  const open = initialTool ? toolById(initialTool) : undefined;
  const fuse = useMemo(() => new Fuse(allTools, { keys: [{ name: 'ar', weight: 3 }, { name: 'en', weight: 2 }, 'dar', 'den', 'tags'], threshold: 0.38, ignoreLocation: true }), []);
  const list = q.trim() ? fuse.search(q.trim()).map((r) => r.item) : allTools;
  const shown = list.filter((t) => cat === 'all' || (cat === 'fav' ? favs.includes(t.id) : t.cat === cat));
  const counts = Object.fromEntries(toolCats.map((c) => [c.id, allTools.filter((t) => t.cat === c.id).length]));
  const openTool = (id: string) => { setRecent([id, ...recent.filter((x) => x !== id)].slice(0, 8)); void navigate({ to: '/toolbox', search: { q: q || undefined, tool: id } }); };

  return (
    <div className="space-y-6">
      <PageHeader kicker={tr(`${allTools.length} أداة شغالة من غير نت`, `${allTools.length} tools that work offline`)} title={tr('صندوق العدة', 'Toolbox')} lede={tr('حاسبات تقسيط وكهرباء وعملات ومقاسات ومقارنات سعر الوحدة وأكتر — كلها بتشتغل على جهازك. الأدوات اللي بتستخدم أسعار المنتجات أو العملات بتعتمد على آخر تحديث اتسحب، ومكتوب جنب كل نتيجة تاريخه.', 'Installments, power cost, currencies, sizes, unit prices and more — all run on your device. Tools using product prices or FX rates rely on the last sync, dated next to each result.')} icon={<Wrench className="h-6 w-6" />}>
        <PriceFreshness />
      </PageHeader>

      <div className="sticky top-16 z-20 -mx-1 space-y-2 rounded-2xl bg-background/85 p-1 backdrop-blur">
        <label className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-card px-4">
          <Search className="h-5 w-5 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر: تقسيط 12، تكييف، دولار، فدان، مقاس شاشة…', 'Search: 12-month, AC, USD, feddan, TV size…')} className="h-full flex-1 bg-transparent outline-none" aria-label={tr('دوّر في الأدوات', 'Search tools')} />
          {q ? <button type="button" onClick={() => setQ('')} aria-label="clear"><X className="h-4 w-4" /></button> : null}
          <span className="num text-xs text-muted">{shown.length}</span>
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <button type="button" onClick={() => setCat('all')} className={`flex-none rounded-full px-3 py-1.5 font-semibold ${cat === 'all' ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{tr('الكل', 'All')} · {allTools.length}</button>
          <button type="button" onClick={() => setCat('fav')} className={`flex-none rounded-full px-3 py-1.5 font-semibold ${cat === 'fav' ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>⭐ {tr('المفضلة', 'Favourites')} · {favs.length}</button>
          {toolCats.map((c) => <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`flex-none rounded-full px-3 py-1.5 font-semibold ${cat === c.id ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{c.emoji} {tr(c.ar, c.en)} · {counts[c.id]}</button>)}
        </div>
      </div>

      {open ? <ToolPanel key={open.id} tool={open} fav={favs.includes(open.id)} onFav={() => setFavs(favs.includes(open.id) ? favs.filter((x) => x !== open.id) : [...favs, open.id])} onClose={() => void navigate({ to: '/toolbox', search: { q: q || undefined } })} /> : null}

      {!q && cat === 'all' && recent.length ? (
        <section><p className="mb-2 text-sm font-bold">{tr('استخدمتها مؤخرًا', 'Recently used')}</p><div className="flex flex-wrap gap-2">{recent.map((id) => { const t = toolById(id); return t ? <button key={id} type="button" onClick={() => openTool(id)} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">{t.emoji} {tr(t.ar, t.en)}</button> : null; })}</div></section>
      ) : null}

      {(cat === 'all' && !q ? toolCats : [{ id: 'x', ar: '', en: '', emoji: '' }]).map((c) => {
        const items = c.id === 'x' ? shown : shown.filter((t) => t.cat === c.id);
        const limit = c.id === 'x' ? 120 : c.id === 'units' ? 12 : 9;
        return (
          <section key={c.id} className="space-y-2">
            {c.id !== 'x' ? <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{c.emoji} {tr(c.ar, c.en)}</h2><button type="button" onClick={() => setCat(c.id)} className="text-sm font-semibold text-primary">{tr(`كل الـ ${items.length}`, `All ${items.length}`)} ←</button></div> : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.slice(0, limit).map((t) => (
                <button key={t.id} type="button" onClick={() => openTool(t.id)} className={`lift flex items-start gap-3 rounded-2xl border bg-card p-3 text-start ${open?.id === t.id ? 'border-primary' : 'border-border'}`}>
                  <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                  <span className="min-w-0"><span className="block font-semibold leading-6">{locale === 'ar' ? t.ar : t.en}</span>{(locale === 'ar' ? t.dar : t.den) ? <span className="line-clamp-2 text-xs text-muted">{locale === 'ar' ? t.dar : t.den}</span> : null}</span>
                  {favs.includes(t.id) ? <Star className="ms-auto h-4 w-4 flex-none fill-[var(--saffron)] text-[var(--saffron)]" /> : null}
                </button>
              ))}
            </div>
            {c.id === 'x' && items.length > limit ? <p className="text-xs text-muted">{tr(`ظاهر ${limit} من ${items.length} — دقّق البحث`, `Showing ${limit} of ${items.length} — refine the search`)}</p> : null}
            {c.id === 'x' && items.length === 0 ? <Card><p>{tr('مفيش أداة بالاسم ده. جرّب كلمة تانية.', 'No tool matches. Try another word.')}</p></Card> : null}
          </section>
        );
      })}
      <p className="text-center text-xs text-muted">{tr('الأدوات القديمة (حاسبة التقسيط ومقارنة المتاجر) لسه موجودة في ', 'Classic tools are still at ')}<Link to="/tools" className="text-primary underline">/tools</Link></p>
    </div>
  );
}

function ToolPanel({ tool, fav, onFav, onClose }: { tool: Tool; fav: boolean; onFav: () => void; onClose: () => void }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const fx = useFx();
  const catalog = useCatalog();
  const products = (catalog.data?.items ?? []) as ProductCard[];
  const needsSpecs = tool.fields.some((f) => f.kind === 'product');
  const medias = useQueries({ queries: (needsSpecs ? products : []).map((p) => ({ queryKey: ['media', p.id], queryFn: async () => { const r = await fetch(`/api/products/${p.id}/media`); return r.ok ? ((await r.json()) as ProductMedia) : null; }, staleTime: Number.POSITIVE_INFINITY })) });
  const [vals, setVals] = useLocal<Values>(`safqa.toolbox.v.${tool.id}`, Object.fromEntries(tool.fields.map((f) => [f.id, f.def])));
  const v: Values = { ...Object.fromEntries(tool.fields.map((f) => [f.id, f.def])), ...vals };
  for (const f of tool.fields) if (f.kind === 'product' && !v[f.id]) { const opts = products.filter((p) => p.category?.slug === f.category); v[f.id] = opts[f.id === 'b' ? 1 : 0]?.id ?? ''; }
  const ctx: Ctx = {
    fx: fx.data?.rates ?? null,
    fxDate: fx.data?.updatedAt?.slice(0, 10) ?? null,
    products,
    specOf: (id) => {
      const i = products.findIndex((p) => p.id === id);
      const p = products[i];
      if (!p) return {};
      const c = canonical(p as never, medias[i]?.data ?? null) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const l of canonLabels) if (c[l.key] != null) out[locale === 'ar' ? l.ar : l.en] = typeof c[l.key] === 'boolean' ? (c[l.key] ? '✓' : '✗') : c[l.key];
      return out;
    },
  };
  let result: ReturnType<Tool['run']>;
  try { result = tool.run(v, ctx); } catch { result = { rows: [{ ar: 'خطأ في المدخلات', en: 'Invalid input', value: '—' }] }; }
  const text = `${tr(tool.ar, tool.en)}\n${result.rows.map((r) => `${locale === 'ar' ? r.ar : r.en}: ${r.value}`).join('\n')}\n— صفقة`;

  return (
    <Card className="page-enter border-2 border-primary/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-3xl">{tool.emoji}</p><h2 className="text-xl font-bold">{locale === 'ar' ? tool.ar : tool.en}</h2>{(locale === 'ar' ? tool.dar : tool.den) ? <p className="text-sm text-muted">{locale === 'ar' ? tool.dar : tool.den}</p> : null}</div>
        <div className="flex gap-1">
          <button type="button" onClick={onFav} className="rounded-full bg-accent p-2" aria-label={tr('مفضلة', 'Favourite')}><Star className={`h-4 w-4 ${fav ? 'fill-[var(--saffron)] text-[var(--saffron)]' : ''}`} /></button>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); toast(tr('اتنسخت النتيجة', 'Result copied')); }} className="rounded-full bg-accent p-2" aria-label={tr('نسخ', 'Copy')}><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={() => { const url = `${location.origin}${location.pathname}#/toolbox?tool=${tool.id}`; if (navigator.share) void navigator.share({ title: tool.ar, text, url }).catch(() => {}); else { void navigator.clipboard?.writeText(url); toast(tr('اتنسخ اللينك', 'Link copied')); } }} className="rounded-full bg-accent p-2" aria-label={tr('مشاركة', 'Share')}><Share2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-full bg-accent p-2" aria-label={tr('قفل', 'Close')}><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {tool.fields.length === 0 ? <p className="text-sm text-muted">{tr('مفيش مدخلات — النتيجة جاهزة.', 'No inputs needed.')}</p> : null}
          {tool.fields.map((f) => (
            <label key={f.id} className={`block text-sm ${f.kind === 'product' ? 'sm:col-span-2' : ''}`}>
              <span className="mb-1 block font-semibold">{locale === 'ar' ? f.ar : f.en}{f.unit ? <span className="text-muted"> ({f.unit})</span> : null}</span>
              {f.kind === 'select' ? (
                <select value={String(v[f.id])} onChange={(e) => setVals({ ...v, [f.id]: e.target.value })} className="h-10 w-full rounded-xl border border-border bg-background px-2">{f.options?.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              ) : f.kind === 'product' ? (
                <select value={String(v[f.id])} onChange={(e) => setVals({ ...v, [f.id]: e.target.value })} className="h-10 w-full rounded-xl border border-border bg-background px-2">{products.filter((p) => p.category?.slug === f.category).map((p) => <option key={p.id} value={p.id}>{locale === 'ar' ? p.titleAr : p.titleEn}</option>)}</select>
              ) : f.kind === 'date' ? (
                <input type="date" value={String(v[f.id])} onChange={(e) => setVals({ ...v, [f.id]: e.target.value })} className="h-10 w-full rounded-xl border border-border bg-background px-2" />
              ) : (
                <input type="number" inputMode="decimal" step={f.step ?? 'any'} value={String(v[f.id])} onChange={(e) => setVals({ ...v, [f.id]: e.target.value })} className="num h-10 w-full rounded-xl border border-border bg-background px-3" />
              )}
            </label>
          ))}
          {tool.fields.length ? <button type="button" onClick={() => setVals(Object.fromEntries(tool.fields.map((f) => [f.id, f.def])))} className="text-start text-xs text-primary underline">{tr('رجّع القيم الافتراضية', 'Reset defaults')}</button> : null}
        </div>
        <div className="space-y-2" aria-live="polite">
          {result.rows.map((r, i) => (
            <div key={`${r.en}${i}`} className={`flex items-center justify-between gap-3 rounded-2xl px-4 ${r.big ? 'bg-primary/10 py-3' : 'bg-accent py-2'}`}>
              <span className="text-sm">{locale === 'ar' ? r.ar : r.en}</span>
              <span className={`num text-end font-bold ${r.big ? 'text-2xl' : ''} ${r.good ? 'text-[var(--palm)]' : ''} ${r.bad ? 'text-destructive' : ''}`}>{r.value}</span>
            </div>
          ))}
          {result.noteAr ? <p className="rounded-xl border border-dashed border-border p-2 text-xs leading-5 text-muted">ℹ️ {locale === 'ar' ? result.noteAr : result.noteEn ?? result.noteAr}</p> : null}
        </div>
      </div>
    </Card>
  );
}
