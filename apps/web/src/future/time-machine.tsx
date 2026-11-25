import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Feature } from '../components/feature-boundary';
import { confetti } from '../fx/fx';
import { spring } from '../fx/premium';
import { useCatalog } from '../lib/catalog';
import { useSession } from '../lib/session';
import { haptic, play } from '../lib/sound';
import { forecast } from './forecast';
import { egp, FutureHero } from './shared';

const DAY = 86400_000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

function Odometer({ value }: { value: number }) {
  const [v, setV] = useState(value);
  const cur = useRef(value);
  useEffect(() => spring(cur.current, value, (x) => { cur.current = x; setV(x); }, { stiffness: 120, damping: 16 }), [value]);
  return <span className="tabular-nums">{Math.round(v).toLocaleString('en-US')}</span>;
}

export function TimeMachinePage() {
  const { client } = useSession();
  const cat = useCatalog();
  const items = useMemo(() => (cat.data?.items ?? []).filter((p) => p.lowestPriceEgp), [cat.data]);
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const pick = items.find((p) => p.id === id) ?? items[0];
  const hist = useQuery({ queryKey: ['history', pick?.id], queryFn: () => client.history(pick!.id), enabled: Boolean(pick) });
  const pts = useMemo(() => (hist.data?.series ?? []).flatMap((s) => s.points.map((x) => ({ t: Date.parse(x.t), p: x.priceEgp }))), [hist.data]);
  const f = useMemo(() => (pick ? forecast(pts, pick.lowestPriceEgp!, pick.category?.slug ?? null, 45) : null), [pick, pts]);
  const now = Date.now();
  const pastStart = Math.min(now - 30 * DAY, ...pts.map((x) => x.t));
  const [cursor, setCursor] = useState(0); // days from now
  const lastSide = useRef(0);
  useEffect(() => { setCursor(0); }, [id]);

  if (!pick || !f) return <div className="py-20 text-center text-muted">⏳ بنجهّز آلة الزمن…</div>;
  const W = 760, H = 260, P = 28;
  const t0 = pastStart, t1 = now + 45 * DAY;
  const all = [...pts.map((x) => x.p), ...f.points.flatMap((x) => [x.lo, x.hi]), f.now, hist.data?.min90 ?? f.now, hist.data?.median30 ?? f.now];
  const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03;
  const X = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
  const Y = (p: number) => H - P - ((p - lo) / (hi - lo)) * (H - 2 * P);
  const past = [...pts, { t: now, p: f.now }].sort((a, b) => a.t - b.t);
  const pastPath = past.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.p).toFixed(1)}`).join('');
  const futPath = [`M${X(now)},${Y(f.now)}`, ...f.points.map((x) => `L${X(x.t).toFixed(1)},${Y(x.mid).toFixed(1)}`)].join('');
  const band = [...f.points.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.hi).toFixed(1)}`), ...f.points.slice().reverse().map((x) => `L${X(x.t).toFixed(1)},${Y(x.lo).toFixed(1)}`), 'Z'].join('');
  const tc = now + cursor * DAY;
  const atCursor = cursor <= 0 ? (past.filter((x) => x.t <= tc).pop()?.p ?? past[0]!.p) : (f.points[Math.min(f.points.length - 1, Math.max(0, cursor - 1))]!.mid);
  const seasonAt = cursor > 0 ? f.points[cursor - 1]?.season : null;
  const minDays = -Math.ceil((now - pastStart) / DAY);
  const filtered = q ? items.filter((p) => `${p.titleAr} ${p.titleEn}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : items.slice(0, 8);

  return (
    <Feature flag="time_machine">
      <div className="mx-auto max-w-6xl">
        <FutureHero emoji="⏳" kicker="PRICE TIME MACHINE" title="آلة زمن الأسعار" lede="اسحب المؤشر لورا تشوف السعر كان كام، ولقدّام تشوف هيبقى كام غالبًا — بناءً على تاريخ السعر الحقيقي، واتجاه القسم، ومواسم التخفيضات في مصر." colors={['#f59e0b', '#f5b544', '#0ea5e9']} />
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="glass rounded-3xl p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على منتج…" className="w-full rounded-full border border-border bg-transparent px-4 py-2 text-sm" />
            <ul className="mt-2 max-h-[420px] space-y-1 overflow-auto">
              {filtered.map((p) => (
                <li key={p.id}><button type="button" onClick={() => { setId(p.id); play('whoosh'); }} className={`w-full rounded-xl px-3 py-2 text-start text-sm ${p.id === pick.id ? 'bg-primary/15 font-bold' : 'hover:bg-accent'}`}>{p.titleAr}<span className="block text-xs text-muted">{egp(p.lowestPriceEgp)}</span></button></li>
              ))}
            </ul>
          </aside>
          <section className="relative overflow-hidden rounded-[2rem] bg-[#080c1c] p-5 text-white">
            <div className={`aurora ${cursor > 0 ? '' : 'opacity-30'}`} style={{ '--a1': cursor > 0 ? '#0ea5e9' : '#f59e0b', '--a2': '#f5b544', '--a3': '#8b5cf6' } as React.CSSProperties} />
            <div className="relative">
              <Link to={`/product/${pick.id}` as '/'} className="text-sm text-white/70 underline-offset-4 hover:underline">{pick.titleAr}</Link>
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <p className="text-5xl font-extrabold"><Odometer value={atCursor} /> <span className="text-2xl text-white/60">ج</span></p>
                <p className="pb-2 text-sm text-white/70">{cursor === 0 ? 'النهارده' : cursor < 0 ? `من ${-cursor} يوم (${fmtDay(tc)})` : `بعد ${cursor} يوم (${fmtDay(tc)}) — توقع`}{seasonAt ? ` · ${seasonAt} 🎉` : ''}</p>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="تاريخ وتوقع السعر">
                <defs>
                  <linearGradient id="tm-past" x1="0" x2="1"><stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#ffe29a" /></linearGradient>
                  <linearGradient id="tm-band" x1="0" x2="1"><stop offset="0" stopColor="#38bdf8" stopOpacity=".35" /><stop offset="1" stopColor="#8b5cf6" stopOpacity=".1" /></linearGradient>
                  <filter id="tm-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                {f.points.filter((x, i, a) => x.season && a[i - 1]?.season !== x.season).map((x) => <g key={x.t}><rect x={X(x.t)} y={P} width={Math.max(4, X(x.t + 8 * DAY) - X(x.t))} height={H - 2 * P} fill="#f5b544" opacity=".08" /><text x={X(x.t) + 4} y={P + 12} fill="#ffe29a" fontSize="11">{x.season}</text></g>)}
                <line x1={X(now)} x2={X(now)} y1={P - 6} y2={H - P} stroke="#fff" strokeOpacity=".35" strokeDasharray="3 4" />
                <text x={X(now)} y={P - 10} fill="#fff" fillOpacity=".6" fontSize="11" textAnchor="middle">النهارده</text>
                {hist.data?.min90 ? <><line x1={P} x2={W - P} y1={Y(hist.data.min90)} y2={Y(hist.data.min90)} stroke="#10b981" strokeOpacity=".5" strokeDasharray="2 6" /><text x={W - P} y={Y(hist.data.min90) - 4} fill="#6ee7b7" fontSize="10" textAnchor="end">أقل سعر 90 يوم</text></> : null}
                <path d={band} fill="url(#tm-band)" />
                <path d={futPath} fill="none" stroke="#7dd3fc" strokeWidth="2.5" strokeDasharray="6 6" filter="url(#tm-glow)" className="tm-dash" />
                <path d={pastPath} fill="none" stroke="url(#tm-past)" strokeWidth="3.5" strokeLinecap="round" filter="url(#tm-glow)" />
                {pts.map((x) => <circle key={x.t} cx={X(x.t)} cy={Y(x.p)} r="3" fill="#ffe29a" />)}
                <circle cx={X(f.low.t)} cy={Y(f.low.p)} r="6" fill="#10b981" stroke="#fff" strokeWidth="2" />
                <line x1={X(tc)} x2={X(tc)} y1={P} y2={H - P} stroke="#f5b544" strokeWidth="2" />
                <circle cx={X(tc)} cy={Y(atCursor)} r="8" fill="#f5b544" stroke="#fff" strokeWidth="3" filter="url(#tm-glow)" />
              </svg>
              <input type="range" min={minDays} max={45} value={cursor} aria-label="سافر في الزمن" className="sfx-range mt-2 w-full" dir="ltr"
                onChange={(e) => { const v = Number(e.target.value); const side = Math.sign(v); if (side !== lastSide.current) { play(side > 0 ? 'magic' : side < 0 ? 'whoosh' : 'soft'); haptic('medium'); lastSide.current = side; } setCursor(v); }} />
              <div className="flex justify-between text-[11px] text-white/50" dir="ltr"><span>{fmtDay(pastStart)}</span><span>+45 يوم</span></div>
              <div className={`mt-4 rounded-3xl p-4 ${f.verdict === 'wait' ? 'bg-sky-500/15' : f.verdict === 'buy_now' ? 'bg-emerald-500/15' : 'bg-white/10'}`}>
                <p className="text-lg font-extrabold">{f.verdict === 'wait' ? '⏳ استنى شوية' : f.verdict === 'buy_now' ? '✅ اشتري دلوقتي' : '🤝 السعر مستقر'}</p>
                <p className="mt-1 text-sm text-white/80">{f.reasonAr} أقل سعر متوقع: <b>{egp(f.low.p)}</b>{f.low.t > now ? ` يوم ${fmtDay(f.low.t)}` : ''}.</p>
                <p className="mt-2 text-[11px] text-white/50">ثقة التوقع {Math.round(f.confidence * 100)}% · {pts.length} نقطة سعر حقيقية · ده تقدير مش وعد.</p>
                {f.verdict === 'wait' && <button type="button" className="press mt-3 rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-black" onClick={(e) => { void client.addWatch(pick.id, Math.round(f.low.p)).then(() => { confetti({ x: e.clientX, y: e.clientY, count: 90 }); play('success'); }).catch(() => play('error')); }}>🔔 نبّهني لما يوصل {egp(f.low.p)}</button>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </Feature>
  );
}
