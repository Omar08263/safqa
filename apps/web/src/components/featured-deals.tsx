// «صيد اليوم» — deals picked and verified by the صيّاد agent (Safqa Hub), pushed through the featured_deals flag.
import { Link } from '@tanstack/react-router';
import { Target } from 'lucide-react';
import { flagValue, useFlag } from '../lib/remote';
import { useTr } from '../lib/tr';

type Deal = { id: string; title: string; image: string | null; price: number; old: number; pct: number; store: string | null; why: string };

export function FeaturedDeals() {
  const tr = useTr();
  const on = useFlag('featured_deals', false);
  const v = flagValue<{ at?: string; items?: Deal[] }>('featured_deals', {});
  if (!on || !v.items?.length) return null;
  return (
    <section aria-labelledby="hunt-h" className="spring-in">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id="hunt-h" className="flex items-center gap-2 text-2xl font-bold"><Target className="h-6 w-6 text-primary" />{tr('صيد اليوم', "Today's catch")}</h2>
        <span className="text-xs text-muted-foreground">{tr('اختارها «صيّاد» واتأكد إنها أرخص من متوسط 30 يوم فعلًا', 'Picked by our deal-hunter agent and verified against the 30-day median')}</span>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {v.items.map((d) => (
          <Link key={d.id} to="/product/$id" params={{ id: d.id }} data-sfx="coin" className="glass-tile press magnetic w-56 shrink-0 snap-start rounded-3xl p-3">
            <div className="relative mb-2 grid aspect-square place-items-center overflow-hidden rounded-2xl bg-white">
              {d.image ? <img src={d.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Target className="h-10 w-10 text-muted-foreground" />}
              <span className="absolute start-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-extrabold text-white">−{d.pct}%</span>
            </div>
            <p className="line-clamp-2 text-sm font-semibold">{d.title}</p>
            <p className="mt-1"><b className="text-lg text-primary">{d.price.toLocaleString('en-US')} ج</b> <s className="text-xs text-muted-foreground">{d.old.toLocaleString('en-US')}</s></p>
            <p className="line-clamp-2 text-[11px] text-muted-foreground">{d.store ? `${d.store} · ` : ''}{d.why}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
