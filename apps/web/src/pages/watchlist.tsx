import { Download, Eye } from 'lucide-react';
import { PageHeader, useToast } from '../fx/fx';
import { StateMessage } from '../components/bits';
import { SignInGate } from '../components/sign-in-gate';
import { downloadFile, toCsv } from '../lib/local';
import { formatEGP, localized } from '@safqa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export function WatchlistPage() {
  const { client, user } = useSession();
  const { t, locale } = usePrefs();
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const list = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => client.watchlist(),
    enabled: Boolean(user),
  });
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (item: { id: string; productId: string; target: number | null }) => client.removeWatch(item.id),
    onSuccess: async (_r, item) => {
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast(locale === 'ar' ? 'شلناه من المراقبة' : 'Removed from your watchlist', 'info', {
        action: {
          label: locale === 'ar' ? 'رجّعه' : 'Undo',
          onClick: () => void client.addWatch(item.productId, item.target).then(() => queryClient.invalidateQueries({ queryKey: ['watchlist'] })),
        },
        duration: 6000,
      });
    },
    onError: () => toast(locale === 'ar' ? 'معرفناش نشيله دلوقتي، جرّب تاني' : 'Could not remove it, try again', 'error'),
  });
  const update = useMutation({
    mutationFn: (input: { id: string; target: number | null }) => client.updateWatch(input.id, input.target),
    onSuccess: async (_r, input) => {
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast(input.target ? (locale === 'ar' ? `اتحفظ 🎯 هنقولك أول ما يوصل ${formatEGP(input.target, locale)}` : `Saved 🎯 we'll ping you at ${formatEGP(input.target, locale)}`) : locale === 'ar' ? 'شلنا السعر المستهدف' : 'Target cleared', 'success');
    },
  });

  useEffect(() => {
    if (!user) return;
    setLive(false);
    const stop = client.subscribe(() => {
      setLive(true);
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });
    return stop;
  }, [client, queryClient, user]);

  if (!user) {
    return (
      <SignInGate emoji="👀" ar="قايمة المتابعة" en="Watchlist" ledeAr="تابع المنتجات اللي نفسك فيها، وحط السعر اللي تستناه، وسيب الباقي علينا." ledeEn="Follow the products you want, set your target price, and leave the rest to us." />
    );
  }

  return (
    <div>
      <PageHeader icon={<Eye className="h-6 w-6" />} title={t('nav.watchlist')} lede={locale === 'ar' ? 'المنتجات اللي بتراقبها، وقربها من السعر اللي حطيته.' : 'Products you watch and how close they are to your target.'}>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-accent px-3 py-1 text-xs">{live ? t('watch.synced') : t('watch.connecting')}</span>
          <Button variant="outline" size="sm" disabled={!list.data?.items.length} onClick={() => downloadFile('safqa-watchlist.csv', toCsv([['product', 'store', 'price_egp', 'target_egp', 'added'], ...(list.data?.items ?? []).map((w) => [w.product.titleEn, w.product.bestOffer?.store.nameEn ?? '', w.product.bestOffer?.priceEgp ?? '', w.targetPriceEgp ?? '', w.createdAt.slice(0, 10)])]), 'text/csv')}><Download className="h-4 w-4" />CSV</Button>
        </div>
      </PageHeader>
      {list.isLoading ? <StateMessage kind="loading" /> : null}
      {list.isError ? <StateMessage kind="error" onRetry={() => void list.refetch()} /> : null}
      {list.data && list.data.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center" role="status">
          <p className="text-4xl" aria-hidden="true">🛎️</p>
          <p className="mx-auto mt-3 max-w-md text-[15px]">{t('watch.empty')}</p>
          <Link to="/radar" className="press mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">{locale === 'ar' ? 'شوف أحسن العروض' : 'See the best deals'}</Link>
        </div>
      ) : null}
      <div className="space-y-3">
        {list.data?.items.map((item) => {
          const offer = item.product.bestOffer;
          return (
            <article key={item.id} className="glass lift grid gap-3 rounded-3xl p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <Link to="/product/$id" params={{ id: item.product.id }} className="font-semibold">
                  {localized(locale, { ar: item.product.titleAr, en: item.product.titleEn })}
                </Link>
                <p className="num mt-1 text-lg">{offer ? formatEGP(offer.priceEgp, locale) : '—'}</p>
                {offer && item.targetPriceEgp ? (
                  <div className="mt-2 max-w-xs">
                    <div className="h-2 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full" style={{ width: `${Math.min(100, (item.targetPriceEgp / offer.priceEgp) * 100)}%`, background: offer.priceEgp <= item.targetPriceEgp ? 'var(--palm)' : 'var(--saffron)' }} /></div>
                    <p className="mt-1 text-xs text-muted">{offer.priceEgp <= item.targetPriceEgp ? (locale === 'ar' ? '🎯 وصل لهدفك!' : '🎯 Target hit!') : locale === 'ar' ? `فاضل ${formatEGP(offer.priceEgp - item.targetPriceEgp, locale)} (${(((offer.priceEgp - item.targetPriceEgp) / offer.priceEgp) * 100).toFixed(1)}%)` : `${formatEGP(offer.priceEgp - item.targetPriceEgp, locale)} to go (${(((offer.priceEgp - item.targetPriceEgp) / offer.priceEgp) * 100).toFixed(1)}%)`}</p>
                  </div>
                ) : null}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const raw = String(data.get('target') ?? '');
                  update.mutate({ id: item.id, target: raw ? Number(raw) : null });
                }}
              >
                <Input name="target" inputMode="numeric" aria-label={t('product.target')} title={t('product.targetHint')} className="w-32" defaultValue={item.targetPriceEgp ?? ''} placeholder={t('watch.target')} />
                <Button type="submit" size="sm" variant="outline">
                  {t('action.save')}
                </Button>
              </form>
              <Button variant="ghost" size="sm" aria-label={locale === 'ar' ? `بطّل تراقب ${item.product.titleAr}` : `Stop watching ${item.product.titleEn}`} onClick={() => remove.mutate({ id: item.id, productId: item.product.id, target: item.targetPriceEgp ?? null })}>
                {t('action.unwatch')}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
