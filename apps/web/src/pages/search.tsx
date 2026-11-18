import { localized } from '@safqa/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DealCard, StateMessage } from '../components/bits';
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
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-4 rounded-3xl border border-border bg-card p-4">
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
        <div className="grid gap-4 sm:grid-cols-2">
          {results.data?.items.map((product) => (
            <DealCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
