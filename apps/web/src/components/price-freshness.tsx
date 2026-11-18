import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export interface PriceStatus {
  updatedAt: string;
  timeZone?: string;
  productsWithPrice?: number;
  offersUpdated?: number;
  offersFailed?: number;
  perStore?: Record<string, { ok: number; failed: number }>;
  stale?: { offerId: string; lastOkAt: string; reason?: string }[];
}

/** Written by deploy/hf/refresh-live.sh into the static snapshot. Absent on a live API: the badge hides. */
export function usePriceStatus() {
  return useQuery({
    queryKey: ['price-status'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<PriceStatus | null> => {
      const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/prices/status`);
      if (!res.ok) return null;
      const body = (await res.json()) as PriceStatus;
      return body?.updatedAt ? body : null;
    },
  });
}

export function formatCairo(iso: string, locale: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "آخر تحديث للأسعار" badge with the refresh time in Cairo time. */
export function PriceFreshness({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const status = usePriceStatus();
  const data = status.data;
  if (!data) return null;
  const when = formatCairo(data.updatedAt, locale);
  const stale = data.stale?.length ?? 0;
  return (
    <span
      className={`glass inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full px-3 py-1.5 text-xs font-semibold ${className}`}
      data-testid="price-freshness"
      title={tr('الأسعار متسحبة من صفحات المتاجر نفسها (JSON-LD)، ومن غير أي تخمين.', 'Prices are read from the store pages themselves (JSON-LD), never guessed.')}
    >
      <RefreshCw className="h-3.5 w-3.5 text-[var(--palm)]" aria-hidden="true" />
      <span>{tr('آخر تحديث للأسعار:', 'Last price update:')}</span>
      <time dateTime={data.updatedAt} className="tabular-nums">{when}</time>
      <span className="text-muted">{tr('(بتوقيت القاهرة)', '(Cairo time)')}</span>
      {!compact && data.offersUpdated != null ? (
        <span className="text-muted">· {tr(`${data.offersUpdated} سعر حقيقي`, `${data.offersUpdated} live prices`)}{stale ? tr(` · ${stale} قديم`, ` · ${stale} stale`) : ''}</span>
      ) : null}
    </span>
  );
}

/** Small per-offer note when the last fetch for that offer failed. */
export function useStaleOffer(offerId: string): { lastOkAt: string } | null {
  const status = usePriceStatus();
  const hit = status.data?.stale?.find((s) => s.offerId === offerId);
  return hit ? { lastOkAt: hit.lastOkAt } : null;
}

/** Shown on an offer row when today's refresh could not read that store page. */
export function StaleBadge({ offerId }: { offerId: string }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const stale = useStaleOffer(offerId);
  if (!stale) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--saffron)] px-2 py-0.5 text-xs text-[var(--saffron)]" title={formatCairo(stale.lastOkAt, locale)}>
      {tr('سعر قديم: آخر قراءة ناجحة', 'Stale: last read')} {formatCairo(stale.lastOkAt, locale)}
    </span>
  );
}
