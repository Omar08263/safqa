// Safqa v5 pages: 🔥 hot deals, product (offers + real history + forecast), live drops,
// coupons hub, paste-a-link, and the price-sources transparency page.
import { formatEGP, localized } from '@safqa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCircle2, Clock, Copy, ExternalLink, Flame, Link2, Puzzle, Radio, Share2, ShieldCheck, Sparkles, Tag, ThumbsDown, ThumbsUp, TrendingDown, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CardGrid, CAT_EMOJI, HeatBadge, LivePill, PredictionCard, RemoteThumb, SeriesChart, VoteBar } from '../components/v5';
import { CountUp, PageHeader, Skeleton, useToast } from '../fx/fx';
import { signedInToBackend } from '../lib/edge';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { ago, noteInterest, useLiveDrops, useV5Deals, useV5Meta, useV5Product, v5, type V5Card } from '../lib/v5';
import { waLink } from '../components/social';

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
export function V5ProductPage({ id }: { id: string }) {
  const { locale } = usePrefs();
  const tr = useTr();
  const toast = useToast();
  const { client } = useSession();
  const q = useV5Product(id);
  const p = q.data;
  const ar = locale === 'ar';
  useEffect(() => { if (p) { noteInterest(p, 2); document.title = `${p.titleAr} · صفقة`; } }, [p]);
  const watch = useMutation({
    mutationFn: async () => client.addWatch(id),
    onSuccess: () => toast(tr('اتضاف للمراقبة 👀 — هنبلغك لما السعر ينزل', 'Watching 👀 — we will tell you when it drops'), 'success'),
    onError: (e: Error) => toast(/402|tier/.test(e.message) ? tr('وصلت لحد باقتك في المراقبة — رقّي باقتك من صفحة الباقات', 'Watchlist limit reached for your plan') : tr('سجّل دخول الأول عشان تراقب المنتج', 'Sign in to watch this product'), 'error'),
  });
  if (q.isPending) return <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"><Skeleton className="aspect-square w-full rounded-3xl" /><div className="space-y-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-12 w-1/2" /><Skeleton className="h-40 w-full" /></div></div>;
  if (q.isError || !p) return <Offline onRetry={() => q.refetch()} />;
  const offer = p.bestOffer!;
  const cat = p.category ?? { slug: 'other', nameAr: 'متنوع', nameEn: 'Other' };
  const title = localized(locale, { ar: p.titleAr, en: p.titleEn });
  const share = `${location.origin}${location.pathname}#/p/${p.id}`;
  const saving = p.offers.length > 1 ? Math.max(...p.offers.filter((o) => o.inStock).map((o) => o.priceEgp)) - offer.priceEgp : 0;
  return (
    <div className="space-y-6">
      <nav className="t-meta flex flex-wrap items-center gap-1" aria-label={tr('مسار الصفحة', 'Breadcrumb')}>
        <Link to="/" className="hover:text-primary">{tr('الرئيسية', 'Home')}</Link><span>/</span>
        <Link to="/hot" search={{ cat: cat.slug }} className="hover:text-primary">{CAT_EMOJI[cat.slug] ?? ''} {ar ? cat.nameAr : cat.nameEn}</Link>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="relative lg:sticky lg:top-24 lg:self-start">
          <RemoteThumb src={p.image} alt={title} slug={cat.slug} className="w-full rounded-3xl" />
          <div className="absolute start-3 top-3 flex flex-col gap-1.5">{p.v5 ? <HeatBadge heat={p.v5.heat} /> : null}<LivePill /></div>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            {p.brand ? <p className="text-sm font-bold uppercase tracking-wide text-primary">{p.brand}</p> : null}
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            {p.titleAr !== p.titleEn ? <p className="t-meta mt-1" dir="auto">{ar ? p.titleEn : p.titleAr}</p> : null}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-border bg-card p-4">
            <div>
              <p className="t-meta">{tr(`أحسن سعر في ${offer.store.nameAr}`, `Best price at ${offer.store.nameEn}`)}</p>
              <p className="num text-4xl font-black tracking-tight">{formatEGP(offer.priceEgp, locale)}</p>
              <p className="t-meta num mt-1 flex flex-wrap gap-x-3">
                {p.v5?.low ? <span>{tr('أقل سعر شفناه', 'Lowest seen')}: <b>{formatEGP(p.v5.low, locale)}</b></span> : null}
                {saving > 0 ? <span className="text-palm">{tr(`بتوفّر ${formatEGP(saving, locale)} عن أغلى متجر`, `Save ${formatEGP(saving, locale)} vs priciest store`)}</span> : null}
                {p.v5?.checkedAt ? <span><Clock className="inline h-3 w-3" /> {ago(p.v5.checkedAt, ar)}</span> : null}
              </p>
            </div>
            <VoteBar id={p.id} hot={p.votes.hot} cold={p.votes.cold} heat={p.v5?.heat ?? 0} size="md" />
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={offer.url} target="_blank" rel="noopener noreferrer nofollow" className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg shadow-[var(--glow)]"><ExternalLink className="h-4 w-4" />{tr(`روح لـ ${offer.store.nameAr}`, `Go to ${offer.store.nameEn}`)}</a>
            <button type="button" onClick={() => (signedInToBackend() ? watch.mutate() : toast(tr('سجّل دخول الأول عشان تراقب المنتج', 'Sign in first'), 'info'))} className="press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 font-bold"><Bell className="h-4 w-4" />{tr('راقب السعر', 'Watch price')}</button>
            <a href={waLink(`${title} بـ ${formatEGP(offer.priceEgp, 'ar')} على صفقة 👇\n${share}`)} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 font-bold"><Share2 className="h-4 w-4" />{tr('شارك', 'Share')}</a>
          </div>
          <PredictionCard p={p.prediction} />
        </div>
      </div>
      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><TrendingDown className="h-5 w-5 text-primary" />{tr('تاريخ السعر الحقيقي', 'Real price history')}</h2>
        <p className="t-meta mb-2">{tr(`${p.history.length} نقطة سعر متسجلة من ${p.offers.length} ${p.offers.length > 1 ? 'متاجر' : 'متجر'} — كل نقطة = تغيير حقيقي شفناه.`, `${p.history.length} recorded price points from ${p.offers.length} store(s).`)}</p>
        <SeriesChart series={p.series} low={p.v5?.low} />
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
            <div key={String(l)} className="rounded-3xl border border-border bg-card p-4 text-center"><p className="num text-3xl font-black"><CountUp value={Number(n)} /></p><p className="t-meta">{l}</p></div>
          ))}
        </div>
      ) : meta.isError ? <Offline /> : <Skeleton className="h-24 w-full" />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(m?.stores ?? []).map((s) => (
          <li key={s.slug} className="rounded-3xl border border-border bg-card p-4">
            <p className="font-bold">{ar ? s.nameAr : s.nameEn} <span className="t-meta">· {s.domain}</span></p>
            <p className="num mt-1 text-2xl font-black">{s.products.toLocaleString('en')}</p>
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
    </div>
  );
}
export type { V5Card };
