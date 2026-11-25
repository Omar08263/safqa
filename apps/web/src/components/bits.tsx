import { useEffect, useState } from 'react';
import { formatEGP, localized, type Locale, type ProductCard } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { GitCompare, ShieldAlert, Star } from 'lucide-react';
import { ProductThumb } from '../features/visuals';
import { Skeleton, useToast } from '../fx/fx';
import { useCompare } from '../lib/compare';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { heatLevel } from '../brand/tokens';

export function ScoreRing({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  // Heat colors (packages/brand/tokens.json): slate → blue → yellow → orange → red-hot.
  const heat = heatLevel(score);
  const color = 'var(--heat)';
  const px = size === 'lg' ? 88 : size === 'sm' ? 42 : 54;
  const r = px / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className={`temp-${heat} relative flex-none ${heat === 4 ? 'drop-shadow-[0_0_10px_rgb(239_68_68_/_0.45)]' : ''}`} style={{ width: px, height: px }} title={`درجة الصفقة ${score}/100 · Deal score`} role="img" aria-label={`Deal score ${score} of 100`}>
      <svg width={px} height={px} className="-rotate-90" aria-hidden="true">
        <circle cx={px / 2} cy={px / 2} r={r} stroke="var(--chip)" strokeWidth={size === 'sm' ? 5 : 6} fill="none" />
        <circle cx={px / 2} cy={px / 2} r={r} stroke={color} strokeWidth={size === 'sm' ? 5 : 6} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="ring-anim" style={{ ['--c' as string]: c }} />
      </svg>
      <span className={`num absolute inset-0 grid place-items-center font-bold ${size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm'}`}>{score}</span>
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
  const pct = offer.discountPct ? Math.round(offer.discountPct) : 0;
  return (
    <article className="spotlight lift group relative flex h-full flex-col rounded-3xl border border-border bg-card p-2.5 [content-visibility:auto] sm:p-3">
      <Link to="/product/$id" params={{ id: product.id }} className="absolute inset-0 z-10 rounded-3xl" aria-label={`${title} — ${formatEGP(offer.priceEgp, locale)}`} />
      <div className="relative">
        <ProductThumb id={product.id} slug={product.category?.slug} seed={index} alt={title} />
        <div className="pointer-events-none absolute start-2 top-2 flex flex-col items-start gap-1">
          {pct > 0 && !offer.fakeDiscount ? <span className={`num temp temp-${pct >= 40 ? 4 : pct >= 25 ? 3 : pct >= 15 ? 2 : pct >= 5 ? 1 : 0} !px-2 !py-0.5 !text-[11px] leading-4`}>-{pct}%</span> : null}
          {offer.fakeDiscount ? <span className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[11px] font-bold leading-4 text-white"><ShieldAlert className="h-3 w-3" />{t('deal.fake')}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            const r = compare.toggle(product.id);
            if (r === 'full') toast(tr('المقارنة مليانة (4 منتجات). شيل واحد الأول 🙏', 'Compare is full (4). Remove one first'), 'error');
            else if (r === 'added') toast(tr('اتضاف للمقارنة ✓', 'Added to compare ✓'), 'success', { action: { label: tr('تراجع', 'Undo'), onClick: () => compare.toggle(product.id) } });
            else toast(tr('اتشال من المقارنة', 'Removed from compare'), 'info', { action: { label: tr('رجّعه', 'Undo'), onClick: () => compare.toggle(product.id) } });
          }}
          className={`press absolute end-2 top-2 z-20 grid h-9 w-9 place-items-center rounded-full shadow-sm transition ${inCompare ? 'bg-primary text-primary-foreground' : 'bg-white/90 text-[#1c1915] hover:bg-white'}`}
          aria-pressed={inCompare}
          aria-label={inCompare ? tr('شيل من المقارنة', 'Remove from compare') : tr('ضيف للمقارنة', 'Add to compare')}
          title={inCompare ? tr('شيل من المقارنة', 'Remove from compare') : tr('ضيف للمقارنة', 'Add to compare')}
        >
          <GitCompare className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-1 flex-col px-1">
        <p className="t-meta flex items-center gap-1.5 truncate">
          <span className="truncate font-semibold">{store}</span>
          {offer.rating ? <span className="num inline-flex flex-none items-center gap-0.5"><Star className="h-3 w-3 fill-[var(--saffron)] text-[var(--saffron)]" />{offer.rating.toFixed(1)}</span> : null}
        </p>
        <h3 className="t-title mt-1" title={title}>{title}</h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="t-price">{formatEGP(offer.priceEgp, locale)}</p>
            <p className="t-meta num mt-0.5 flex h-4 items-center gap-1.5 truncate">
              {offer.listPriceEgp && offer.listPriceEgp > offer.priceEgp ? <span className="line-through">{formatEGP(offer.listPriceEgp, locale)}</span> : null}
              {!offer.inStock ? <span className="text-destructive">{t('deal.outOfStock')}</span> : product.offerCount > 1 ? <span>{tr(`${product.offerCount} متاجر`, `${product.offerCount} stores`)}</span> : null}
            </p>
          </div>
          <ScoreRing score={offer.dealScore} size="sm" />
        </div>
      </div>
    </article>
  );
}

const LOADING_LINES = {
  ar: ['ثواني وبنجيب أحدث الأسعار…', 'بنقارن المتاجر ببعض…', 'بنشوف الخصم ده حقيقي ولا لأ…', 'بنرسم تاريخ السعر…'],
  en: ['Fetching the latest prices…', 'Comparing stores…', 'Checking if that discount is real…', 'Drawing the price history…'],
};

/** A friendly line that changes every 1.6 s while something loads. */
export function LoadingLine() {
  const { locale } = usePrefs();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => n + 1), 1600);
    return () => window.clearInterval(id);
  }, []);
  const lines = LOADING_LINES[locale === 'ar' ? 'ar' : 'en'];
  return <p className="t-meta text-center text-muted" aria-live="polite">{lines[i % lines.length]}</p>;
}

export function StateMessage({ kind, onRetry }: { kind: 'loading' | 'error' | 'empty'; onRetry?: () => void }) {
  const { t } = usePrefs();
  if (kind === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true">
      <LoadingLine />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="space-y-3 rounded-3xl border border-border bg-card p-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-7 w-1/2" />
          </div>
        ))}
      </div>
      </div>
    );
  }
  const emoji = kind === 'error' ? '🛠️' : '🧺';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="text-4xl" aria-hidden="true">{emoji}</p>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed">{kind === 'error' ? t('common.error') : t('home.empty')}</p>
      {kind === 'error' && onRetry ? (
        <button type="button" className="press mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground" onClick={onRetry}>{t('action.retry')}</button>
      ) : null}
    </div>
  );
}

export function money(value: number | null | undefined, locale: Locale) {
  if (value == null) return '—';
  return formatEGP(value, locale);
}
