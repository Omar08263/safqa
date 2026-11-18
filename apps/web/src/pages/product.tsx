import { formatEGP, localized, type MessageKey } from '@safqa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { ScoreRing } from '../components/bits';
import { Markdown } from '../components/markdown';
import { PriceChart } from '../components/price-chart';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export function ProductPage({ id }: { id: string }) {
  const { client, user } = useSession();
  const { t, locale } = usePrefs();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => client.product(id),
  });
  const history = useQuery({
    queryKey: ['history', id],
    queryFn: () => client.history(id),
  });
  const debate = useQuery({
    queryKey: ['debate', id],
    queryFn: () => client.debate(id),
  });
  const prediction = useQuery({
    queryKey: ['prediction', id],
    queryFn: () => client.prediction(id),
  });
  const stack = useQuery({
    queryKey: ['stack', id],
    queryFn: () => client.stack(id),
  });
  const watch = useMutation({
    mutationFn: () => client.addWatch(id, target ? Number(target) : null),
    onSuccess: async () => {
      setMessage(t('watch.synced'));
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  if (product.isLoading) return <p>{t('common.loading')}</p>;
  if (product.isError || !product.data) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <p>{t('common.error')}</p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void product.refetch()}
        >
          {t('action.retry')}
        </Button>
      </div>
    );
  }

  const item = product.data;
  const title = localized(locale, { ar: item.titleAr, en: item.titleEn });
  const best = item.bestOffer;

  function onWatch(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    watch.mutate();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-sm text-muted">{item.brand}</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
          {best ? <ScoreRing score={best.dealScore} /> : null}
        </div>
        {best ? (
          <p className="num mt-4 text-4xl font-semibold">
            {formatEGP(best.priceEgp, locale)}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted">{t('deal.best')}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-accent p-3">
            <dt className="text-muted">{t('deal.median30')}</dt>
            <dd className="num mt-1 font-semibold">
              {item.median30 ? formatEGP(item.median30, locale) : '—'}
            </dd>
          </div>
          <div className="rounded-2xl bg-accent p-3">
            <dt className="text-muted">{t('deal.min90')}</dt>
            <dd className="num mt-1 font-semibold">
              {item.min90 ? formatEGP(item.min90, locale) : '—'}
            </dd>
          </div>
        </dl>
        <form
          onSubmit={onWatch}
          className="mt-5 flex flex-wrap items-end gap-2"
        >
          <label className="text-sm">
            {t('product.target')}
            <Input
              className="mt-1 w-40"
              inputMode="numeric"
              value={target}
              placeholder="52000"
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={watch.isPending}>
            {t('action.watch')}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('product.targetHint')}</p>
        {message ? <p className="mt-2 text-sm text-palm">{message}</p> : null}
        <p className="mt-4 text-sm leading-6 text-muted">
          {t('product.matched')}
        </p>
      </section>
      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">{t('product.history')}</h2>
        {history.data && history.data.series.length > 0 ? (
          <PriceChart history={history.data} />
        ) : (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        )}
      </section>
      <section className="lg:col-span-2">
        <h2 className="mb-3 text-xl font-semibold">{t('product.offers')}</h2>
        <div className="overflow-hidden rounded-3xl border border-border">
          {item.offers.map((offer) => {
            const reasonKey: MessageKey | null =
              offer.fakeDiscountReason === 'inflated_was'
                ? 'deal.fakeInflated'
                : offer.fakeDiscountReason === 'illusory_discount'
                  ? 'deal.fakeIllusory'
                  : null;
            return (
              <article
                key={offer.id}
                className="grid gap-3 border-b border-border bg-card p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <p className="font-semibold">
                    {localized(locale, {
                      ar: offer.store.nameAr,
                      en: offer.store.nameEn,
                    })}
                  </p>
                  <p className="text-xs text-muted">{offer.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>
                      {offer.inStock ? t('deal.inStock') : t('deal.outOfStock')}
                    </Badge>
                    {offer.condition === 'used' ? (
                      <Badge>{t('deal.used')}</Badge>
                    ) : null}
                    {offer.fakeDiscount ? (
                      <Badge className="border-destructive text-destructive">
                        {t('deal.fake')}
                      </Badge>
                    ) : null}
                    <Badge>
                      {t(`deal.${offer.dealLabel}`)} · {offer.dealScore}
                    </Badge>
                  </div>
                  {reasonKey ? (
                    <p className="mt-2 text-xs text-destructive">
                      {t(reasonKey)}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="num text-xl font-semibold">
                    {formatEGP(offer.priceEgp, locale)}
                  </p>
                  {offer.listPriceEgp ? (
                    <p className="text-xs text-muted line-through">
                      {formatEGP(offer.listPriceEgp, locale)}
                    </p>
                  ) : null}
                </div>
                <a
                  className="text-sm font-semibold text-primary"
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('action.openStore')}
                </a>
              </article>
            );
          })}
        </div>
      </section>
      <section className="lg:col-span-2" aria-labelledby="agent-debate">
        <h2 id="agent-debate" className="mb-3 text-xl font-semibold">
          {t('debate.title')}
        </h2>
        {prediction.data ? (
          <p className="mb-3 rounded-2xl bg-accent px-4 py-3 text-sm">
            <span className="font-semibold">{t('predict.title')} </span>
            {locale === 'ar'
              ? prediction.data.reasonAr
              : prediction.data.reasonEn}
          </p>
        ) : null}
        {stack.data && stack.data.savedEgp > 0 ? (
          <p className="mb-3 text-sm">
            {t('stack.title')}: {t('stack.saved')}{' '}
            {formatEGP(stack.data.savedEgp, locale)} →{' '}
            <span className="num font-semibold">
              {formatEGP(stack.data.finalEgp, locale)}
            </span>
            <span className="text-muted">
              {' '}
              ({stack.data.applied.map((line) => line.label).join(' · ')})
            </span>
          </p>
        ) : null}
        {debate.data ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold">
              {t(`debate.${debate.data.recommendation}`)} · {debate.data.score}
            </p>
            <p className="text-xs text-muted">{debate.data.provider}</p>
            <p className="leading-7">
              {locale === 'ar'
                ? debate.data.explanationAr
                : debate.data.explanationEn}
            </p>
            {debate.data.turns
              .filter((turn) => turn.kind === 'message')
              .map((turn, index) => (
                <article
                  key={`${turn.role}-${index}`}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <p className="text-xs font-semibold text-primary">
                    {turn.role}
                    {turn.provider ? (
                      <span className="ms-2 font-normal text-muted">
                        {turn.provider}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-1 text-sm">
                    <Markdown text={turn.content} />
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {debate.isError ? t('common.error') : t('debate.empty')}
          </p>
        )}
      </section>
    </div>
  );
}
