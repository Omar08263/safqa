import { formatEGP, localized, type MessageKey } from '@safqa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BadgePercent, Calculator, Download, ExternalLink, GitCompare, Layers, PartyPopper, Printer, ShieldAlert, ShoppingBag, Sparkles, Star, Target, TrendingDown } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { ScoreRing } from '../components/bits';
import { Markdown } from '../components/markdown';
import { ChangeLog, PercentileBar, RangeChart, ScoreBreakdown, StoreSpread, historyStats } from '../components/product-extras';
import { appUrl, ShareBar } from '../components/share';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ProductArt } from '../features/visuals';
import { Card, confetti, Reveal, Skeleton, useToast } from '../fx/fx';
import { type Collection, keys, type Purchase, track } from '../lib/activity';
import { useCompare } from '../lib/compare';
import { downloadFile, toCsv, useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { PriceFreshness, StaleBadge } from '../components/price-freshness';
import { useTr } from '../lib/tr';

const roleNames: Record<string, [string, string]> = {
  historian: ['المؤرخ', 'Historian'],
  skeptic: ['المشكّك', 'Skeptic'],
  advocate: ['المحامي', 'Advocate'],
  judge: ['القاضي', 'Judge'],
};

export function ProductPage({ id }: { id: string }) {
  const { client, user } = useSession();
  const { t, locale } = usePrefs();
  const tr = useTr();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compare = useCompare();
  const [collections, setCollections] = useLocal<Collection[]>(keys.collections, []);
  const [, setPurchases] = useLocal<Purchase[]>(keys.purchases, []);
  const [target, setTarget] = useState('');
  const product = useQuery({ queryKey: ['product', id], queryFn: () => client.product(id) });
  const history = useQuery({ queryKey: ['history', id], queryFn: () => client.history(id) });
  const debate = useQuery({ queryKey: ['debate', id], queryFn: () => client.debate(id) });
  const prediction = useQuery({ queryKey: ['prediction', id], queryFn: () => client.prediction(id) });
  const stack = useQuery({ queryKey: ['stack', id], queryFn: () => client.stack(id) });
  const watch = useMutation({
    mutationFn: () => client.addWatch(id, target ? Number(target) : null),
    onSuccess: async () => {
      toast(t('watch.synced'));
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: () => toast(tr('مقدرتش أضيفه للمراقبة', 'Could not add to watchlist'), 'error'),
  });

  useEffect(() => track.view(id), [id]);

  if (product.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="h-80" />
        <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-12 w-1/3" /><Skeleton className="h-40" /></div>
      </div>
    );
  }
  if (product.isError || !product.data) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <p>{t('common.error')}</p>
        <Button className="mt-3" variant="outline" onClick={() => void product.refetch()}>{t('action.retry')}</Button>
      </div>
    );
  }

  const item = product.data;
  const title = localized(locale, { ar: item.titleAr, en: item.titleEn });
  const best = item.bestOffer;
  const stats = history.data ? historyStats(history.data) : null;
  const suggestions = [item.min90, item.median30 ? Math.round((item.median30 * 0.9) / 50) * 50 : null, best ? Math.round((best.priceEgp * 0.95) / 50) * 50 : null].filter((v): v is number => typeof v === 'number' && v > 0);

  function onWatch(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      void navigate({ to: '/login' });
      return;
    }
    watch.mutate();
  }
  function addToCollection(cid: string) {
    setCollections(collections.map((c) => (c.id === cid ? { ...c, ids: c.ids.includes(id) ? c.ids : [...c.ids, id] } : c)));
    toast(tr('اتضاف للمجموعة', 'Added to collection'));
  }
  function logPurchase(e: React.MouseEvent) {
    if (!best) return;
    const reference = item.median30 ?? best.listPriceEgp ?? best.priceEgp;
    setPurchases((list) => [{ id: crypto.randomUUID(), title, paidEgp: stack.data?.finalEgp ?? best.priceEgp, referenceEgp: reference, at: new Date().toISOString(), productId: id }, ...list]);
    const saved = reference - (stack.data?.finalEgp ?? best.priceEgp);
    if (saved > 0) confetti({ x: e.clientX, y: e.clientY });
    toast(saved > 0 ? tr(`مبروك! وفّرت ${formatEGP(saved, locale)} 🎉`, `Nice! You saved ${formatEGP(saved, locale)} 🎉`) : tr('اتسجّلت في متتبع التوفير', 'Logged in your savings tracker'));
  }
  function exportCsv() {
    if (!history.data) return;
    const rows: (string | number)[][] = [['store', 'date', 'price_egp']];
    for (const s of history.data.series) for (const p of s.points) rows.push([s.storeNameEn, p.t.slice(0, 10), p.priceEgp]);
    downloadFile(`safqa-${item.model ?? id}-history.csv`, toCsv(rows), 'text/csv');
    track.tool('csv');
  }

  return (
    <div className="space-y-8">
      <nav className="text-xs text-muted" aria-label="breadcrumb">
        <Link to="/">{tr('الرئيسية', 'Home')}</Link> / <Link to="/categories">{tr('الأقسام', 'Categories')}</Link> / <Link to="/search" search={{ category: item.category?.slug }}>{item.category ? localized(locale, { ar: item.category.nameAr, en: item.category.nameEn }) : ''}</Link>
      </nav>
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr] [&>*]:min-w-0">
        <Reveal><ProductArt slug={item.category?.slug} className="h-72 sm:h-96" /></Reveal>
        <div>
          <p className="text-sm font-semibold text-primary">{item.brand} {item.model ? `· ${item.model}` : ''}</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
            {best ? <ScoreRing score={best.dealScore} size="lg" /> : null}
          </div>
          {best ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <p className="num text-5xl font-bold">{formatEGP(best.priceEgp, locale)}</p>
              {best.listPriceEgp ? <p className="num pb-1 text-lg text-muted line-through">{formatEGP(best.listPriceEgp, locale)}</p> : null}
              {best.discountPct ? <span className={`mb-1 rounded-full px-3 py-1 text-sm font-bold ${best.fakeDiscount ? 'bg-destructive/15 text-destructive' : 'bg-[var(--palm)]/15 text-palm'}`}>-{Math.round(best.discountPct)}%</span> : null}
            </div>
          ) : null}
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">{t('deal.best')} · {best ? localized(locale, { ar: best.store.nameAr, en: best.store.nameEn }) : ''}{best?.rating ? <span className="inline-flex items-center gap-0.5"><Star className="h-3.5 w-3.5 fill-[var(--saffron)] text-[var(--saffron)]" />{best.rating}</span> : null}</p>
          <div className="mt-3"><PriceFreshness compact /></div>

          {prediction.data ? (
            <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 text-sm ${prediction.data.recommendation === 'buy_now' ? 'bg-[var(--palm)]/12' : 'bg-primary/12'}`}>
              <TrendingDown className="mt-0.5 h-5 w-5 flex-none text-primary" />
              <div>
                <p className="font-bold">{t('predict.title')}: {prediction.data.recommendation === 'buy_now' ? tr('اشتري دلوقتي', 'Buy now') : tr('استنى شوية', 'Wait')} <span className="text-xs font-normal text-muted">({tr('ثقة', 'confidence')} {Math.round(prediction.data.confidence * 100)}%)</span></p>
                <p className="mt-0.5 text-muted">{locale === 'ar' ? prediction.data.reasonAr : prediction.data.reasonEn}</p>
              </div>
            </div>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-accent p-3"><dt className="text-muted">{t('deal.median30')}</dt><dd className="num mt-1 font-semibold">{item.median30 ? formatEGP(item.median30, locale) : '—'}</dd></div>
            <div className="rounded-2xl bg-accent p-3"><dt className="text-muted">{t('deal.min90')}</dt><dd className="num mt-1 font-semibold">{item.min90 ? formatEGP(item.min90, locale) : '—'}</dd></div>
            <div className="col-span-2 rounded-2xl bg-accent p-3 sm:col-span-1"><dt className="text-muted">{tr('توقّع أقل سعر', 'Expected low')}</dt><dd className="num mt-1 font-semibold">{prediction.data?.expectedLowEgp ? formatEGP(prediction.data.expectedLowEgp, locale) : '—'}</dd></div>
          </dl>

          <form onSubmit={onWatch} className="mt-5 rounded-2xl border border-border p-4">
            <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="target"><Target className="h-4 w-4 text-primary" />{t('product.target')}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input id="target" className="w-40" inputMode="numeric" value={target} placeholder={String(suggestions[0] ?? '')} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))} />
              <Button type="submit" disabled={watch.isPending}>{t('action.watch')}</Button>
            </div>
            {suggestions.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">{tr('اقتراحات:', 'Suggestions:')}</span>
                {[...new Set(suggestions)].map((s, i) => (
                  <button key={s} type="button" onClick={() => setTarget(String(s))} className="rounded-full border border-border px-2 py-0.5 hover:border-primary">
                    <span className="num">{formatEGP(s, locale)}</span> <span className="text-muted">{[tr('قاع ٩٠ يوم', '90d low'), tr('١٠٪ تحت الوسيط', '10% under median'), tr('٥٪ تحت الحالي', '5% under now')][i]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-muted">{t('product.targetHint')}</p>
          </form>

          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Button variant={compare.has(id) ? 'default' : 'outline'} size="sm" onClick={() => { const r = compare.toggle(id); if (r === 'full') toast(tr('المقارنة مليانة (٤)', 'Compare is full (4)'), 'error'); }}><GitCompare className="h-4 w-4" />{compare.has(id) ? tr('في المقارنة', 'In compare') : tr('قارن', 'Compare')}</Button>
            {collections.length ? (
              <select aria-label={tr('ضيف لمجموعة', 'Add to collection')} className="h-8 rounded-full border border-border bg-card px-3 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) addToCollection(e.target.value); e.target.value = ''; }}>
                <option value="">{tr('+ ضيف لمجموعة', '+ Add to collection')}</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            ) : (
              <Link to="/collections"><Button variant="outline" size="sm"><Layers className="h-4 w-4" />{tr('اعمل مجموعة', 'New collection')}</Button></Link>
            )}
            <Button variant="outline" size="sm" onClick={logPurchase}><ShoppingBag className="h-4 w-4" />{tr('اشتريته', 'I bought it')}</Button>
            <Link to="/tools" search={{ price: best?.priceEgp }}><Button variant="outline" size="sm"><Calculator className="h-4 w-4" />{tr('قسّطه', 'Installments')}</Button></Link>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />{tr('اطبع', 'Print')}</Button>
          </div>
          <div className="no-print mt-3"><ShareBar url={appUrl(`/product/${id}`)} title={title} /></div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('product.history')}</h2>
          {history.data && history.data.series.length > 0 ? <RangeChart history={history.data} /> : <Skeleton className="h-72" />}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-primary" />{tr('ليه التقييم ده؟', 'Why this score?')}</h2>
            <ScoreBreakdown item={item} />
          </Card>
          {best && stats ? (
            <Card>
              <h2 className="text-lg font-bold">{tr('السعر فين من مداه؟', 'Where is the price in its range?')}</h2>
              <PercentileBar price={best.priceEgp} min={stats.min} max={stats.max} />
            </Card>
          ) : null}
        </div>
      </div>

      <StoreSpread item={item} />

      {item.offers.some((o) => o.fakeDiscount) ? (
        <Reveal>
          <section className="rounded-3xl border border-destructive/40 bg-destructive/5 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-destructive"><ShieldAlert className="h-5 w-5" />{tr('كاشف الخصم المضروب', 'Fake-discount detector')}</h2>
            <p className="mt-2 text-sm leading-7">{tr('صفقة بتقارن "السعر قبل الخصم" اللي المتجر كاتبه بأعلى سعر فعلي اتسجّل في آخر ٩٠ يوم. لو المتجر كاتب سعر قديم عمره ما اتباع بيه، أو السعر "بعد الخصم" مش أقل من الوسيط، بنعلّم العرض إنه مشبوه.', 'Safqa compares the store\'s "was" price with the highest price actually recorded in the last 90 days. If the "was" price never existed, or the "now" price is not below the median, the offer is flagged.')}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {item.offers.filter((o) => o.fakeDiscount).map((o) => (
                <li key={o.id} className="rounded-2xl bg-card p-3">
                  <span className="font-semibold">{localized(locale, { ar: o.store.nameAr, en: o.store.nameEn })}</span>: {tr('مكتوب قبل الخصم', 'claims was')} <span className="num">{formatEGP(o.listPriceEgp ?? 0, locale)}</span>{stats ? <>, {tr('أعلى سعر فعلي', 'highest real price')} <span className="num font-semibold">{formatEGP(stats.max, locale)}</span></> : null}. {o.fakeDiscountReason === 'inflated_was' ? t('deal.fakeInflated') : o.fakeDiscountReason === 'illusory_discount' ? t('deal.fakeIllusory') : ''}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      ) : null}

      <section>
        <h2 className="mb-3 text-xl font-bold">{t('product.offers')}</h2>
        <div className="overflow-hidden rounded-3xl border border-border">
          {[...item.offers].sort((a, b) => a.priceEgp - b.priceEgp).map((offer) => {
            const reasonKey: MessageKey | null = offer.fakeDiscountReason === 'inflated_was' ? 'deal.fakeInflated' : offer.fakeDiscountReason === 'illusory_discount' ? 'deal.fakeIllusory' : null;
            return (
              <article key={offer.id} className="grid gap-3 border-b border-border bg-card p-4 transition last:border-b-0 hover:bg-accent/40 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="font-semibold">{localized(locale, { ar: offer.store.nameAr, en: offer.store.nameEn })}</p>
                  <p className="text-xs text-muted">{offer.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{offer.inStock ? t('deal.inStock') : t('deal.outOfStock')}</Badge>
                    {offer.condition === 'used' ? <Badge>{t('deal.used')}</Badge> : null}
                    {offer.fakeDiscount ? <Badge className="border-destructive text-destructive">{t('deal.fake')}</Badge> : null}
                    <Badge>{t(`deal.${offer.dealLabel}`)} · {offer.dealScore}</Badge>
                    <StaleBadge offerId={offer.id} />
                  </div>
                  {reasonKey ? <p className="mt-2 text-xs text-destructive">{t(reasonKey)}</p> : null}
                </div>
                <div>
                  <p className="num text-xl font-bold">{formatEGP(offer.priceEgp, locale)}</p>
                  {offer.listPriceEgp ? <p className="text-xs text-muted line-through">{formatEGP(offer.listPriceEgp, locale)}</p> : null}
                </div>
                <a className="inline-flex items-center gap-1 text-sm font-semibold text-primary" href={offer.url} target="_blank" rel="noreferrer">{t('action.openStore')} <ExternalLink className="h-3.5 w-3.5" /></a>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {stack.data && stack.data.savedEgp > 0 && best ? (
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold"><BadgePercent className="h-5 w-5 text-primary" />{tr('مُجمّع الكوبونات', 'Coupon stacker')}</h2>
            <p className="mt-1 text-sm text-muted">{tr('أحسن ترتيب للكوبونات وعروض البنوك على العرض ده:', 'Best order of coupons and bank offers on this deal:')}</p>
            <ol className="mt-3 space-y-2">
              <li className="flex justify-between text-sm"><span>{tr('السعر', 'Price')}</span><span className="num">{formatEGP(best.priceEgp, locale)}</span></li>
              {stack.data.applied.map((line, i) => (
                <li key={line.id} className="flex justify-between rounded-xl bg-accent px-3 py-2 text-sm"><span>{i + 1}. <span className="font-semibold">{line.label}</span></span><span className="num text-palm">-{formatEGP(line.savedEgp, locale)}</span></li>
              ))}
              <li className="flex justify-between border-t border-border pt-2 font-bold"><span>{tr('هتدفع', 'You pay')}</span><span className="num text-lg">{formatEGP(stack.data.finalEgp, locale)}</span></li>
            </ol>
            <Button size="sm" className="mt-3" onClick={(e) => { confetti({ x: e.clientX, y: e.clientY, count: 80 }); toast(tr(`توفير ${formatEGP(stack.data?.savedEgp ?? 0, locale)} بالكوبونات`, `${formatEGP(stack.data?.savedEgp ?? 0, locale)} saved with coupons`)); }}><PartyPopper className="h-4 w-4" />{tr(`وفّر ${formatEGP(stack.data.savedEgp, locale)}`, `Save ${formatEGP(stack.data.savedEgp, locale)}`)}</Button>
          </Card>
        ) : null}
        {history.data ? (
          <Card>
            <h2 className="mb-3 text-lg font-bold">{tr('سجل تغيّر السعر', 'Price change log')}</h2>
            <ChangeLog history={history.data} />
          </Card>
        ) : null}
      </div>

      <section aria-labelledby="agent-debate">
        <h2 id="agent-debate" className="mb-3 text-xl font-bold">{t('debate.title')}</h2>
        {debate.data ? (
          <div className="space-y-3">
            <div className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5">
              <ScoreRing score={debate.data.score} />
              <div className="flex-1">
                <p className="text-lg font-bold">{t(`debate.${debate.data.recommendation}`)}</p>
                <p className="leading-7 text-muted">{locale === 'ar' ? debate.data.explanationAr : debate.data.explanationEn}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {debate.data.turns.filter((turn) => turn.kind === 'message').map((turn, index) => (
                <Reveal key={`${turn.role}-${index}`} delay={index * 80}>
                  <article className="h-full rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-bold text-primary">{roleNames[turn.role] ? roleNames[turn.role]?.[locale === 'ar' ? 0 : 1] : turn.role}</p>
                    <div className="mt-1 text-sm [overflow-wrap:anywhere]"><Markdown text={turn.content} /></div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">{debate.isError ? t('common.error') : t('debate.empty')}</p>
        )}
      </section>
    </div>
  );
}
