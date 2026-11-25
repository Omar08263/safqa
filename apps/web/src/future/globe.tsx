import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { Hit } from '../ai/brain';
import { Feature } from '../components/feature-boundary';
import { sparkle } from '../fx/premium';
import { prefersCalm } from '../lib/appearance';
import { EDGE_URL } from '../lib/edge';
import { haptic, play } from '../lib/sound';
import { egp, FutureHero } from './shared';

type Deal = Hit & { d: number | null; store: string | null };
const CAT_COLORS: Record<string, string> = { phones: '#38bdf8', laptops: '#a78bfa', audio: '#f472b6', tvs: '#fbbf24', appliances: '#34d399', gaming: '#f87171', tablets: '#60a5fa', wearables: '#fb923c' };

async function loadDeals(): Promise<Deal[]> {
  const out: Deal[] = [];
  for (const sort of ['heat', 'discount']) {
    const r = await fetch(`${EDGE_URL}/api/v5/deals?limit=100&sort=${sort}`).then((x) => (x.ok ? x.json() : { items: [] })).catch(() => ({ items: [] }));
    for (const p of r.items ?? []) if (!out.some((o) => o.id === p.id)) out.push({ id: p.id, t: p.titleAr || p.titleEn, p: p.lowestPriceEgp, s: p.bestOffer?.store?.nameAr ?? null, store: p.bestOffer?.store?.nameAr ?? null, i: p.image, k: p.category?.slug ?? null, u: `/p/${p.id}`, score: 0, d: p.bestOffer?.discountPct ?? null });
  }
  return out.slice(0, 180);
}

export function GlobePage() {
  const deals = useQuery({ queryKey: ['globe-deals'], queryFn: loadDeals, staleTime: 5 * 60_000 });
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [sel, setSel] = useState<Deal | null>(null);
  const [hover, setHover] = useState<Deal | null>(null);
  const rot = useRef({ y: 0.6, x: -0.25, vy: 0.0025, vx: 0, drag: false, lx: 0, ly: 0, moved: 0 });
  const selRef = useRef<Deal | null>(null);
  const hoverRef = useRef<Deal | null>(null);
  selRef.current = sel;
  hoverRef.current = hover;
  const proj = useRef<{ d: Deal; x: number; y: number; z: number; r: number }[]>([]);

  useEffect(() => {
    const c = canvas.current;
    const list = deals.data;
    if (!c || !list?.length) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; };
    size();
    const n = list.length, golden = Math.PI * (3 - Math.sqrt(5));
    const pts = list.map((d, i) => { const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i; return { d, x: Math.cos(th) * rr, y, z: Math.sin(th) * rr }; });
    const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3, p: Math.random() * 6 }));
    let raf = 0;
    const calm = prefersCalm();
    const draw = (t: number) => {
      const r0 = rot.current;
      if (!r0.drag) { r0.y += calm ? 0 : r0.vy; r0.x += r0.vx; r0.vy += (0.0025 - r0.vy) * 0.02; r0.vx *= 0.94; r0.x = Math.max(-1.2, Math.min(1.2, r0.x)); }
      const w = c.width, h = c.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.38;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) { ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t / 1500 + s.p)); ctx.fillStyle = '#fff'; ctx.fillRect(s.x * w, s.y * h, s.r * dpr, s.r * dpr); }
      ctx.globalAlpha = 1;
      const halo = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.35);
      halo.addColorStop(0, 'rgba(16,185,129,.25)'); halo.addColorStop(1, 'rgba(16,185,129,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 6.29); ctx.fill();
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#134e4a'); body.addColorStop(1, '#03121a');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.29); ctx.fill();
      const cy0 = Math.cos(r0.y), sy0 = Math.sin(r0.y), cx0 = Math.cos(r0.x), sx0 = Math.sin(r0.x);
      const rotp = (x: number, y: number, z: number) => { const x1 = x * cy0 + z * sy0, z1 = -x * sy0 + z * cy0; const y2 = y * cx0 - z1 * sx0, z2 = y * sx0 + z1 * cx0; return [x1, y2, z2] as const; };
      // Graticule
      ctx.strokeStyle = 'rgba(245,181,68,.14)'; ctx.lineWidth = dpr;
      for (let lat = -60; lat <= 60; lat += 30) { ctx.beginPath(); for (let lon = 0; lon <= 360; lon += 6) { const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180; const [x, y, z] = rotp(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)); if (z < 0) { ctx.moveTo(cx + x * R, cy - y * R); continue; } ctx.lineTo(cx + x * R, cy - y * R); } ctx.stroke(); }
      for (let lon = 0; lon < 180; lon += 30) { ctx.beginPath(); for (let lat = -90; lat <= 90; lat += 6) { const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180; const [x, y, z] = rotp(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)); if (z < 0) { ctx.moveTo(cx + x * R, cy - y * R); continue; } ctx.lineTo(cx + x * R, cy - y * R); } ctx.stroke(); }
      const P: typeof proj.current = [];
      for (const p of pts) { const [x, y, z] = rotp(p.x, p.y, p.z); P.push({ d: p.d, x: cx + x * R, y: cy - y * R, z, r: (2.2 + Math.min(6, (p.d.d ?? 10) / 8)) * dpr * (0.55 + 0.45 * (z + 1) / 2) }); }
      P.sort((a, b) => a.z - b.z);
      for (const q of P) {
        const col = CAT_COLORS[q.d.k ?? ''] ?? '#f5b544';
        const front = q.z > 0;
        ctx.globalAlpha = front ? 0.95 : 0.18;
        ctx.shadowBlur = front ? 14 * dpr : 0; ctx.shadowColor = col;
        ctx.fillStyle = selRef.current?.id === q.d.id || hoverRef.current?.id === q.d.id ? '#fff' : col;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (selRef.current?.id === q.d.id ? 1.8 + 0.3 * Math.sin(t / 150) : 1), 0, 6.29); ctx.fill();
        if (front && (q.d.d ?? 0) >= 40 && !calm) { ctx.globalAlpha = 0.25 * Math.abs(Math.sin(t / 500 + q.x)); ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 3, 0, 6.29); ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      proj.current = P;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, [deals.data]);

  const nearest = (e: React.PointerEvent) => {
    const c = canvas.current!; const r = c.getBoundingClientRect(); const dpr = c.width / r.width;
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    let best: Deal | null = null, bd = 18 * dpr;
    for (const q of proj.current) { if (q.z < 0) continue; const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = q.d; } }
    return best;
  };
  return (
    <Feature flag="deal_globe">
      <div className="mx-auto max-w-6xl">
        <FutureHero emoji="🌍" kicker="3D DEAL GLOBE" title="كرة العروض" lede="كل نقطة منوّرة = صفقة حقيقية دلوقتي في متجر مصري. الكبيرة اللي بتنبض خصمها كبير. لفّها بإيدك ودوس على أي نقطة." colors={['#10b981', '#f5b544', '#0ea5e9']} />
        <div className="relative overflow-hidden rounded-[2rem] bg-[#030712]">
          <canvas ref={canvas} className="h-[62vh] min-h-[380px] w-full touch-none cursor-grab active:cursor-grabbing" aria-label="كرة العروض ثلاثية الأبعاد"
            onPointerDown={(e) => { const r = rot.current; r.drag = true; r.lx = e.clientX; r.ly = e.clientY; r.moved = 0; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { const r = rot.current; if (r.drag) { const dx = e.clientX - r.lx, dy = e.clientY - r.ly; r.y += dx * 0.006; r.x += dy * 0.006; r.vy = dx * 0.0008; r.vx = dy * 0.0008; r.lx = e.clientX; r.ly = e.clientY; r.moved += Math.abs(dx) + Math.abs(dy); } else { const h = nearest(e); if (h?.id !== hover?.id) setHover(h); } }}
            onPointerUp={(e) => { const r = rot.current; r.drag = false; if (r.moved < 6) { const h = nearest(e); if (h) { setSel(h); play('sparkle'); haptic('light'); sparkle(e.clientX, e.clientY); } } }}
          />
          {deals.isLoading && <p className="absolute inset-0 grid place-items-center text-white/70">🌍 بنجمع عروض النهارده…</p>}
          <div className="pointer-events-none absolute start-4 top-4 flex flex-wrap gap-2 text-[11px] text-white/80">{Object.entries({ phones: 'موبايلات', laptops: 'لابتوب', audio: 'صوتيات', tvs: 'شاشات', appliances: 'أجهزة منزلية', gaming: 'ألعاب' }).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 backdrop-blur"><i className="h-2 w-2 rounded-full" style={{ background: CAT_COLORS[k] }} />{v}</span>)}</div>
          {(sel ?? hover) && (
            <Link to={(sel ?? hover)!.u as '/'} className="glass-deep spring-in absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-3xl p-3 text-white sm:inset-x-auto sm:end-4 sm:w-96" key={(sel ?? hover)!.id}>
              {(sel ?? hover)!.i ? <img src={(sel ?? hover)!.i!} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1" referrerPolicy="no-referrer" /> : <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-2xl">🛍️</span>}
              <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-bold">{(sel ?? hover)!.t}</span><span className="mt-1 flex items-center gap-2"><b className="text-lg text-amber-300">{egp((sel ?? hover)!.p)}</b>{(sel ?? hover)!.d ? <span className="rounded-full bg-emerald-500/30 px-2 text-xs">-{Math.round((sel ?? hover)!.d!)}%</span> : null}<span className="truncate text-xs text-white/60">{(sel ?? hover)!.store}</span></span></span>
              <span className="text-xl">←</span>
            </Link>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">{deals.data?.length ?? 0} صفقة من كتالوج صفقة متعدد المتاجر · بتتحدّث تلقائيًا</p>
      </div>
    </Feature>
  );
}
