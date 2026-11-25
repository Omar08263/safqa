// Safqa v5 pages: 🔥 hot deals, product (offers + real history + forecast), live drops,
// coupons hub, paste-a-link, and the price-sources transparency page.
import { formatEGP, localized } from '@safqa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCircle2, Copy, ExternalLink, Flame, Link2, Puzzle, Radio, Share2, ShieldCheck, Sparkles, Tag, ThumbsDown, ThumbsUp, TrendingDown, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CardGrid, CAT_EMOJI, LivePill, PredictionCard, RemoteThumb, SeriesChart, VoteBar } from '../components/v5';
import { CountUp, PageHeader, Skeleton, useToast } from '../fx/fx';
import { signedInToBackend } from '../lib/edge';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { ago, noteInterest, noteView, useLiveDrops, useV5Deals, useV5Meta, useV5Product, v5, type V5Card } from '../lib/v5';
import { waLink } from '../components/social';
import { TwinsCard } from '../v6/twins';

function GridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-2 rounded-3xl border border-border bg-card p-3"><Skeleton className="aspect-square w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-6 w-1/2" /></div>
      ))}
    </div>
  );
}
function Offline({ onRetry }: { onRetry?: () => void }) {
  const tr = useTr();
  return (
    <div className="rounded-3xl border border-dashed border-border p-8 text-center">
      <p className="text-4xl" aria-hidden="true">📡</p>
      <p className="mt-2 font-bold">{tr('مش قادرين نوصل لسيرفر الأسعار دلوقتي', "Can't reach the price server right now")}</p>
      <p className="t-meta mt-1">{tr('اتأكد من النت — العروض المحفوظة لسه شغالة في الرئيسية.', 'Check your connection; saved deals still work on Home.')}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="press mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{tr('جرّب تاني', 'Try again')}</button> : null}
    </div>
  );
}

export function CategoryChips({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const meta = useV5Meta();
  const cats = (meta.data?.categories ?? []).filter((c) => c.n > 0);
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={tr('الأقسام', 'Categories')}>
      <button type="button" role="tab" aria-selected={!value} onClick={() => onChange(undefined)} className={`press flex-none rounded-full border px-3.5 py-1.5 text-sm font-semibold ${!value ? 'border-transparent bg-foreground text-background' : 'border-border bg-card'}`}>{tr('الكل', 'All')}</button>
      {cats.map((c) => (
        <button key={c.slug} type="button" role="tab" aria-selected={value === c.slug} onClick={() => onChange(c.slug)} className={`press flex-none rounded-full border px-3.5 py-1.5 text-sm font-semibold ${value === c.slug ? 'border-transparent bg-foreground text-background' : 'border-border bg-card'}`}>
          {c.emoji} {locale === 'ar' ? c.nameAr : c.nameEn} <span className="num opacity-60">{c.n}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------- 🔥 Hot ----------------
export function HotPage({ cat, sort = 'heat' }: { cat?: string; sort?: string }) {
  const tr = useTr();
  const navigate = useNavigate();
  const q = useV5Deals(cat, sort);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const set = (p: { cat?: string; sort?: string }) => void navigate({ to: '/hot', search: { cat, sort, ...p } });
  const sorts = [['heat', '🔥 الأسخن', '🔥 Hottest'], ['drop', '📉 نزل حالًا', '📉 Just dropped'], ['new', '🆕 جديد', '🆕 New'], ['price', '💸 الأرخص', '💸 Cheapest']] as const;
  return (
    <div className="space-y-4">
      <PageHeader kicker={tr('صفقة v5', 'Safqa v5')} title={tr('الصفقات السخنة 🔥', 'Hot deals 🔥')} lede={tr('سخونة كل صفقة = تصويت الناس + نزول حقيقي في السعر مقارنة بتاريخه. صوّت 🔥 للحلوة و❄️ للي مش مستاهلة.', 'Heat = community votes + real price drops vs history. Vote 🔥 or ❄️.')} icon={<Flame className="h-6 w-6" />} />
      <div className="flex flex-wrap gap-2" role="tablist">
        {sorts.map(([id, a, e]) => <button key={id} type="button" role="tab" aria-selected={sort === id} onClick={() => set({ sort: id })} className={`press rounded-full px-3.5 py-1.5 text-sm font-bold ${sort === id ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>{tr(a, e)}</button>)}
      </div>
      <CategoryChips value={cat} onChange={(c) => set({ cat: c })} />
      {q.isPending ? <GridSkeleton /> : q.isError ? <Offline onRetry={() => q.refetch()} /> : items.length ? <CardGrid items={items} /> : <p className="py-10 text-center text-muted">{tr('مفيش صفقات هنا لسه — جرّب قسم تاني 🧺', 'Nothing here yet')}</p>}
      {q.hasNextPage ? <div className="text-center"><button type="button" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} className="press rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold">{q.isFetchingNextPage ? tr('بنحمّل…', 'Loading…') : tr('هات كمان', 'Load more')}</button></div> : null}
    </div>
  );
}

// ---------------- product ----------------
const STORE_FALLBACK: Record<string, [string, string]> = { kimo: ['كيمو ستور', 'Kimo Store'], compumarts: ['كمبيومارتس', 'Compumarts'], tradeline: ['تريدلاين', 'Tradeline'], btech: ['بي.تك', 'B.TECH'], '2b': ['تو بي', '2B'], raya: ['راية شوب', 'Raya Shop'], sigma: ['سيجما كمبيوتر', 'Sigma Computer'], elbadr: ['البدر جروب', 'El Badr Group'], jumia: ['جوميا', 'Jumia'], 'amazon-eg': ['أمازون مصر', 'Amazon.eg'], noon: ['نون', 'noon'] };
function storeName(p: { offers: { store: { slug: string; nameAr: string; nameEn: string } }[] }, slug: string, ar: boolean) {
  const s = p.offers.find((o) => o.store.slug === slug)?.store;
  return s ? (ar ? s.nameAr : s.nameEn) : (STORE_FALLBACK[slug]?.[ar ? 0 : 1] ?? slug);
}
/** Arabic counted noun: 1 متجر · 2 متجرين · 3–10 متاجر · 11+ متجر */
export function countAr(n: number, one: string, two: string, few: string) {
  return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${one}`;
}
export function V5ProductPage({ id }: { id: string }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const toast = useToast();
  const { client } = useSession();
  const q = useV5Product(id);
  const p = q.data;
  const ar = locale === 'ar';
  useEffect(() => { if (p) { noteInterest(p, 2); noteView(p.id, p.bestOffer?.priceEgp); document.title = `${p.titleAr} · صفقة`; } }, [p]);
  const watch = useMutation({
    mutationFn: async () => client.addWatch(id),
    onSuccess: () => toast(tr('اتضاف للمراقبة 👀 — هنبلغك لما السعر ينزل', 'Watching 👀 — we will tell you when it drops'), 'success'),
    onError: (e: Error) => toast(/402|tier/.test(e.message) ? tr('وصلت لحد باقتك في المراقبة — رقّي باقتك من صفحة الباقات', 'Watchlist limit reached for your plan') : tr('سجّل دخول الأول عشان تراقب المنتج', 'Sign in to watch this product'), 'error'),
  });
  // Same outer structure as the loaded page (breadcrumb row + grid), so nothing jumps when data lands (CLS).
  if (q.isPending) return <div className="space-y-6" aria-busy="true"><div className="t-meta flex h-4 items-center"><Skeleton className="h-3 w-32" /></div><div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"><div><Skeleton className="aspect-square w-full rounded-3xl" /><div className="mt-2 h-6" /></div><div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-36 w-full rounded-3xl" /><Skeleton className="h-12 w-2/3 rounded-full" /><Skeleton className="h-40 w-full rounded-3xl" /></div></div></div>;
  if (q.isError || !p) return <Offline onRetry={() => q.refetch()} />;
  const offer = p.bestOffer!;
  const cat = p.category ?? { slug: 'other', nameAr: 'متنوع', nameEn: 'Other' };
  const title = localized(locale, { ar: p.titleAr, en: p.titleEn });
  const share = `${location.origin}/p/${p.id}`;
  const saving = p.offers.length > 1 ? Math.max(...p.offers.filter((o) => o.inStock).map((o) => o.priceEgp)) - offer.priceEgp : 0;
  return (
    <div className="space-y-6">
      <nav className="t-meta flex flex-wrap items-center gap-1" aria-label={tr('مسار الصفحة', 'Breadcrumb')}>
        <Link to="/" className="hover:text-primary">{tr('الرئيسية', 'Home')}</Link><span>/</span>
        <Link to="/hot" search={{ cat: cat.slug }} className="hover:text-primary">{CAT_EMOJI[cat.slug] ?? ''} {ar ? cat.nameAr : cat.nameEn}</Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="relative lg:sticky lg:top-24 lg:self-start">
          <RemoteThumb src={p.image} alt={title} slug={cat.slug} className="w-full rounded-3xl" priority />
          {/* Nothing sits on the photo: heat lives in the vote bar, provenance + live status below the image. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <LivePill />
            {p.image && p.imageStore && p.imageStore !== offer.store.slug ? (
              <span className="t-meta inline-flex items-center gap-1" data-qa="image-credit">📷 {tr(`الصورة من موقع ${storeName(p, p.imageStore, true)}`, `Photo from ${storeName(p, p.imageStore, false)}`)}</span>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            {p.brand ? <p className="text-sm font-bold uppercase tracking-wide text-primary">{p.brand}</p> : null}
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            {p.titleAr !== p.titleEn ? <p className="t-meta mt-1" dir="auto">{ar ? p.titleEn : p.titleAr}</p> : null}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-border bg-card p-4">
            <div className="min-w-0 flex-[1_1_18rem]">
              <p className="t-meta">{tr(`أحسن سعر في ${offer.store.nameAr}`, `Best price at ${offer.store.nameEn}`)}</p>
              <p key={offer.priceEgp} className="num price-flip text-4xl font-black tracking-tight">{formatEGP(offer.priceEgp, locale)}</p>
              <dl data-qa="price-stats" className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { k: 'low', label: tr('أقل سعر شفناه', 'Lowest seen'), value: p.v5?.low ? formatEGP(p.v5.low, locale) : '—', cls: '' },
                  { k: 'save', label: tr('توفير', 'You save'), value: saving > 0 ? formatEGP(saving, locale) : '—', cls: saving > 0 ? 'text-palm' : '' },
                  { k: 'ago', label: tr('آخر تحديث', 'Last checked'), value: p.v5?.checkedAt ? ago(p.v5.checkedAt, ar) : '—', cls: '' },
                ].map((x) => (
                  <div key={x.k} className="min-w-0 rounded-2xl bg-accent/60 px-2 py-2">
                    <dt className="truncate text-[11px] leading-4 text-muted">{x.label}</dt>
                    <dd className={`num mt-0.5 truncate whitespace-nowrap text-sm font-bold leading-5 tabular-nums ${x.cls}`}><bdi dir="auto">{x.value}</bdi></dd>
                  </div>
                ))}
              </dl>
            </div>
            <VoteBar id={p.id} hot={p.votes.hot} cold={p.votes.cold} heat={p.v5?.heat ?? 0} size="md" />
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={offer.url} target="_blank" rel="noopener noreferrer nofollow" className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg shadow-[var(--glow)]"><ExternalLink className="h-4 w-4" />{tr(`روح لـ ${offer.store.nameAr}`, `Go to ${offer.store.nameEn}`)}</a>
            <button type="button" onClick={() => (signedInToBackend() ? watch.mutate() : toast(tr('سجّل دخول الأول عشان تراقب المنتج', 'Sign in first'), 'info'))} className="press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 font-bold"><Bell className="h-4 w-4" />{tr('راقب السعر', 'Watch price')}</button>
            <a href={waLink(`${title} بـ ${formatEGP(offer.priceEgp, 'ar')} على صفقة 👇\n${share}`)} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 font-bold"><Share2 className="h-4 w-4" />{tr('شارك', 'Share')}</a>
          </div>
          {p.fake?.flag ? (
            <div role="alert" className="rounded-3xl border-2 border-destructive/60 bg-destructive/10 p-4">
              <p className="font-bold">🕵️ {tr('رادار الخصم الوهمي: انتبه!', 'Fake-discount radar: careful!')}</p>
              <p className="mt-1 text-sm">{ar ? p.fake.ar : p.fake.en}</p>
            </div>
          ) : null}
          {p.war ? <p className="rounded-2xl bg-primary/10 px-4 py-2 text-sm font-semibold">⚔️ {tr(`حرب أسعار: ${p.war.stores} متاجر نزّلوا السعر ${p.war.drops} مرات في أسبوعين — ممكن ينزل كمان.`, `Price war: ${p.war.stores} stores cut the price ${p.war.drops} times in 2 weeks.`)}</p> : null}
          {p.dna ? <DealDnaCard dna={p.dna} /> : null}
          <PredictionCard p={p.prediction} />
          {p.season?.ar ? <p className="t-meta rounded-2xl border border-border px-4 py-2">🗓️ {ar ? p.season.ar : p.season.en}</p> : null}
        </div>
      </div>
      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><TrendingDown className="h-5 w-5 text-primary" />{tr('تاريخ السعر الحقيقي', 'Real price history')}</h2>
        <p className="t-meta mb-2">{tr(`${countAr(p.history.length, 'نقطة سعر', 'نقطتين سعر', 'نقط سعر')} من ${countAr(p.offers.length, 'متجر', 'متجرين', 'متاجر')} — كل نقطة = تغيير حقيقي شفناه.`, `${p.history.length} recorded price point${p.history.length === 1 ? '' : 's'} from ${p.offers.length} store${p.offers.length === 1 ? '' : 's'}.`)}</p>
        {p.series.length >= 2 ? <SeriesChart series={p.series} low={p.v5?.low} /> : (
          <div className="flex items-center gap-3 rounded-2xl bg-accent/50 px-4 py-3 text-sm" data-qa="history-empty">
            <span className="text-2xl" aria-hidden="true">📈</span>
            <span>{tr(`بدأنا نسجّل السعر ${ago(p.v5?.firstSeen ?? p.v5?.checkedAt ?? new Date().toISOString(), true)} — الرسم هيظهر أول ما السعر يتغير، وهنبلغك لو نزل.`, `Tracking started ${ago(p.v5?.firstSeen ?? p.v5?.checkedAt ?? new Date().toISOString(), false)}. The chart appears with the first real price change.`)}</span>
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">{tr('الأسعار في كل المتاجر', 'Prices across stores')}</h2>
        <ul className="mt-3 divide-y divide-border">
          {p.offers.map((o, i) => (
            <li key={o.url} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-bold">{i === 0 && o.inStock ? '🏆 ' : ''}{ar ? o.store.nameAr : o.store.nameEn} {o.userReported ? <span className="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{tr('سعر بلّغ عنه مستخدم', 'User-reported')}</span> : null}</p>
                <p className="t-meta num">{o.inStock ? tr('متاح', 'In stock') : tr('خلصان', 'Out of stock')} · {ago(o.checkedAt, ar)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`num text-lg font-bold ${o.inStock ? '' : 'text-muted line-through'}`}>{formatEGP(o.priceEgp, locale)}</span>
                <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="press rounded-full bg-accent px-3 py-1.5 text-sm font-bold">{tr('افتح', 'Open')}</a>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <TwinsCard id={p.id} price={offer.priceEgp} stores={p.offers.map((o) => o.store.nameAr)} />
      {p.similar.length ? <section><h2 className="mb-3 text-lg font-bold">{tr('بدائل من نفس القسم', 'Similar picks')}</h2><CardGrid items={p.similar} showVotes={false} /></section> : null}
    </div>
  );
}

// ---------------- live drops ----------------
export function DropsPage() {
  const { locale } = usePrefs();
  const tr = useTr();
  const { items, live } = useLiveDrops(40);
  const ar = locale === 'ar';
  return (
    <div className="space-y-4">
      <PageHeader kicker={tr('مباشر', 'Live')} title={tr('نزول الأسعار لحظة بلحظة 📉', 'Price drops, live 📉')} lede={tr('كل ما سعر ينزل فعلًا في متجر بنتابعه بيظهر هنا فورًا (Server-Sent Events). المنتجات اللي ناس بتراقبها بنعيد فحصها كل ساعتين.', 'Every real drop appears here instantly. Watched products are rechecked every ~2 hours.')} icon={<Radio className="h-6 w-6" />}>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${live ? 'bg-palm/15 text-palm' : 'bg-accent text-muted'}`}><span className={`h-2 w-2 rounded-full ${live ? 'bg-palm' : 'bg-muted'}`} />{live ? tr('متصل مباشر', 'Connected') : tr('بنتصل…', 'Connecting…')}</span>
      </PageHeader>
      {!items.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-muted">{tr('لسه مفيش نزول متسجل — أول ما سعر ينزل هيظهر هنا من غير ما تعمل ريفرش ⏳', 'No drops recorded yet — they will appear here without refreshing')}</p> : null}
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.dropId} className="drop-in">
            <Link to="/p/$id" params={{ id: d.product.id }} className="lift flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
              <RemoteThumb src={d.product.image} alt="" slug={d.product.category?.slug} className="h-16 w-16 flex-none rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{localized(locale, { ar: d.product.titleAr, en: d.product.titleEn })}</p>
                <p className="t-meta num">{ar ? d.store.nameAr : d.store.nameEn} · {ago(d.at, ar)}</p>
              </div>
              <div className="text-end">
                <p className="num font-bold text-palm">-{d.pct}%</p>
                <p className="num text-sm"><span className="text-muted line-through">{formatEGP(d.old, locale)}</span> {formatEGP(d.new, locale)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- coupons ----------------
export function CouponsPage() {
  const { locale } = usePrefs();
  const tr = useTr();
  const toast = useToast();
  const q = useQuery({ queryKey: ['v5', 'coupons'], queryFn: () => v5.coupons(), retry: 1 });
  const meta = useV5Meta();
  const [form, setForm] = useState({ store: '', title: '', code: '', expires: '' });
  const add = useMutation({
    mutationFn: () => v5.addCoupon(form),
    onSuccess: () => { toast(tr('شكرًا! الكوبون اتنشر 🎟️', 'Thanks! Coupon posted 🎟️'), 'success'); setForm({ store: '', title: '', code: '', expires: '' }); void q.refetch(); },
    onError: (e: Error) => toast(e.message || tr('سجّل دخول الأول', 'Sign in first'), 'error'),
  });
  const ar = locale === 'ar';
  return (
    <div className="space-y-6">
      <PageHeader kicker={tr('كوبونات وتخفيضات', 'Coupons & sales')} title={tr('مركز الكوبونات 🎟️', 'Coupons hub 🎟️')} lede={tr('كوبونات بيشاركها المجتمع مع نسبة نجاحها الحقيقية، وتحت منها تخفيضات المتاجر نفسها من بياناتهم الرسمية.', 'Community coupons with real success rates, plus the stores’ own sales from their feeds.')} icon={<Tag className="h-6 w-6" />} />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{tr('كوبونات المجتمع', 'Community coupons')}</h2>
        {q.isPending ? <Skeleton className="h-24 w-full" /> : q.isError ? <Offline onRetry={() => q.refetch()} /> : !q.data.coupons.length ? (
          <p className="rounded-3xl border border-dashed border-border p-6 text-center text-muted">{tr('لسه محدش شارك كوبون — كن أول واحد 👇 (مش هنحط كوبونات وهمية)', 'No coupons yet — be the first 👇 (we never post fake ones)')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.coupons.map((c) => {
              const total = c.worked + c.failed;
              return (
                <li key={c.id} className="rounded-3xl border border-dashed border-primary/60 bg-card p-4">
                  <p className="t-meta">{ar ? c.store.nameAr : c.store.nameEn}{c.expires ? ` · ${tr('لحد', 'until')} ${c.expires}` : ''}</p>
                  <p className="mt-1 font-bold">{c.title}</p>
                  {c.code ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(c.code!); toast(tr('الكود اتنسخ ✓', 'Code copied ✓'), 'success'); }} className="press mt-2 inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 font-mono font-bold tracking-wider"><Copy className="h-4 w-4" />{c.code}</button> : null}
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="num text-muted">{total ? tr(`نجح ${c.worked} من ${total}`, `Worked ${c.worked}/${total}`) : tr('لسه محدش جرّبه', 'Not tried yet')}</span>
                    <span className="flex gap-1">
                      <button type="button" aria-label={tr('اشتغل', 'Worked')} onClick={() => v5.couponFeedback(c.id, true).then(() => { toast(tr('شكرًا 🙏', 'Thanks'), 'success'); void q.refetch(); }).catch(() => null)} className="press grid h-8 w-8 place-items-center rounded-full bg-palm/10 text-palm"><ThumbsUp className="h-4 w-4" /></button>
                      <button type="button" aria-label={tr('مشتغلش', 'Did not work')} onClick={() => v5.couponFeedback(c.id, false).then(() => { toast(tr('شكرًا 🙏', 'Thanks'), 'success'); void q.refetch(); }).catch(() => null)} className="press grid h-8 w-8 place-items-center rounded-full bg-destructive/10 text-destructive"><ThumbsDown className="h-4 w-4" /></button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); if (!signedInToBackend()) { toast(tr('سجّل دخول الأول عشان تشارك كوبون', 'Sign in to share a coupon'), 'info'); return; } add.mutate(); }} className="grid gap-2 rounded-3xl border border-border bg-card p-4 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <select required value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} className="h-11 min-w-0 rounded-full border border-border bg-background px-3 text-sm" aria-label={tr('المتجر', 'Store')}>
            <option value="">{tr('المتجر…', 'Store…')}</option>
            {(meta.data?.stores ?? []).map((s) => <option key={s.slug} value={s.slug}>{ar ? s.nameAr : s.nameEn}</option>)}
            <option value="amazon-eg">{tr('أمازون مصر', 'Amazon.eg')}</option><option value="noon">{tr('نون', 'noon')}</option>
          </select>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr('مثلًا: 10% على الإلكترونيات فوق 5000', 'e.g. 10% off electronics over 5000')} className="h-11 min-w-0 rounded-full border border-border bg-background px-4 text-sm" />
          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={tr('الكود (لو فيه)', 'Code (optional)')} className="h-11 min-w-0 rounded-full border border-border bg-background px-4 font-mono text-sm" />
          <button type="submit" disabled={add.isPending} className="press h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground">{tr('شارك', 'Share')}</button>
        </form>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{tr('تخفيضات المتاجر نفسها', 'Store sales')}</h2>
        <p className="t-meta">{tr('السعر قبل الخصم ده من بيانات المتجر الرسمية — بنقارنه بتاريخ السعر عشان نعرف لو الخصم حقيقي.', 'The “was” price comes from the store; we check it against price history.')}</p>
        {q.data?.storeSales.length ? <CardGrid items={q.data.storeSales} showVotes={false} /> : q.isPending ? <GridSkeleton n={4} /> : null}
      </section>
    </div>
  );
}

// ---------------- paste a link ----------------
export function AddLinkPage() {
  const tr = useTr();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const m = useMutation({ mutationFn: (u: string) => v5.submit(u) });
  const res = m.data;
  useEffect(() => { if (res?.productId && (res.status === 'added' || res.status === 'merged' || res.status === 'known')) { const t = window.setTimeout(() => void navigate({ to: '/p/$id', params: { id: res.productId! } }), 1400); return () => window.clearTimeout(t); } }, [res, navigate]);
  const ok = res && ['added', 'merged', 'known'].includes(res.status);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader kicker={tr('ضيف منتج', 'Add a product')} title={tr('الصق أي رابط منتج 🔗', 'Paste any product link 🔗')} lede={tr('من أي متجر مصري: بنقرا البيانات المنظمة اللي المتجر نفسه بينشرها (schema.org)، نطابق المنتج مع باقي المتاجر، ونبدأ نسجّل سعره.', 'From any Egyptian store: we read the structured data the store publishes, match it across stores and start tracking.')} icon={<Link2 className="h-6 w-6" />} />
      <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) m.mutate(url.trim()); }} className="flex flex-col gap-2 sm:flex-row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required inputMode="url" placeholder="https://…" dir="ltr" className="h-12 min-w-0 flex-1 rounded-full border border-border bg-card px-5" aria-label={tr('رابط المنتج', 'Product link')} />
        <button type="submit" disabled={m.isPending} className="press h-12 rounded-full bg-primary px-6 font-bold text-primary-foreground">{m.isPending ? tr('بنقرا الصفحة…', 'Reading…') : tr('تابع السعر', 'Track it')}</button>
      </form>
      {m.isError ? <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{tr('حصلت مشكلة — اتأكد إن الرابط صح وجرّب تاني', 'Something went wrong; check the link')}</p> : null}
      {res ? (
        <div className={`flex items-start gap-3 rounded-2xl p-4 ${ok ? 'bg-palm/10 text-palm' : 'bg-accent'}`}>
          {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" /> : <XCircle className="mt-0.5 h-5 w-5 flex-none text-destructive" />}
          <div className="text-sm"><p className="font-bold">{res.status === 'added' ? tr('تمام! المنتج اتضاف وبدأنا نسجّل سعره 🎉', 'Added! Tracking started 🎉') : res.status === 'merged' ? tr('لقيناه في متاجر تانية وضمّيناه معاهم ✓', 'Matched with other stores ✓') : res.status === 'known' ? tr('المنتج ده متتبَّع أصلًا ✓', 'Already tracked ✓') : res.message}</p>{ok ? <p>{tr('بنفتح صفحة المنتج…', 'Opening the product…')}</p> : null}</div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-palm" />{tr('بنلعب نضيف', 'We play fair')}</p>
          <p className="t-meta mt-1">{tr('بنعرّف نفسنا SafqaBot، بنحترم robots.txt، ولو متجر رفض القراءة الآلية (زي أمازون ونون) مش بنتخفّى ولا بنحل كابتشا.', 'We identify as SafqaBot, respect robots.txt, and never disguise ourselves or solve captchas.')}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 font-bold"><Puzzle className="h-5 w-5 text-primary" />{tr('أمازون ونون', 'Amazon & noon')}</p>
          <p className="t-meta mt-1">{tr('عن طريق Amazon Creators API وبرنامج أفلييت نون (متوصّلين وجاهزين أول ما المفاتيح تتسجّل)، أو إضافة صفقة للمتصفح اللي بتقرا الصفحة اللي إنت فاتحها بنفسك وتعلّم السعر «بلّغ عنه مستخدم».', 'Via the Amazon Creators API and the noon affiliate feed (wired, waiting for keys), or the Safqa browser extension.')}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------- sources ----------------
export function SourcesPage() {
  const { locale } = usePrefs();
  const tr = useTr();
  const meta = useV5Meta();
  const ar = locale === 'ar';
  const m = meta.data;
  return (
    <div className="space-y-5">
      <PageHeader kicker={tr('شفافية', 'Transparency')} title={tr('الأسعار بتيجي منين؟', 'Where prices come from')} lede={tr('كل سعر على صفقة جاي من مصدر حقيقي ومعلن. ده الكتالوج النهارده:', 'Every price comes from a real, declared source. Today’s catalog:')} icon={<Sparkles className="h-6 w-6" />} />
      {m ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[[m.products ?? 0, tr('منتج', 'products')], [m.offers ?? 0, tr('عرض سعر', 'offers')], [m.stores.filter((s) => s.products > 0).length, tr('متجر', 'stores')], [m.drops24, tr('نزول آخر 24 ساعة', 'drops (24h)')]].map(([n, l]) => (
            <div key={String(l)} className="rounded-3xl border border-border bg-card p-4 text-center">{Number(n) > 0 ? <p className="num text-3xl font-black"><CountUp value={Number(n)} /></p> : <p className="py-1.5 text-lg font-bold text-muted">{tr('هادي لسه 😴', 'Quiet so far 😴')}</p>}<p className="t-meta">{l}</p></div>
          ))}
        </div>
      ) : meta.isError ? <Offline /> : <Skeleton className="h-24 w-full" />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(m?.stores ?? []).map((s) => (
          <li key={s.slug} className="rounded-3xl border border-border bg-card p-4">
            <p className="font-bold">{ar ? s.nameAr : s.nameEn} <span className="t-meta">· {s.domain}</span></p>
            {s.products > 0 ? <p className="num mt-1 text-2xl font-black">{s.products.toLocaleString('en')}</p> : <p className="mt-1 text-base font-bold text-muted">{s.slug === 'elaraby' ? tr('⏸️ متوقف: الموقع رافض بوتات الأسعار', '⏸️ Paused: the store refuses price bots') : tr('⏳ بيتجهز — المنتجات بتدخل على مراحل', '⏳ Getting ready, products arrive in batches')}</p>}
            <p className="t-meta">{s.kind === 'feed' ? tr('فيد المتجر الرسمي العام (Shopify)', 'Store’s public feed (Shopify)') : tr('Sitemap + بيانات schema.org اللي المتجر بينشرها', 'Sitemap + schema.org data the store publishes')}{s.lastCrawl ? ` · ${ago(s.lastCrawl, ar)}` : ''}</p>
          </li>
        ))}
        <li className="rounded-3xl border border-dashed border-border p-4"><p className="font-bold">{tr('أمازون مصر', 'Amazon.eg')}</p><p className="t-meta mt-1">{m?.amazon ? tr('متوصّل عن طريق Amazon Creators API ✓', 'Connected via Amazon Creators API ✓') : tr('جاهز عن طريق Amazon Creators API — مستني مفاتيح حساب Associates. مش بنعمل scraping لأمازون.', 'Ready for the Amazon Creators API — waiting for Associates keys. We do not scrape Amazon.')}</p></li>
        <li className="rounded-3xl border border-dashed border-border p-4"><p className="font-bold">{tr('نون', 'noon')}</p><p className="t-meta mt-1">{m?.noon ? tr('متوصّل عن طريق فيد الأفلييت ✓', 'Connected via affiliate feed ✓') : tr('جاهز لفيد برنامج الأفلييت — نون بيقفل البوتات وإحنا مش بنتخفّى.', 'Ready for the affiliate feed — noon blocks bots and we do not disguise ours.')}</p></li>
      </ul>
      <div className="rounded-3xl border border-border bg-card p-4 text-sm">
        <p className="font-bold">{tr('إزاي بنحافظ على الأسعار طازة', 'How we keep prices fresh')}</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
          <li>{tr('المنتجات اللي حد بيراقبها أو سخنة: فحص كل ~2 ساعة (زي Keepa وcamelcamelcamel).', 'Watched/hot products: rechecked every ~2 hours.')}</li>
          <li>{tr('لما تفتح منتج سعره قديم أكتر من 6 ساعات: بنعيد قراءته فورًا.', 'Opening a product older than 6 h refreshes it right away.')}</li>
          <li>{tr('باقي الكتالوج: مسح يومي بالفيد والـ sitemap مع طلبات مشروطة.', 'Everything else: a daily feed + sitemap pass.')}</li>
          <li>{tr('نفس المنتج في متاجر مختلفة بنطابقه بالباركود أو الموديل والسعة.', 'The same product across stores is matched by barcode or model + capacity.')}</li>
        </ul>
      </div>
      <HealthPanel />
    </div>
  );
}
export type { V5Card };

/** Deal DNA: why this deal is (or isn't) good, factor by factor, from real data. */
export function DealDnaCard({ dna }: { dna: { score: number; grade: string; factors: { key: string; points: number; ar: string; en: string; tone: string }[] } }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const color = dna.score >= 80 ? 'var(--palm)' : dna.score >= 65 ? 'var(--saffron)' : dna.score >= 50 ? '#d97706' : 'var(--destructive, #dc2626)';
  return (
    <section className="rounded-3xl border border-border bg-card p-4" aria-label={tr('بصمة الصفقة', 'Deal DNA')}>
      <div className="flex items-center gap-3">
        <div className="dna-ring grid h-16 w-16 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${dna.score * 3.6}deg, var(--line) 0)` }}>
          <div className="grid h-12 w-12 place-items-center rounded-full bg-card"><span className="num text-lg font-black">{dna.score}</span></div>
        </div>
        <div>
          <p className="font-bold">🧬 {tr('بصمة الصفقة', 'Deal DNA')} · <span style={{ color }}>{dna.grade}</span></p>
          <p className="t-meta">{tr('ليه الصفقة دي حلوة أو لأ — من بيانات حقيقية بس', 'Why this deal is good or not, from real data only')}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {dna.factors.map((f, i) => (
          <li key={f.key} className="dna-row flex items-center gap-2 text-sm" style={{ animationDelay: `${i * 70}ms` }}>
            <span className={`num w-10 flex-none text-end font-bold ${f.tone === 'good' ? 'text-palm' : f.tone === 'bad' ? 'text-destructive' : 'text-muted'}`}>{f.points === 0 ? <span aria-label={tr('لسه', 'pending')} title={tr('مش داخل في الحساب لسه', 'Not scored yet')}>⏳</span> : f.points > 0 ? `+${f.points}` : f.points}</span>
            <span className={`min-w-0 flex-1 ${f.points === 0 ? 'text-muted' : ''}`}>{locale === 'ar' ? f.ar : f.en}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Live freshness/health of every source and of the ingestion agents (from /api/v5/health). */
export function HealthPanel() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v5', 'health'], queryFn: v5.health, refetchInterval: 60_000 });
  const h = q.data as undefined | { at: string; stores: { store: string; products: number; newestCheck: string | null; oldestCheck: string | null; checked24h: number; feed: boolean; pausedUntil: string | null }[]; ingest: { at: string; store: string; kind: string; added: number; updated: number; note?: string }[]; recrawl: { at: string; checked: number } | null; drops24h: number; selfHealedHosts: Record<string, unknown>; freshness: Record<string, string> };
  if (!h) return q.isPending ? <Skeleton className="h-40 w-full rounded-3xl" /> : null;
  const ageMin = (iso: string | null) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60_000) : null);
  const ageTxt = (m: number | null) => (m == null ? '—' : m < 60 ? tr(`من ${m} دقيقة`, `${m} min ago`) : m < 1440 ? tr(`من ${Math.round(m / 60)} ساعة`, `${Math.round(m / 60)} h ago`) : tr(`من ${Math.round(m / 1440)} يوم`, `${Math.round(m / 1440)} d ago`));
  return (
    <section className="space-y-3" aria-label={tr('صحة المصادر', 'Source health')}>
      <h2 className="text-xl font-bold">🩺 {tr('صحة المصادر وطزاجة الأسعار — مباشر', 'Source health & price freshness, live')}</h2>
      <div className="overflow-x-auto rounded-3xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="t-meta text-start"><tr><th className="p-3 text-start">{tr('المتجر', 'Store')}</th><th className="p-3 text-start">{tr('منتجات', 'Products')}</th><th className="p-3 text-start">{tr('آخر فحص', 'Last check')}</th><th className="p-3 text-start">{tr('أقدم سعر', 'Oldest price')}</th><th className="p-3 text-start">{tr('الطريقة', 'Method')}</th></tr></thead>
          <tbody>
            {h.stores.map((s) => {
              const newest = ageMin(s.newestCheck); const oldest = ageMin(s.oldestCheck);
              const dot = s.pausedUntil ? 'bg-destructive' : newest != null && newest < 180 ? 'bg-palm' : newest != null && newest < 1440 ? 'bg-saffron' : 'bg-muted';
              return (
                <tr key={s.store} className="border-t border-border">
                  <td className="p-3 font-semibold"><span className={`me-2 inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />{s.store}</td>
                  <td className="num p-3">{s.products.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}</td>
                  <td className="p-3">{ageTxt(newest)}</td>
                  <td className="p-3">{ageTxt(oldest)}</td>
                  <td className="p-3">{s.pausedUntil ? tr('متوقف مؤقتًا (المتجر طلب نهدى)', 'paused (store asked us to slow down)') : s.feed ? tr('فيد رسمي · كل 10 دقايق', 'official feed · every 10 min') : tr('خريطة الموقع + JSON-LD', 'sitemap + JSON-LD')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-4 text-sm"><p className="font-bold">🤖 {tr('وكلاء الإضافة', 'Ingestion agents')}</p>{h.ingest.length ? <ul className="mt-2 space-y-1">{h.ingest.slice(0, 6).map((x, i) => <li key={i} className="t-meta">{ageTxt(ageMin(x.at))} · {x.store} · {x.kind}: +{x.added} / ↻{x.updated}{x.note ? ` · ${x.note}` : ''}</li>)}</ul> : <p className="t-meta mt-2">{tr('أول دورة جاية خلال 10 دقايق.', 'First cycle within 10 minutes.')}</p>}</div>
        <div className="rounded-3xl border border-border bg-card p-4 text-sm"><p className="font-bold">🎯 {tr('إعادة الفحص الذكية', 'Adaptive recrawl')}</p><p className="t-meta mt-2">{h.recrawl ? tr(`آخر دورة ${ageTxt(ageMin(h.recrawl.at))} · ${h.recrawl.checked} منتج`, `last ${ageTxt(ageMin(h.recrawl.at))} · ${h.recrawl.checked} products`) : tr('بتبدأ مع أول دورة.', 'Starts with the first cycle.')}</p><p className="t-meta mt-1">{tr('المراقَب كل ساعة، السخن كل 90 دقيقة–3 ساعات، الباقي كل 6 ساعات.', 'Watched hourly, hot every 90 min–3 h, the rest every 6 h.')}</p></div>
        <div className="rounded-3xl border border-border bg-card p-4 text-sm"><p className="font-bold">🩹 {tr('مستخرج بيصلّح نفسه', 'Self-healing extractor')}</p><p className="t-meta mt-2">{tr(`متاجر اتصلّح استخراجها بالذكاء الاصطناعي: ${Object.keys(h.selfHealedHosts ?? {}).length}`, `Hosts healed by AI: ${Object.keys(h.selfHealedHosts ?? {}).length}`)}</p><p className="t-meta mt-1">{tr(`نزول أسعار آخر 24 ساعة: ${h.drops24h}`, `Drops in last 24 h: ${h.drops24h}`)}</p></div>
      </div>
      <details className="rounded-3xl border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-bold">{tr('الطزاجة الحقيقية لكل مصدر (بصراحة)', 'Honest freshness per source')}</summary><ul className="mt-2 list-disc space-y-1 ps-5">{Object.entries(h.freshness ?? {}).map(([k, v]) => <li key={k} dir="ltr" className="text-start">{v}</li>)}</ul></details>
    </section>
  );
}
