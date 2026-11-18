import { localized } from '@safqa/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DealCard, StateMessage } from '../components/bits';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export function HomePage() {
  const { client } = useSession();
  const { t, locale } = usePrefs();
  const deals = useQuery({ queryKey: ['deals'], queryFn: () => client.deals() });
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => client.stores() });
  const calendar = useQuery({
    queryKey: ['calendar'],
    queryFn: () => client.calendar(),
  });

  return (
    <div className="space-y-10">
      <section className="grid items-end gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <p className="text-sm font-semibold text-primary">{t('home.kicker')}</p>
          <h1 className="mt-2 max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">{t('home.title')}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{t('home.lede')}</p>
          {calendar.data?.items[0] ? (
            <p className="mt-3 text-sm font-semibold text-primary">
              {t('calendar.next')}:{' '}
              {locale === 'ar'
                ? calendar.data.items[0].nameAr
                : calendar.data.items[0].nameEn}{' '}
              · {calendar.data.items[0].daysUntil}
            </p>
          ) : null}
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{t('home.howTitle')}</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
            <li>1. {t('home.how1')}</li>
            <li>2. {t('home.how2')}</li>
            <li>3. {t('home.how3')}</li>
          </ol>
        </div>
      </section>

      {deals.isLoading ? <StateMessage kind="loading" /> : null}
      {deals.isError ? <StateMessage kind="error" onRetry={() => void deals.refetch()} /> : null}
      {deals.data && deals.data.items.length === 0 ? <StateMessage kind="empty" /> : null}
      {deals.data && deals.data.items.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.data.items.map((product) => (
            <DealCard key={product.id} product={product} />
          ))}
        </section>
      ) : null}

      {deals.data && deals.data.suspicious.length > 0 ? (
        <section>
          <h2 className="mb-4 text-xl font-semibold">{t('home.suspicious')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.data.suspicious.map((product) => (
              <DealCard key={`${product.id}-${product.bestOffer?.id}`} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl font-semibold">{t('stores.title')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t('stores.note')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(stores.data?.items ?? []).map((store) => (
            <Link
              key={store.slug}
              to="/search"
              search={{ store: store.slug }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            >
              {localized(locale, { ar: store.nameAr, en: store.nameEn })}
              <span className="ms-2 text-xs text-muted">{t(`status.${store.adapterStatus}`)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
