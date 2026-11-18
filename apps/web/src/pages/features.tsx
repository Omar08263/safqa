import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { featureCats, features } from '../features/registry';
import { CountUp, Reveal, Spotlight } from '../fx/fx';
import { useCatalog } from '../lib/catalog';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export function FeaturesPage() {
  const tr = useTr();
  const { locale } = usePrefs();
  const catalog = useCatalog();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const productId = catalog.data?.items[0]?.id;
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const numbered = useMemo(() => features.map((f, i) => ({ ...f, n: i + 1 })), []);
  const needle = q.trim().toLowerCase();
  const shown = numbered.filter((f) => (cat === 'all' || f.cat === cat) && (!needle || `${f.ar} ${f.en} ${f.dar} ${f.den}`.toLowerCase().includes(needle)));

  const link = (to: string) => {
    if (to === '/product') return productId ? { to: '/product/$id' as const, params: { id: productId } } : { to: '/search' as const };
    const [path, query] = to.split('?');
    const search = Object.fromEntries(new URLSearchParams(query ?? ''));
    return { to: path as '/', search };
  };

  return (
    <div>
      <section className="bleed relative -mt-8 overflow-hidden px-4 pb-10 pt-14 text-center">
        <div className="mesh" aria-hidden="true" />
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl">
          <Reveal><span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-primary" />{tr('كل ميزة هنا شغّالة فعلًا — دوس "جرّبها"', 'Every feature here really works — tap "Try it"')}</span></Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-5xl font-bold leading-tight sm:text-7xl">
              <span className="text-gradient"><CountUp value={features.length} duration={1600} /></span> {tr('ميزة', 'features')}
            </h1>
          </Reveal>
          <Reveal delay={160}><p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-muted">{tr('من كشف الخصم المضروب لحاسبة التقسيط والمجموعات والشارات — كل اللي محتاجه عشان تشتري بالسعر الصح.', 'From fake-discount detection to installment maths, collections and badges — everything you need to buy at the right price.')}</p></Reveal>
          <Reveal delay={240}>
            <div className="glass mx-auto mt-6 flex max-w-md items-center gap-2 rounded-full px-4">
              <Search className="h-4 w-4 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('دوّر في المميزات…', 'Search features…')} aria-label={tr('دوّر في المميزات', 'Search features')} className="h-11 flex-1 bg-transparent outline-none" />
            </div>
          </Reveal>
        </div>
      </section>

      <div className="sticky top-[64px] z-20 -mx-4 mb-8 overflow-x-auto bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex w-max gap-2" role="tablist">
          {[{ id: 'all', ar: 'الكل', en: 'All', from: '#c9840a', to: '#0e6b52' }, ...featureCats].map((c) => {
            const count = c.id === 'all' ? features.length : features.filter((f) => f.cat === c.id).length;
            return (
              <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={`press flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${cat === c.id ? 'border-transparent text-white shadow-lg' : 'border-border bg-card'}`} style={cat === c.id ? { background: `linear-gradient(120deg, ${c.from}, ${c.to})` } : undefined}>
                {locale === 'ar' ? c.ar : c.en}<span className="num rounded-full bg-black/15 px-1.5 text-[11px]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {featureCats.filter((c) => cat === 'all' || c.id === cat).map((c) => {
        const list = shown.filter((f) => f.cat === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="mb-14">
            <Reveal>
              <div className="relative mb-6 overflow-hidden rounded-[2rem] p-6 text-white sm:p-8" style={{ background: `linear-gradient(120deg, ${c.from}, ${c.to})` }}>
                <div className="grid-bg absolute inset-0 opacity-20" aria-hidden="true" />
                <div className="relative grid items-center gap-6 md:grid-cols-[1fr_1.1fr]">
                  <div>
                    <p className="text-sm font-semibold opacity-80">{list.length} {tr('ميزة', 'features')}</p>
                    <h2 className="mt-1 text-3xl font-bold">{locale === 'ar' ? c.ar : c.en}</h2>
                  </div>
                  <img src={`/features/${c.id}.webp`} alt={tr(`لقطة من ${c.ar}`, `Screenshot: ${c.en}`)} loading="lazy" className="float-slow hidden max-h-56 w-full rounded-2xl border border-white/30 object-cover object-top shadow-2xl md:block" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </div>
              </div>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((f, i) => (
                <Reveal key={f.n} delay={(i % 3) * 70}>
                  <Spotlight className="glass lift flex h-full flex-col rounded-3xl p-5">
                    <div className="flex items-start gap-4">
                      <div className="relative grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-2xl text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }} aria-hidden="true">
                        <span className="absolute -end-3 -top-3 h-10 w-10 rounded-full bg-white/25" />
                        <f.icon className="relative h-8 w-8" strokeWidth={1.6} />
                      </div>
                      <div className="min-w-0">
                        <p className="num text-xs font-bold text-primary">#{String(f.n).padStart(3, '0')}</p>
                        <h3 className="text-base font-bold leading-snug">{locale === 'ar' ? f.ar : f.en}</h3>
                      </div>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-6 text-muted">{locale === 'ar' ? f.dar : f.den}</p>
                    <Link {...link(f.to)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">{tr('جرّبها', 'Try it')} <Arrow className="h-4 w-4" /></Link>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          </section>
        );
      })}
      {shown.length === 0 ? <p className="py-10 text-center text-muted">{tr('مفيش ميزة بالاسم ده.', 'No feature matches.')}</p> : null}
    </div>
  );
}
