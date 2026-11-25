// Safqa v5 UI kit: deal cards with heat + votes, live drops ticker, prediction gauge, real price chart.
import { formatEGP, localized } from '@safqa/shared';
import { Link } from '@tanstack/react-router';
import { ArrowDownRight, Flame, GitCompare, Radio, Snowflake, Sparkles, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { confetti, useToast } from '../fx/fx';
import { useCompare } from '../lib/compare';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { ago, noteInterest, useLiveDrops, v5, type Prediction, type V5Card } from '../lib/v5';
import { play } from '../lib/sound';

const imgSrc = (u?: string | null, w = 400) => {
  if (!u) return null;
  if (/cdn\.shopify\.com/.test(u)) return u.includes('?') ? `${u}&width=${w}` : `${u}?width=${w}`;
  return u;
};
export function RemoteThumb({ src, alt, slug, className = 'w-full' }: { src?: string | null; alt: string; slug?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  const s = imgSrc(src);
  return (
    <div className={`media-tile group/tile ${className}`}>
      {s && !bad ? (
        <img src={s} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" width={400} height={400} onError={() => setBad(true)} className="transition duration-500 group-hover:scale-[1.05]" />
      ) : (
        <div className="grid h-full w-full place-items-center text-4xl opacity-60" aria-hidden="true">{CAT_EMOJI[slug ?? ''] ?? '🛍️'}</div>
      )}
    </div>
  );
}
export const CAT_EMOJI: Record<string, string> = { phones: '📱', tablets: '📲', laptops: '💻', computing: '🖥️', tvs: '📺', audio: '🎧', lifestyle: '⌚', gaming: '🎮', cameras: '📷', networking: '📶', appliances: '🧺', kitchen: '🍳', 'personal-care': '💈', 'smart-home': '🏠', accessories: '🔌' };

/** Pepper-style temperature, shown as degrees with a flame that flickers harder when hotter. */
export function HeatBadge({ heat, compact = false }: { heat: number; compact?: boolean }) {
  const tr = useTr();
  const level = heat >= 120 ? 'blaze' : heat >= 60 ? 'hot' : heat >= 20 ? 'warm' : 'cool';
  return (
    <span className={`heat heat-${level} num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-4`} title={tr(`سخونة الصفقة ${heat}° (تصويت + نزول حقيقي في السعر)`, `Deal heat ${heat}° (votes + real price drop)`)}>
      {level === 'cool' ? <Snowflake className="h-3 w-3" /> : <Flame className="flame h-3 w-3" />}
      {heat}°{compact ? null : level === 'blaze' ? ' 🔥' : null}
    </span>
  );
}

export function VoteBar({ id, hot, cold, heat, size = 'sm' }: { id: string; hot: number; cold: number; heat: number; size?: 'sm' | 'md' }) {
  const tr = useTr();
  const toast = useToast();
  const [state, setState] = useState({ hot, cold, heat, mine: Number(localStorage.getItem(`safqa.vote.${id}`) ?? 0) });
  async function cast(v: number, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const next = state.mine === v ? 0 : v;
    const prev = state;
    setState({ hot: state.hot + (next === 1 ? 1 : 0) - (state.mine === 1 ? 1 : 0), cold: state.cold + (next === -1 ? 1 : 0) - (state.mine === -1 ? 1 : 0), heat: Math.max(0, state.heat + (next - state.mine) * 12), mine: next });
    if (next === 1) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); confetti({ x: r.left + r.width / 2, y: r.top, count: 18 }); play('success'); navigator.vibrate?.(12); }
    try {
      const res = await v5.vote(id, next);
      setState({ hot: res.hot, cold: res.cold, heat: res.heat, mine: res.mine });
      localStorage.setItem(`safqa.vote.${id}`, String(res.mine));
    } catch {
      setState(prev);
      toast(tr('التصويت مش متاح دلوقتي — جرّب كمان شوية', 'Voting is unavailable right now'), 'error');
    }
  }
  const btn = size === 'md' ? 'h-10 w-10' : 'h-8 w-8';
  return (
    <div className="relative z-20 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 p-0.5 backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => cast(-1, e)} aria-pressed={state.mine === -1} aria-label={tr('صفقة باردة', 'Cold deal')} className={`press grid ${btn} place-items-center rounded-full transition ${state.mine === -1 ? 'bg-sky-500 text-white' : 'text-sky-600 hover:bg-sky-500/10'}`}>
        <Snowflake className="h-4 w-4" />
      </button>
      <span className={`num min-w-9 text-center text-sm font-bold ${state.heat >= 60 ? 'text-[var(--clay)]' : ''}`} aria-live="polite">{state.heat}°</span>
      <button type="button" onClick={(e) => cast(1, e)} aria-pressed={state.mine === 1} aria-label={tr('صفقة سخنة', 'Hot deal')} className={`press grid ${btn} place-items-center rounded-full transition ${state.mine === 1 ? 'bg-[var(--clay)] text-white' : 'text-[var(--clay)] hover:bg-[var(--clay)]/10'}`}>
        <Flame className="h-4 w-4" />
      </button>
    </div>
  );
}

export function V5DealCard({ product, index = 0, showVotes = true }: { product: V5Card; index?: number; showVotes?: boolean }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const compare = useCompare();
  const toast = useToast();
  const offer = product.bestOffer!;
  const x = product.v5;
  const ar = locale === 'ar';
  const title = localized(locale, { ar: product.titleAr, en: product.titleEn });
  const store = localized(locale, { ar: offer.store.nameAr, en: offer.store.nameEn });
  const atLow = x?.low && offer.priceEgp <= x.low && (x?.dropPct ?? 0) > 0;
  const freshDrop = x?.dropAt && Date.now() - Date.parse(x.dropAt) < 72 * 3600_000 && (x.dropPct ?? 0) > 0;
  const claimed = offer.discountPct && offer.discountPct >= 5 ? offer.discountPct : 0;
  const inCompare = compare.has(product.id);
  return (
    <article className={`v5-card spotlight lift group relative flex h-full flex-col rounded-3xl border border-border bg-card p-2.5 [content-visibility:auto] sm:p-3 ${(x?.heat ?? 0) >= 60 ? 'is-hot' : ''}`} style={{ ['--i' as string]: index % 12 }}>
      <Link to="/p/$id" params={{ id: product.id }} onClick={() => noteInterest(product)} className="absolute inset-0 z-10 rounded-3xl" aria-label={`${title} — ${formatEGP(offer.priceEgp, locale)}`} />
      <div className="relative">
        <RemoteThumb src={product.image} alt={title} slug={product.category?.slug} />
        <div className="pointer-events-none absolute start-2 top-2 flex flex-col items-start gap-1">
          {freshDrop ? <span className="num inline-flex items-center gap-0.5 rounded-full bg-palm px-2 py-0.5 text-[11px] font-bold leading-4 text-white"><ArrowDownRight className="h-3 w-3" />{x!.dropPct}%</span> : null}
          {atLow ? <span className="low-badge rounded-full px-2 py-0.5 text-[11px] font-bold leading-4">{tr('أقل سعر', 'Lowest')}</span> : null}
          {!freshDrop && claimed ? <span className="num rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold leading-4 text-white" title={tr('خصم معلن من المتجر', 'Store-claimed discount')}>-{claimed}%</span> : null}
          {product.condition && product.condition !== 'new' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold leading-4 text-amber-900">{product.condition === 'used' ? tr('مستعمل', 'Used') : tr('مجدد', 'Refurb')}</span> : null}
        </div>
        <button type="button" onClick={(e) => { e.preventDefault(); const r = compare.toggle(product.id); toast(r === 'full' ? tr('المقارنة مليانة (4)', 'Compare is full (4)') : r === 'added' ? tr('اتضاف للمقارنة ✓', 'Added to compare ✓') : tr('اتشال من المقارنة', 'Removed from compare'), r === 'full' ? 'error' : 'success'); }}
          className={`press absolute end-2 top-2 z-20 grid h-9 w-9 place-items-center rounded-full shadow-sm transition ${inCompare ? 'bg-primary text-primary-foreground' : 'bg-white/90 text-[#1c1915] hover:bg-white'}`} aria-pressed={inCompare} aria-label={inCompare ? tr('شيل من المقارنة', 'Remove from compare') : tr('ضيف للمقارنة', 'Add to compare')}>
          <GitCompare className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-1 flex-col px-1">
        <p className="t-meta flex items-center gap-1.5 truncate"><span className="truncate font-semibold">{store}</span>{product.offerCount > 1 ? <span className="num flex-none">· {tr(`${product.offerCount} متاجر`, `${product.offerCount} stores`)}</span> : null}</p>
        <h3 className="t-title mt-1" title={title}>{title}</h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="t-price">{formatEGP(offer.priceEgp, locale)}</p>
            <p className="t-meta num mt-0.5 flex h-4 items-center gap-1.5 truncate">
              {offer.listPriceEgp && offer.listPriceEgp > offer.priceEgp ? <span className="line-through">{formatEGP(offer.listPriceEgp, locale)}</span> : x?.checkedAt ? <span>{ago(x.checkedAt, ar)}</span> : null}
              {!offer.inStock ? <span className="text-destructive">{tr('خلصان', 'Out of stock')}</span> : null}
            </p>
          </div>
          {showVotes && x ? <VoteBar id={product.id} hot={x.hot} cold={x.cold} heat={x.heat} /> : x ? <HeatBadge heat={x.heat} /> : null}
        </div>
      </div>
    </article>
  );
}

export function CardGrid({ items, showVotes = true }: { items: V5Card[]; showVotes?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
      {items.map((p, i) => <V5DealCard key={p.id} product={p} index={i} showVotes={showVotes} />)}
    </div>
  );
}

/** Live price drops, pushed over SSE (polling fallback). */
export function LiveTicker() {
  const { locale } = usePrefs();
  const tr = useTr();
  const { items, live } = useLiveDrops(14);
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <section className="live-ticker relative overflow-hidden rounded-2xl border border-border bg-card" aria-label={tr('نزول أسعار مباشر', 'Live price drops')}>
      <div className="absolute inset-y-0 start-0 z-10 flex items-center gap-1.5 bg-gradient-to-l from-transparent via-[var(--elev)] to-[var(--elev)] pe-6 ps-3 rtl:bg-gradient-to-r">
        <span className={`relative grid h-2.5 w-2.5 place-items-center`}><span className={`absolute h-2.5 w-2.5 rounded-full ${live ? 'bg-palm live-dot' : 'bg-muted'}`} /></span>
        <Link to="/drops" className="text-xs font-bold">{tr('مباشر', 'LIVE')}</Link>
      </div>
      <div className="ticker-track flex w-max gap-6 py-2.5 ps-24">
        {row.map((d, i) => (
          <Link key={`${d.dropId}-${i}`} to="/p/$id" params={{ id: d.product.id }} className="flex flex-none items-center gap-2 text-sm hover:text-primary" aria-hidden={i >= items.length ? 'true' : undefined} tabIndex={i >= items.length ? -1 : 0}>
            <TrendingDown className="h-4 w-4 text-palm" />
            <span className="max-w-[16rem] truncate">{localized(locale, { ar: d.product.titleAr, en: d.product.titleEn })}</span>
            <span className="num font-bold text-palm">-{d.pct}%</span>
            <span className="num text-muted">{formatEGP(d.new, locale)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function PredictionCard({ p }: { p: Prediction }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const ar = locale === 'ar';
  const conf = Math.round(p.confidence * 100);
  const map = { buy: ['اشتري دلوقتي', 'Buy now', 'var(--palm)', '🟢'], wait: ['استنى شوية', 'Wait', 'var(--clay)', '⏳'], fair: ['سعر عادي', 'Fair price', 'var(--saffron)', '⚖️'], unknown: ['لسه بنتعلم', 'Learning', 'var(--muted)', '🔭'] } as const;
  const [la, le, color, emoji] = map[p.verdict];
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-4">
      <div className="pointer-events-none absolute -end-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      <p className="t-meta flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" />{tr('توقع صفقة (تقدير من تاريخ السعر)', 'Safqa forecast (estimate from price history)')}</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{emoji}</span>
        <div>
          <p className="text-xl font-bold" style={{ color }}>{ar ? la : le}</p>
          <p className="text-sm text-muted">{ar ? p.reasonAr : p.reasonEn}</p>
        </div>
      </div>
      {p.verdict !== 'unknown' ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted"><span>{tr('الثقة', 'Confidence')}</span><span className="num">{conf}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-accent"><div className="bar-grow h-full rounded-full" style={{ width: `${conf}%`, background: color }} /></div>
          {p.low90 ? <p className="num mt-2 text-xs text-muted">{tr(`أقل سعر ٩٠ يوم: ${formatEGP(p.low90, locale)} · المتوسط: ${formatEGP(p.median ?? 0, locale)}`, `90-day low ${formatEGP(p.low90, locale)} · median ${formatEGP(p.median ?? 0, locale)}`)}</p> : null}
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-muted">{tr('تقدير إحصائي مش وعد — الأسعار ممكن تتغير في أي وقت.', 'A statistical estimate, not a promise.')}</p>
    </div>
  );
}

export function SeriesChart({ series, low }: { series: { at: string; price: number }[]; low?: number | null }) {
  const { locale } = usePrefs();
  const tr = useTr();
  if (series.length < 2) {
    return <div className="grid h-48 place-items-center rounded-2xl bg-accent/50 p-4 text-center text-sm text-muted">{tr('بدأنا نسجّل سعر المنتج ده — الرسم البياني هيظهر مع أول تغيير حقيقي في السعر 📈', 'We just started tracking this product; the chart appears with the first real price change')}</div>;
  }
  const pts = [...series, { at: new Date().toISOString(), price: series[series.length - 1]!.price }];
  const data = pts.map((p) => ({ t: new Date(p.at).toLocaleDateString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }), price: p.price }));
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="v5fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--saffron)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--saffron)" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56} domain={['dataMin - 100', 'dataMax + 100']} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))} />
          <Tooltip formatter={(v: number) => [formatEGP(v, locale), tr('أحسن سعر', 'Best price')]} contentStyle={{ background: 'var(--elev)', border: '1px solid var(--line)', borderRadius: 12 }} />
          {low ? <ReferenceLine y={low} stroke="var(--palm)" strokeDasharray="4 4" label={{ value: tr('أقل سعر', 'Low'), fill: 'var(--palm)', fontSize: 11, position: 'insideTopLeft' }} /> : null}
          <Area type="stepAfter" dataKey="price" stroke="var(--saffron)" strokeWidth={2.5} fill="url(#v5fill)" animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LivePill() {
  const tr = useTr();
  return <span className="inline-flex items-center gap-1 rounded-full bg-palm/10 px-2 py-0.5 text-[11px] font-bold text-palm"><Radio className="h-3 w-3" />{tr('أسعار حقيقية', 'Real prices')}</span>;
}
