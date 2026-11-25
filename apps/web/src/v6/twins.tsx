// 🧬 Cross-store twins on a product page: the same item listed by other stores
// under a different title (static shards built by deploy/ai/twins.py, zero API cost).
import { formatEGP } from '@safqa/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useFlag } from '../lib/remote';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

export interface Twin { id: string; t: string; p: number; s: string; i?: string | null; u: string; m: number }
const shard = async (id: string): Promise<Record<string, Twin[]>> => {
  const r = await fetch(`/ai/twins/${id.slice(1, 3)}.json`);
  return r.ok ? r.json() : {};
};

export function TwinsCard({ id, price, stores }: { id: string; price: number; stores: string[] }) {
  const on = useFlag('sys_twins', true);
  const tr = useTr();
  const { locale } = usePrefs();
  const q = useQuery({ queryKey: ['v6', 'twins', id.slice(1, 3)], queryFn: () => shard(id), enabled: on && /^p[0-9a-f]{4}/.test(id), staleTime: 3600_000, retry: 0 });
  const list = (q.data?.[id] ?? []).filter((t) => !stores.includes(t.s));
  if (!on || !list.length) return null;
  const cheapest = Math.min(...list.map((t) => t.p));
  return (
    <section className="rounded-3xl border border-border bg-card p-4" aria-labelledby="twins-h">
      <h2 id="twins-h" className="flex items-center gap-2 text-lg font-bold">🧬 {tr('توأم المنتج في محلات تانية', 'Same product at other stores')}</h2>
      <p className="t-meta mb-3">{cheapest < price
        ? tr(`لقينا نفس المنتج غالبًا بسعر أقل لحد ${formatEGP(price - cheapest, locale)} — اتأكد من المواصفات (اللون/الإصدار) قبل ما تشتري.`, `Likely the same item for up to ${formatEGP(price - cheapest, locale)} less — check specs before buying.`)
        : tr('نفس المنتج غالبًا متسجّل باسم تاني — قارن واختار. اتأكد من المواصفات قبل الشراء.', 'Likely the same item listed under another name — check specs before buying.')}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((t) => (
          <li key={t.id}>
            <Link to="/p/$id" params={{ id: t.id }} className="press flex items-center gap-3 rounded-2xl border border-border p-2 hover:border-primary">
              {t.i ? <img src={t.i} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-accent">🛍️</span>}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold" dir="auto">{t.t}</span>
                <span className="t-meta flex flex-wrap gap-x-2"><b className="num text-foreground">{formatEGP(t.p, locale)}</b><span>{t.s}</span>{t.p < price ? <span className="font-bold text-palm">↓ {formatEGP(price - t.p, locale)}</span> : null}<span title={tr('درجة التطابق', 'Match score')}>🎯 {Math.round(t.m * 100)}%</span></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
