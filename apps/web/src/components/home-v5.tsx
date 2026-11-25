// v5 home block: live catalog stats, live drops ticker, hottest rail, personalised "for you", categories with counts.
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Database, Flame, Layers, Sparkles, Store, TrendingDown } from 'lucide-react';
import { CountUp, Reveal, Spotlight } from '../fx/fx';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';
import { formatEGP } from '@safqa/shared';
import { topInterests, useDroppedSinceViewed, useV5Meta, v5 } from '../lib/v5';
import { CardGrid, LiveTicker } from './v5';

export function HomeV5() {
  const tr = useTr();
  const { locale } = usePrefs();
  const meta = useV5Meta();
  const hot = useQuery({ queryKey: ['v5', 'home-hot'], queryFn: () => v5.deals({ sort: 'heat', limit: 8 }), retry: 1, staleTime: 120_000 });
  const ints = topInterests();
  const feed = useQuery({
    queryKey: ['v5', 'feed', ints.cats.join(','), ints.brands.join(',')],
    queryFn: () => v5.feed({ cats: ints.cats.join(','), brands: ints.brands.join(',') }),
    enabled: ints.hasAny, retry: 1, staleTime: 120_000,
  });
  const m = meta.data;
  if (meta.isError || (m && !m.products)) return null; // server unreachable or catalog empty: v4 sections still show
  const fmt = (n: number) => Math.round(n).toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en');
  const stats = [
    { v: m?.products ?? 0, l: tr('منتج من متاجر مصرية', 'products from Egyptian stores'), icon: Database },
    { v: m?.offers ?? 0, l: tr('عرض سعر متتبَّع', 'tracked price offers'), icon: Layers },
    { v: m?.stores.filter((s) => s.products).length ?? 0, l: tr('متجر بيتحدّث تلقائي', 'auto-refreshed stores'), icon: Store },
    { v: m?.drops24 ?? 0, l: tr('نزول سعر آخر 24 ساعة', 'price drops in 24h'), icon: TrendingDown },
  ];
  return (
    <div className="space-y-10">
      <SinceViewed />
      <LiveTicker />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={tr('أرقام الكتالوج', 'Catalog numbers')}>
        {stats.map((s, i) => (
          <Reveal key={s.l} delay={i * 80}>
            <Spotlight className="glass rounded-3xl p-5">
              <s.icon className="h-6 w-6 text-primary" />
              {!m ? <div className="skeleton mt-3 h-9 w-24 rounded-xl" /> : s.v > 0 ? <p className="num mt-3 text-3xl font-bold"><CountUp value={s.v} format={fmt} /></p> : <p className="mt-3 flex h-9 items-center text-lg font-bold text-muted">{tr('هادي لسه 😴', 'Quiet so far 😴')}</p>}
              <p className="text-sm text-muted">{s.l}</p>
            </Spotlight>
          </Reveal>
        ))}
      </section>
      {hot.data?.items.length ? (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-2xl font-bold"><Flame className="flame h-6 w-6 text-orange-500" />{tr('الأسخن دلوقتي', 'Hottest right now')}</h2>
            <Link to="/hot" className="text-sm font-semibold text-primary">{tr('كل الصفقات السخنة', 'All hot deals')}</Link>
          </div>
          <CardGrid items={hot.data.items} />
        </section>
      ) : null}
      {feed.data?.items.length ? (
        <section>
          <h2 className="mb-1 flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" />{tr('مختارة ليك', 'Picked for you')}</h2>
          <p className="t-meta mb-4">{tr('على حسب اللي بتتفرج عليه — محفوظ على جهازك بس.', 'Based on what you browse — stored only on this device.')}</p>
          <CardGrid items={feed.data.items.slice(0, 8)} />
        </section>
      ) : null}
      {m?.categories.some((c) => c.n) ? (
        <section>
          <h2 className="mb-4 text-2xl font-bold">{tr('تصفّح الأقسام', 'Browse categories')}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {m.categories.filter((c) => c.n).map((c, i) => (
              <Reveal key={c.slug} delay={(i % 8) * 40}>
                <Link to="/hot" search={{ cat: c.slug }} className="press lift flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center hover:border-primary">
                  <span className="text-3xl" aria-hidden="true">{c.emoji}</span>
                  <span className="text-xs font-bold leading-tight">{locale === 'ar' ? c.nameAr : c.nameEn}</span>
                  <span className="num t-meta">{fmt(c.n)}</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Auto price tracking: everything you opened that is now cheaper than when you looked. */
function SinceViewed() {
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useDroppedSinceViewed();
  if (!q.data?.length) return null;
  return (
    <section className="since-viewed-new rounded-3xl border-2 border-palm/50 p-4" aria-label={tr('نزل من ساعة ما شفته', 'Dropped since you viewed')}>
      <h2 className="text-lg font-bold">📉 {tr('نزل من ساعة ما شفته', 'Dropped since you viewed it')}</h2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {q.data.slice(0, 6).map(({ p, was, now }) => (
          <li key={p.id}><Link to="/p/$id" params={{ id: p.id }} className="flex items-center gap-3 rounded-2xl bg-card p-2 hover:bg-accent">
            {p.image ? <img src={p.image} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-xl bg-white object-contain" /> : null}
            <span className="min-w-0 flex-1"><span className="line-clamp-1 text-sm font-semibold">{locale === 'ar' ? p.titleAr : p.titleEn}</span><span className="num text-xs"><s className="text-muted">{formatEGP(was, locale)}</s> → <b className="text-palm">{formatEGP(now, locale)}</b> (−{Math.round(((was - now) / was) * 100)}%)</span></span>
          </Link></li>
        ))}
      </ul>
    </section>
  );
}
