import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
import type { Hit } from '../ai/brain';
import { EDGE_URL } from '../lib/edge';
import { parseIntent } from '../ai/intent';

export const egp = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')} ج`);

/** Cloud fallback: v5 catalog search with the same Arabic→English expansion. */
export async function cloudSearch(q: string, limit = 24): Promise<Hit[]> {
  const it = parseIntent(q);
  const terms = [q, it.expanded.split('|')[1]?.trim()].filter(Boolean) as string[];
  const seen = new Map<string, Hit>();
  for (const t of terms) {
    const r = await fetch(`${EDGE_URL}/api/v5/search?q=${encodeURIComponent(t.split(' ').slice(0, 4).join(' '))}&limit=${limit}${it.maxPrice ? `&max=${it.maxPrice}` : ''}`).then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }));
    for (const p of r.items ?? []) {
      if (it.maxPrice && p.lowestPriceEgp > it.maxPrice) continue;
      if (!seen.has(p.id)) seen.set(p.id, { id: p.id, t: p.titleAr || p.titleEn, p: p.lowestPriceEgp, s: p.bestOffer?.store?.nameAr ?? null, i: p.image ?? null, k: p.category?.slug ?? null, u: `/p/${p.id}`, score: 0 });
    }
    if (seen.size >= limit) break;
  }
  return [...seen.values()].slice(0, limit);
}

export function HitCard({ h, i = 0, badge }: { h: Hit; i?: number; badge?: ReactNode }) {
  return (
    <Link to={h.u as '/'} className="magnetic spring-in group block overflow-hidden rounded-2xl border border-border bg-[var(--elev)] shadow-sm" style={{ '--d': `${Math.min(i, 12) * 45}ms` } as CSSProperties}>
      <div className="relative aspect-square overflow-hidden bg-white">
        {h.i ? <img src={h.i} alt="" loading="lazy" className="h-full w-full object-contain p-2 transition duration-500 group-hover:scale-105" referrerPolicy="no-referrer" /> : <div className="grid h-full place-items-center text-4xl">🛍️</div>}
        {badge ? <span className="absolute start-2 top-2">{badge}</span> : null}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-5">{h.t}</p>
        <p className="mt-1 flex items-baseline justify-between gap-2"><b className="text-base text-primary">{egp(h.p)}</b>{h.s ? <span className="truncate text-[11px] text-muted">{h.s}</span> : null}</p>
      </div>
    </Link>
  );
}

export function FutureHero({ emoji, kicker, title, lede, colors, children }: { emoji: string; kicker: string; title: string; lede: string; colors: [string, string, string]; children?: ReactNode }) {
  return (
    <header className="relative mb-6 overflow-hidden rounded-[2rem] bg-[#070b18] p-6 text-white sm:p-8">
      <div className="aurora" style={{ '--a1': colors[0], '--a2': colors[1], '--a3': colors[2] } as CSSProperties} />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.25em] text-white/60">{kicker}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-extrabold sm:text-4xl"><span className="float-y inline-block text-4xl">{emoji}</span><span className="shimmer-text">{title}</span></h1>
          <p className="mt-3 leading-7 text-white/80">{lede}</p>
        </div>
        {children}
      </div>
    </header>
  );
}
