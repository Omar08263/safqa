import { formatEGP, localized, type Locale, type ProductCard } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { GitCompare, ShieldAlert, Star } from 'lucide-react';
import { ProductArt } from '../features/visuals';
import { Skeleton, useToast } from '../fx/fx';
import { useCompare } from '../lib/compare';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export function ScoreRing({ score, size = 'md' }: { score: number; size?: 'md' | 'lg' }) {
  const color = score >= 80 ? 'var(--palm)' : score >= 65 ? 'var(--saffron)' : score >= 45 ? 'var(--muted)' : 'var(--clay)';
  const px = size === 'lg' ? 88 : 54;
  const r = px / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex-none" style={{ width: px, height: px }} title={`${score}/100`}>
      <svg width={px} height={px} className="-rotate-90">
        <circle cx={px / 2} cy={px / 2} r={r} stroke="var(--chip)" strokeWidth="6" fill="none" />
        <circle cx={px / 2} cy={px / 2} r={r} stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="ring-anim" style={{ ['--c' as string]: c }} />
      </svg>
      <span className={`num absolute inset-0 grid place-items-center font-bold ${size === 'lg' ? 'text-2xl' : 'text-sm'}`}>{score}</span>
    </div>
  );
}

export function DealCard({ product, index = 0 }: { product: ProductCard; index?: number }) {
  const { locale, t } = usePrefs();
  const tr = useTr();
  const toast = useToast();
  const compare = useCompare();
  const offer = product.bestOffer;
  if (!offer) return null;
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const store = localized(locale, { ar: offer.store.nameAr, en: offer.store.nameEn });
  const inCompare = compare.has(product.id);
  return (
    <div className="spotlight lift group relative flex flex-col gap-3 rounded-3xl border border-border bg-card p-3 [content-visibility:auto]">
      <Link to="/product/$id" params={{ id: product.id }} className="absolute inset-0 z-10 rounded-3xl" aria-label={title} />
      <div className="relative">
        <ProductArt slug={product.category?.slug} seed={index} />
        <div className="absolute start-2 top-2 flex gap-1.5">
          {offer.discountPct ? <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white backdrop-blur">-{Math.round(offer.discountPct)}%</span> : null}
          {offer.fakeDiscount ? <span className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white"><ShieldAlert className="h-3 w-3" />{t('deal.fake')}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            const r = compare.toggle(product.id);
            toast(r === 'full' ? tr('المقارنة فيها 4 منتجات بالفعل', 'Compare already has 4 products') : r === 'added' ? tr('اتضاف للمقارنة', 'Added to compare') : tr('اتشال من المقارنة', 'Removed from compare'), r === 'full' ? 'error' : 'success');
          }}
          className={`absolute end-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${inCompare ? 'bg-primary text-primary-foreground' : 'bg-white/70 text-[#1c1915] opacity-90 hover:opacity-100'}`}
          aria-pressed={inCompare}
          aria-label={tr('قارن', 'Compare')}
          title={tr('ضيف للمقارنة', 'Add to compare')}
        >
          <GitCompare className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{store}{offer.rating ? <span className="ms-2 inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-[var(--saffron)] text-[var(--saffron)]" />{offer.rating}</span> : null}</p>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug">{title}</h3>
        </div>
        <ScoreRing score={offer.dealScore} />
      </div>
      <div className="px-1 pb-1">
        <p className="num text-2xl font-bold">{formatEGP(offer.priceEgp, locale)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {offer.listPriceEgp ? <span className="line-through">{formatEGP(offer.listPriceEgp, locale)}</span> : null}
          {!offer.inStock ? <span>{t('deal.outOfStock')}</span> : null}
          {offer.condition === 'used' ? <span>{t('deal.used')}</span> : null}
          <span className="ms-auto">{product.offerCount} {t('deal.offers')}</span>
        </div>
      </div>
    </div>
  );
}

export function StateMessage({ kind, onRetry }: { kind: 'loading' | 'error' | 'empty'; onRetry?: () => void }) {
  const { t } = usePrefs();
  if (kind === 'loading') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="space-y-3 rounded-3xl border border-border bg-card p-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-7 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p>{kind === 'error' ? t('common.error') : t('home.empty')}</p>
      {kind === 'error' && onRetry ? (
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={onRetry}>{t('action.retry')}</button>
      ) : null}
    </div>
  );
}

export function money(value: number | null | undefined, locale: Locale) {
  if (value == null) return '—';
  return formatEGP(value, locale);
}
