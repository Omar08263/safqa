import { localized } from '@safqa/shared';
import { SemanticBoost } from '../future/ai-lab';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { CardGrid } from '../components/v5';
import { useTr } from '../lib/tr';
import { useV5Meta, v5 } from '../lib/v5';
import { DealCard, StateMessage } from '../components/bits';
import { SearchTop } from '../components/search-top';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export interface SearchFilters {
  q?: string;
  store?: string;
  category?: string;
  minDiscount?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  hideFake?: boolean;
  sort?: 'score' | 'price_asc' | 'discount';
}

export function SearchPage({ search }: { search: SearchFilters }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const navigate = useNavigate();
  const sort = search.sort === 'price_asc' ? 'price' : search.sort === 'discount' ? 'drop' : search.q ? 'relevance' : 'heat';
  const res = useQuery({
    queryKey: ['v5', 'search', search],
    queryFn: () => v5.search({ q: search.q, cat: search.category, store: search.store, min: search.minPrice, max: search.maxPrice, instock: search.inStock, sort, limit: 48 }),
    retry: 1,
  });
  const meta = useV5Meta();
  if (res.isError) return <LegacySearchPage search={search} />;
  const update = (patch: SearchFilters) => void navigate({ to: '/search', search: { ...search, ...patch } });
  const d = res.data;
  const catName = (slug: string) => { const c = meta.data?.categories.find((x) => x.slug === slug); return c ? `${c.emoji} ${locale === 'ar' ? c.nameAr : c.nameEn}` : slug; };
  const storeName = (slug: string) => { const st = meta.data?.stores.find((x) => x.slug === slug); return st ? (locale === 'ar' ? st.nameAr : st.nameEn) : slug; };
  return (
    <div>
      <SearchTop search={search} count={d?.total ?? d?.items.length} />
      {search.q ? <SemanticBoost query={search.q} /> : null}
      {d?.fuzzy ? <p className="mb-3 rounded-2xl bg-primary/10 px-4 py-2 text-sm">{tr(`ملقيناش «${search.q}» بالظبط — دي أقرب نتايج (بنستحمل الأخطاء الإملائية 😉)`, `No exact match for “${search.q}” — closest results`)}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="glass h-fit space-y-4 rounded-3xl p-4 lg:sticky lg:top-24">
          <div>
            <p className="mb-2 text-sm font-bold">{tr('القسم', 'Category')}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => update({ category: undefined })} className={`press rounded-full px-3 py-1 text-xs font-semibold ${!search.category ? 'bg-foreground text-background' : 'bg-accent'}`}>{tr('الكل', 'All')}</button>
              {(d?.facets?.categories ?? meta.data?.categories.filter((c) => c.n).map((c) => ({ id: c.slug, n: c.n })) ?? []).map((f) => (
                <button key={f.id} type="button" onClick={() => update({ category: f.id })} className={`press rounded-full px-3 py-1 text-xs font-semibold ${search.category === f.id ? 'bg-foreground text-background' : 'bg-accent'}`}>{catName(f.id)} <span className="num opacity-60">{f.n}</span></button>
              ))}
            </div>
          </div>
          <label className="block text-sm">{tr('المتجر', 'Store')}
            <select className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3" value={search.store ?? ''} onChange={(e) => update({ store: e.target.value || undefined })}>
              <option value="">{tr('كل المتاجر', 'All stores')}</option>
              {(meta.data?.stores ?? []).filter((s) => s.products).map((s) => <option key={s.slug} value={s.slug}>{locale === 'ar' ? s.nameAr : s.nameEn} ({s.products})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">{tr('من', 'Min')}<input type="number" inputMode="numeric" defaultValue={search.minPrice ?? ''} className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3" onBlur={(e) => update({ minPrice: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="text-sm">{tr('لحد', 'Max')}<input type="number" inputMode="numeric" defaultValue={search.maxPrice ?? ''} className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3" onBlur={(e) => update({ maxPrice: e.target.value ? Number(e.target.value) : undefined })} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(search.inStock)} onChange={(e) => update({ inStock: e.target.checked || undefined })} />{tr('المتاح بس', 'In stock only')}</label>
          <label className="block text-sm">{tr('الترتيب', 'Sort')}
            <select className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3" value={search.sort ?? 'score'} onChange={(e) => update({ sort: e.target.value as SearchFilters['sort'] })}>
              <option value="score">{search.q ? tr('الأنسب', 'Best match') : tr('الأسخن 🔥', 'Hottest 🔥')}</option>
              <option value="price_asc">{tr('الأرخص', 'Cheapest')}</option>
              <option value="discount">{tr('أكبر نزول', 'Biggest drop')}</option>
            </select>
          </label>
          {d?.facets?.stores.length ? <div className="t-meta">{tr('في', 'In')}: {d.facets.stores.slice(0, 5).map((s) => `${storeName(s.id)} (${s.n})`).join(' · ')}</div> : null}
        </aside>
        <section className="min-w-0">
          {res.isPending ? <StateMessage kind="loading" /> : d && d.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="text-4xl" aria-hidden="true">🔎</p>
              <p className="mt-2 font-bold">{tr('ملقيناش حاجة بالاسم ده', 'Nothing found')}</p>
              <p className="t-meta mt-1">{tr('جرّب اسم أقصر أو الموديل بس — أو الصق رابط المنتج وإحنا نتابعه.', 'Try a shorter name or the model — or paste the product link.')}</p>
              <Link to="/add" className="press mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{tr('الصق رابط 🔗', 'Paste a link 🔗')}</Link>
            </div>
          ) : d ? <CardGrid items={d.items} /> : null}
        </section>
      </div>
    </div>
  );
}

function LegacySearchPage({ search }: { search: SearchFilters }) {
  const { client } = useSession();
  const { t, locale } = usePrefs();
  const navigate = useNavigate();
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => client.stores() });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => client.categories() });
  const results = useQuery({
    queryKey: ['search', search],
    queryFn: () => client.search(search),
  });

  function update(patch: SearchFilters) {
    void navigate({
      to: '/search',
      search: { ...search, ...patch },
    });
  }

  return (
    <div>
    <SearchTop search={search} count={results.data?.items.length} />
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="glass h-fit space-y-4 rounded-3xl p-4 lg:sticky lg:top-24">
        <label className="block text-sm">
          {t('filter.store')}
          <select
            className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
            value={search.store ?? ''}
            onChange={(event) => update({ store: event.target.value || undefined })}
          >
            <option value="">{t('filter.all')}</option>
            {(stores.data?.items ?? []).map((store) => (
              <option key={store.slug} value={store.slug}>
                {localized(locale, { ar: store.nameAr, en: store.nameEn })}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t('filter.category')}
          <select
            className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
            value={search.category ?? ''}
            onChange={(event) => update({ category: event.target.value || undefined })}
          >
            <option value="">{t('filter.all')}</option>
            {(categories.data?.items ?? []).map((category) => (
              <option key={category.slug} value={category.slug}>
                {localized(locale, { ar: category.nameAr, en: category.nameEn })}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t('filter.discount')}
          <input
            type="number"
            min={0}
            max={90}
            defaultValue={search.minDiscount ?? ''}
            className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
            onBlur={(event) => update({ minDiscount: event.target.value ? Number(event.target.value) : undefined })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            {t('filter.min')}
            <input
              type="number"
              defaultValue={search.minPrice ?? ''}
              className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
              onBlur={(event) => update({ minPrice: event.target.value ? Number(event.target.value) : undefined })}
            />
          </label>
          <label className="text-sm">
            {t('filter.max')}
            <input
              type="number"
              defaultValue={search.maxPrice ?? ''}
              className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
              onBlur={(event) => update({ maxPrice: event.target.value ? Number(event.target.value) : undefined })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(search.inStock)} onChange={(event) => update({ inStock: event.target.checked })} />
          {t('filter.inStock')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(search.hideFake)} onChange={(event) => update({ hideFake: event.target.checked })} />
          {t('filter.hideFake')}
        </label>
        <label className="block text-sm">
          {t('deal.score')}
          <select
            className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3"
            value={search.sort ?? 'score'}
            onChange={(event) => update({ sort: event.target.value as SearchFilters['sort'] })}
          >
            <option value="score">{t('deal.score')}</option>
            <option value="price_asc">{t('filter.price')}</option>
            <option value="discount">{t('deal.save')}</option>
          </select>
        </label>
      </aside>
      <section>
        <p className="mb-4 text-sm text-muted">
          {results.data ? `${results.data.items.length} ${t('search.results')}` : t('common.loading')}
        </p>
        {results.isLoading ? <StateMessage kind="loading" /> : null}
        {results.isError ? <StateMessage kind="error" onRetry={() => void results.refetch()} /> : null}
        {results.data && results.data.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">{t('search.empty')}</div>
        ) : null}
        <div className="deal-grid deal-grid--aside">
          {results.data?.items.map((product) => (
            <DealCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
    </div>
  );
}
