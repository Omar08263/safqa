import { formatEGP, localized } from '@safqa/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Bot, CalendarDays, Calculator, GitCompare, Layers, Medal, PiggyBank, Search, ShieldAlert, Sparkles, TrendingDown } from 'lucide-react';
import { FormEvent } from 'react';
import { DealCard, StateMessage } from '../components/bits';
import { Countdown } from '../components/countdown';
import { PriceFreshness } from '../components/price-freshness';
import { Button } from '../components/ui/button';
import { features } from '../features/registry';
import { ProductThumb } from '../features/visuals';
import { CountUp, Reveal, Spotlight } from '../fx/fx';
import { track, useActivity } from '../lib/activity';
import { useCatalog } from '../lib/catalog';
import { greeting } from '../lib/device';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

export function HomePage() {
  const { client, user } = useSession();
  const { locale, t } = usePrefs();
  const tr = useTr();
  const navigate = useNavigate();
  const [activity] = useActivity();
  const deals = useQuery({ queryKey: ['deals'], queryFn: () => client.deals() });
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => client.stores() });
  const calendar = useQuery({ queryKey: ['calendar'], queryFn: () => client.calendar() });
  const catalog = useCatalog();
  const all = catalog.data?.items ?? [];
  const offers = all.reduce((n, p) => n + p.offerCount, 0);
  const fakeCount = (deals.data?.suspicious ?? []).length;
  const realDiscounts = all.filter((p) => p.bestOffer && !p.bestOffer.fakeDiscount && (p.bestOffer.discountPct ?? 0) > 0);
  const avgDiscount = realDiscounts.length ? realDiscounts.reduce((s, p) => s + (p.bestOffer?.discountPct ?? 0), 0) / realDiscounts.length : 0;
  const top = [...all].sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0)).slice(0, 3);
  const drops = [...realDiscounts].sort((a, b) => (b.bestOffer?.discountPct ?? 0) - (a.bestOffer?.discountPct ?? 0)).slice(0, 6);
  const next = calendar.data?.items[0];
  const recent = activity.views.map((v) => all.find((p) => p.id === v.id)).filter(Boolean).slice(0, 4);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '');
    track.search(q);
    void navigate({ to: '/search', search: { q } });
  }

  const highlights = [
    { icon: ShieldAlert, to: '/search', ar: 'كاشف الخصم المضروب', en: 'Fake-discount detector', dar: 'بنقارن "السعر قبل الخصم" بتاريخ السعر الحقيقي ونفضح التخفيض الوهمي.', den: 'We check the "was" price against real history and flag fake markdowns.' },
    { icon: TrendingDown, to: '/insights', ar: 'توقّع أحسن وقت للشراء', en: 'Best time to buy', dar: 'تحليل الاتجاه والقاع على 90 يوم يقولك تشتري دلوقتي ولا تستنى.', den: 'Trend and 90-day-low analysis tells you buy now or wait.' },
    { icon: GitCompare, to: '/compare', ar: 'قارن 4 منتجات', en: 'Compare 4 products', dar: 'جدول جنب بعض بيلوّن الأحسن في كل صف، ومعاه رسم أسعار مجمّع.', den: 'Side-by-side table that highlights the winner per row, plus an overlay chart.' },
    { icon: Calculator, to: '/tools', ar: 'حاسبة التقسيط والضريبة', en: 'Installments & VAT', dar: 'احسب القسط الشهري والفايدة الحقيقية وضريبة 14% في ثانية.', den: 'Monthly installment, true interest and 14% VAT in a second.' },
    { icon: PiggyBank, to: '/savings', ar: 'ميزانية ومتتبع توفير', en: 'Budget & savings', dar: 'حدد ميزانيتك الشهرية وشوف وفّرت قد إيه من كل صفقة.', den: 'Set a monthly budget and see what every deal saved you.' },
    { icon: Layers, to: '/collections', ar: 'مجموعات تشاركها', en: 'Shareable collections', dar: 'اعمل قايمة هدايا أو جهاز عروسة وشاركها بلينك أو QR.', den: 'Build a gift or wedding list and share it by link or QR.' },
  ];

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="bleed relative -mt-8 overflow-hidden px-4 pb-6 pt-10 sm:pt-16">
        <div className="mesh" aria-hidden="true" />
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Reveal>
              <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold">
                <span className="pulse-dot h-2 w-2 rounded-full bg-[var(--palm)] text-[var(--palm)]" />
                {tr(`بنتابع ${all.length} منتج و${offers} عرض في ${stores.data?.items.length ?? 0} ${(stores.data?.items.length ?? 0) >= 3 && (stores.data?.items.length ?? 0) <= 10 ? 'متاجر' : 'متجر'}`, `Tracking ${all.length} products and ${offers} offers across ${stores.data?.items.length ?? 0} stores`)}
              </span>
              <PriceFreshness className="ms-2 mt-2 sm:mt-0" />
            </Reveal>
            <Reveal delay={40}>
              <p className="mt-5 text-[15px] font-semibold text-muted" data-testid="greeting">
                {(() => {
                  const g = greeting();
                  const name = user?.name && !/demo/i.test(user.name) ? `، ${user.name.split(' ')[0]}` : '';
                  return tr(`${g.ar}${name} ${g.emoji} · خلّينا نلاقيلك صفقة النهارده`, `${g.en} ${g.emoji} · let's find today's deal`);
                })()}
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-2 text-4xl font-bold leading-[1.15] sm:text-6xl">
                <span className="text-gradient">{tr('اعرف السعر العادل', 'Know the fair price')}</span>
                <br />
                {tr('قبل ما تدفع جنيه.', 'before you pay a pound.')}
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted">{t('home.lede')}</p>
            </Reveal>
            <Reveal delay={240}>
              <form onSubmit={onSearch} className="glass mt-7 flex max-w-xl items-center gap-2 rounded-full p-1.5 ps-4 shadow-xl">
                <Search className="h-5 w-5 text-muted" />
                <input name="q" aria-label={tr('ابحث', 'Search')} placeholder={tr('جرّب: آيفون، بلايستيشن، سماعة…', 'Try: iPhone, PlayStation, headphones…')} className="h-11 flex-1 bg-transparent outline-none" />
                <Button type="submit" size="lg" className="shine">{tr('دوّر', 'Search')}</Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {[tr('آيفون', 'iPhone'), tr('بلايستيشن', 'PlayStation'), tr('سماعات', 'headphones'), tr('غسالة', 'washer')].map((q) => (
                  <Link key={q} to="/search" search={{ q }} className="rounded-full border border-border bg-card/70 px-3 py-1 hover:border-primary">{q}</Link>
                ))}
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={user ? '/dashboard' : '/login'}><Button size="lg">{user ? tr('لوحة التحكم', 'My dashboard') : tr('ابدأ مجانًا', 'Start free')} <Arrow className="h-4 w-4" /></Button></Link>
                <Link to="/features"><Button size="lg" variant="outline"><Sparkles className="h-4 w-4 text-primary" /> {tr(`شوف الـ ${features.length} ميزة`, `See all ${features.length} features`)}</Button></Link>
              </div>
            </Reveal>
          </div>
          {/* floating live cards */}
          <div className="relative hidden h-[520px] lg:block" aria-hidden="true">
            {top.map((p, i) => (
              <div key={p.id} className="glass float absolute w-72 rounded-3xl p-3 shadow-2xl" style={{ top: `${i * 34}%`, insetInlineStart: `${[4, 34, 10][i]}%`, ['--r' as string]: `${[-4, 3, -2][i]}deg`, animationDelay: `${i * 1.3}s` }}>
                <ProductThumb id={p.id} slug={p.category?.slug} className="w-full" seed={i} />
                <p className="mt-2 truncate text-sm font-semibold">{localized(locale, { ar: p.titleAr, en: p.titleEn })}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="num text-lg font-bold">{formatEGP(p.bestOffer?.priceEgp ?? 0, locale)}</span>
                  <span className="rounded-full bg-[var(--palm)]/15 px-2 py-0.5 text-xs font-semibold text-palm">{p.bestOffer?.dealScore}/100</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TICKER */}
      {all.length ? (
        <div className="ticker-wrap glass -mt-8 overflow-hidden rounded-full py-2.5" aria-label={tr('شريط الأسعار', 'Price ticker')}>
          <div className="ticker text-sm">
            {[...all, ...all].map((p, i) => (
              <Link key={`${p.id}-${i}`} to="/product/$id" params={{ id: p.id }} className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-semibold">{localized(locale, { ar: p.titleAr, en: p.titleEn })}</span>
                <span className="num">{formatEGP(p.bestOffer?.priceEgp ?? 0, locale)}</span>
                {p.bestOffer?.discountPct ? <span className={p.bestOffer.fakeDiscount ? 'text-destructive' : 'text-palm'}>▼ {Math.round(p.bestOffer.discountPct)}%</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* STATS */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { v: all.length, l: tr('منتج متتبَّع', 'products tracked'), icon: BadgeCheck },
          { v: offers, l: tr('عرض من المتاجر', 'store offers'), icon: Layers },
          { v: fakeCount, l: tr('خصم مشبوه اتكشف', 'suspicious discounts caught'), icon: ShieldAlert },
          { v: avgDiscount, l: tr('متوسط الخصم الحقيقي', 'average real discount'), icon: TrendingDown, pct: true },
        ].map((s, i) => (
          <Reveal key={s.l} delay={i * 80}>
            <Spotlight className="glass rounded-3xl p-5">
              <s.icon className="h-6 w-6 text-primary" />
              <p className="mt-3 text-3xl font-bold"><CountUp value={s.v} format={(n) => (s.pct ? `${n.toFixed(1)}%` : Math.round(n).toLocaleString(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en'))} /></p>
              <p className="text-sm text-muted">{s.l}</p>
            </Spotlight>
          </Reveal>
        ))}
      </section>

      {/* TOP 3 */}
      {top.length ? (
        <section>
          <SectionTitle icon={<Medal className="h-5 w-5" />} title={tr('أحسن 3 صفقات النهارده', "Today's top 3 deals")} to="/search" more={tr('كل الصفقات', 'All deals')} />
          <div className="deal-grid">
            {top.map((p, i) => (
              <Reveal key={p.id} delay={i * 100} className="relative">
                <span className="absolute -top-3 start-4 z-20 grid h-9 w-9 place-items-center rounded-full text-lg shadow-lg" style={{ background: ['#f0b429', '#cbd5e1', '#d4935a'][i] }}>{i + 1}</span>
                <DealCard product={p} index={i} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {/* CALENDAR COUNTDOWN */}
      {next ? (
        <Reveal>
          <section className="page-hero relative overflow-hidden rounded-[2rem] border border-border p-6 sm:p-8">
            <div className="mesh" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-primary"><CalendarDays className="h-4 w-4" />{tr('الموسم الجاي', 'Next sale season')}</p>
                <h2 className="mt-1 text-3xl font-bold">{locale === 'ar' ? next.nameAr : next.nameEn}</h2>
                <p className="mt-2 max-w-md text-sm text-muted">{tr('ابدأ راقب المنتجات من دلوقتي عشان تعرف لو الخصم ساعتها حقيقي.', 'Start watching products now so you can tell if the sale price is real.')}</p>
                <Link to="/calendar" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">{tr('التقويم كامل', 'Full calendar')} <Arrow className="h-4 w-4" /></Link>
              </div>
              <Countdown date={next.date} />
            </div>
          </section>
        </Reveal>
      ) : null}

      {/* REAL DROPS */}
      <section>
        <SectionTitle icon={<TrendingDown className="h-5 w-5" />} title={tr('أكبر خصومات حقيقية', 'Biggest real discounts')} to="/insights" more={tr('تحليلات السوق', 'Market insights')} />
        {deals.isLoading ? <StateMessage kind="loading" /> : null}
        {deals.isError ? <StateMessage kind="error" onRetry={() => void deals.refetch()} /> : null}
        <div className="deal-grid">
          {drops.map((p, i) => (
            <Reveal key={p.id} delay={(i % 3) * 90}><DealCard product={p} index={i + 3} /></Reveal>
          ))}
        </div>
      </section>

      {deals.data && deals.data.suspicious.length > 0 ? (
        <section>
          <SectionTitle icon={<ShieldAlert className="h-5 w-5 text-destructive" />} title={t('home.suspicious')} />
          <div className="deal-grid">
            {deals.data.suspicious.map((product, i) => (
              <Reveal key={`${product.id}-${product.bestOffer?.id}`} delay={(i % 3) * 90}><DealCard product={product} index={i + 6} /></Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {recent.length ? (
        <section>
          <SectionTitle title={tr('شفته مؤخرًا', 'Recently viewed')} to="/dashboard" more={tr('لوحة التحكم', 'Dashboard')} />
          <div className="deal-grid">
            {recent.map((p, i) => (p ? <DealCard key={p.id} product={p} index={i} /> : null))}
          </div>
        </section>
      ) : null}

      {/* HIGHLIGHTS */}
      <section>
        <SectionTitle icon={<Sparkles className="h-5 w-5" />} title={tr('مميزات بتفرق معاك', 'Features that matter')} to="/features" more={tr(`كل الـ ${features.length} ميزة`, `All ${features.length} features`)} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((h, i) => (
            <Reveal key={h.to + i} delay={(i % 3) * 90}>
              <Link to={h.to as '/'} className="block h-full">
                <Spotlight className="glass lift h-full rounded-3xl p-6">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--saffron)] to-[var(--palm)] text-white shadow-lg"><h.icon className="h-6 w-6" /></span>
                  <h3 className="mt-4 text-lg font-bold">{locale === 'ar' ? h.ar : h.en}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{locale === 'ar' ? h.dar : h.den}</p>
                </Spotlight>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* STORES */}
      <section>
        <SectionTitle title={t('stores.title')} to="/stores" more={tr('مقارنة المتاجر', 'Compare stores')} />
        <p className="-mt-2 mb-4 max-w-3xl text-sm leading-6 text-muted">{t('stores.note')}</p>
        <div className="flex flex-wrap gap-2">
          {(stores.data?.items ?? []).map((store) => (
            <Link key={store.slug} to="/search" search={{ store: store.slug }} className="glass lift rounded-full px-4 py-2 text-sm">
              {localized(locale, { ar: store.nameAr, en: store.nameEn })}
              <span className="ms-2 text-xs text-muted">{t(`status.${store.adapterStatus}`)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Reveal>
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1c1915] to-[#3a2a12] p-8 text-[#f6f0e6] sm:p-12">
          <div className="mesh opacity-60" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="text-3xl font-bold">{tr('خلّي صفقة تراقب بدالك.', 'Let Safqa watch prices for you.')}</h2>
              <p className="mt-2 text-[#d9cdbb]">{tr('حط السعر اللي يناسبك، وأول ما المنتج يوصله هيوصلك تنبيه.', 'Set the price that works for you and get alerted the moment it gets there.')}</p>
            </div>
            <div className="flex gap-3">
              <Link to={user ? '/watchlist' : '/login'}><Button size="lg" className="shine"><Bell className="h-4 w-4" />{tr('فعّل التنبيهات', 'Turn on alerts')}</Button></Link>
              <Link to="/assistant"><Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20"><Bot className="h-4 w-4" />{tr('اسأل المساعد', 'Ask the assistant')}</Button></Link>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

export function SectionTitle({ title, icon, to, more }: { title: string; icon?: React.ReactNode; to?: string; more?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 text-2xl font-bold">{icon ? <span className="text-primary">{icon}</span> : null}{title}</h2>
      {to && more ? <Link to={to as '/'} className="text-sm font-semibold text-primary hover:underline">{more}</Link> : null}
    </div>
  );
}
