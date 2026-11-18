import { formatEGP, localized, type Locale, type ProductCard } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { usePrefs } from '../lib/prefs';

export function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--palm)' : score >= 65 ? 'var(--saffron)' : score >= 45 ? 'var(--muted)' : 'var(--clay)';
  return (
    <div className="score-ring" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, var(--chip) 0)` }}>
      <span className="num">{score}</span>
    </div>
  );
}

export function DealCard({ product }: { product: ProductCard }) {
  const { locale, t } = usePrefs();
  const offer = product.bestOffer;
  if (!offer) return null;
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const store = localized(locale, { ar: offer.store.nameAr, en: offer.store.nameEn });
  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-4 shadow-[0_16px_40px_-32px_rgba(28,25,21,0.7)] transition hover:-translate-y-0.5 [content-visibility:auto]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted">{store}</p>
          <h3 className="mt-1 text-base font-semibold leading-snug">{title}</h3>
        </div>
        <ScoreRing score={offer.dealScore} />
      </div>
      <div>
        <p className="num text-2xl font-semibold">{formatEGP(offer.priceEgp, locale)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {offer.listPriceEgp ? (
            <span className="line-through">{formatEGP(offer.listPriceEgp, locale)}</span>
          ) : null}
          {offer.discountPct ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-foreground">
              {t('deal.save')} {offer.discountPct}%
            </span>
          ) : null}
          {offer.fakeDiscount ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{t('deal.fake')}</span>
          ) : null}
          {!offer.inStock ? <span>{t('deal.outOfStock')}</span> : null}
          {offer.condition === 'used' ? <span>{t('deal.used')}</span> : null}
        </div>
      </div>
      <p className="text-xs text-muted">
        {product.offerCount} {t('deal.offers')}
      </p>
    </Link>
  );
}

export function StateMessage({ kind, onRetry }: { kind: 'loading' | 'error' | 'empty'; onRetry?: () => void }) {
  const { t } = usePrefs();
  if (kind === 'loading') {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="h-44 animate-pulse rounded-3xl bg-accent" />
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p>{kind === 'error' ? t('common.error') : t('home.empty')}</p>
      {kind === 'error' && onRetry ? (
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={onRetry}>
          {t('action.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function money(value: number | null | undefined, locale: Locale) {
  if (value == null) return '—';
  return formatEGP(value, locale);
}
