import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import changelog from '../features/changelog.json';
import { confetti } from '../fx/fx';
import { sparkle } from '../fx/premium';
import { prefersCalm } from '../lib/appearance';
import { readLocal, writeLocal } from '../lib/local';
import { useFlag } from '../lib/remote';
import { type Cue, haptic, play } from '../lib/sound';

export type Release = (typeof changelog.releases)[number];
const SEEN = 'safqa.whatsnew.seen.v1';
const OPEN_EVENT = 'safqa:whats-new';
const DUR = 7000;

/** Opens the explainer from anywhere (menu, /whats-new page). */
export const openWhatsNew = (version?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: version }));

/** Particles drifting behind the card, tinted with the slide colour. */
function Particles({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || prefersCalm()) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; };
    resize();
    const ps = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, v: 0.0004 + Math.random() * 0.0012, p: Math.random() * 6.28 }));
    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.y -= p.v; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + p.p));
        ctx.beginPath();
        ctx.fillStyle = Math.random() > 0.985 ? '#fff' : color;
        ctx.globalAlpha = 0.25 + tw * 0.55;
        ctx.shadowBlur = 12; ctx.shadowColor = color;
        ctx.arc(p.x * c.width + Math.sin(t / 2000 + p.p) * 10, p.y * c.height, p.r * dpr, 0, 6.28);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [color]);
  return <canvas ref={ref} className="wn-particles h-full w-full" aria-hidden="true" />;
}

export function WhatsNewPlayer({ release, onClose }: { release: Release; onClose: () => void }) {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const slides = release.slides;
  const s = slides[i]!;
  const last = i === slides.length - 1;
  const base = import.meta.env.BASE_URL;

  const go = useCallback((n: number) => {
    if (n < 0) return;
    if (n >= slides.length) { play('deal'); confetti({ count: 180 }); haptic('success'); onClose(); return; }
    setI(n);
    play((slides[n]!.cue as Cue) ?? 'whoosh');
    haptic('light');
  }, [slides, onClose]);

  useEffect(() => { play('swell'); }, []);
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => go(i + 1 < slides.length ? i + 1 : i), DUR);
    return () => clearTimeout(t);
  }, [i, paused, go, slides.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(i + 1); // RTL: left = next
      if (e.key === 'ArrowRight') go(i - 1);
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, go, onClose]);

  // Swipe (RTL aware: swipe left → next).
  const start = useRef<{ x: number; t: number } | null>(null);
  return (
    <div className={`wn-root ${paused ? 'paused' : ''}`} role="dialog" aria-modal="true" aria-label={`الجديد في صفقة ${release.version}`} dir="rtl"
      onPointerDown={(e) => { start.current = { x: e.clientX, t: Date.now() }; }}
      onPointerUp={(e) => { const st = start.current; start.current = null; if (!st) return; const dx = e.clientX - st.x; if (Math.abs(dx) > 50) go(dx < 0 ? i + 1 : i - 1); }}
      onPointerMove={(e) => { if (window.matchMedia('(pointer: fine)').matches) setTilt({ x: (e.clientX / window.innerWidth - 0.5) * 2, y: (e.clientY / window.innerHeight - 0.5) * 2 }); }}
    >
      <div className="aurora" style={{ '--a1': s.color, '--a2': release.accent, '--a3': '#0e6b52' } as CSSProperties} />
      <Particles color={s.color} />
      <div className="wn-card glass-deep" style={{ transform: prefersCalm() ? undefined : `perspective(1200px) rotateY(${tilt.x * 3}deg) rotateX(${-tilt.y * 3}deg)` }}>
        <div className="wn-bars" aria-hidden="true">
          {slides.map((x, n) => <i key={x.id} className={n < i ? 'done' : n === i ? 'now' : ''} style={{ '--dur': `${DUR}ms` } as CSSProperties}><b key={n === i ? `${i}-${paused}` : n} /></i>)}
        </div>
        <div className="flex items-center justify-between px-4 pt-3 text-xs">
          <span className="rounded-full bg-white/10 px-3 py-1 font-bold"><span className="shimmer-text">✦ صفقة {release.version}</span> · {release.codename}</span>
          <span className="flex gap-1">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-white/10" aria-label={paused ? 'كمّل' : 'وقّف'} onClick={(e) => { e.stopPropagation(); setPaused((p) => !p); }}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-white/10" aria-label="اقفل" onClick={(e) => { e.stopPropagation(); play('soft'); onClose(); }}><X className="h-4 w-4" /></button>
          </span>
        </div>
        {i === 0 && <div className="wn-stagger px-5 pt-3"><h2 className="text-2xl font-extrabold leading-tight">{release.headline}</h2><p className="mt-1 text-sm text-white/75">{release.lede}</p></div>}
        <div className="wn-img" key={s.id} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)}>
          <img src={`${base}${s.image}`} alt="" draggable={false} />
          <span className="wn-emoji absolute bottom-3 start-4 z-10">{s.emoji}</span>
        </div>
        <div className="wn-stagger px-5 pb-2" key={`t-${s.id}`}>
          <h3 className="text-xl font-extrabold" style={{ color: s.color === '#64748b' ? '#fff' : undefined }}>{s.title}</h3>
          <p className="mt-1.5 text-[15px] leading-7 text-white/85">{s.body}</p>
        </div>
        <div className="flex items-center gap-2 px-4 pb-4 pt-2">
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 disabled:opacity-30" disabled={i === 0} aria-label="السابق" onClick={(e) => { e.stopPropagation(); go(i - 1); }}><ChevronRight className="h-5 w-5" /></button>
          <button type="button" data-sfx="none" className="h-11 flex-1 rounded-full bg-white/10 text-sm font-bold" onClick={(e) => { e.stopPropagation(); sparkle(e.clientX, e.clientY); play('magic'); onClose(); void navigate({ to: s.to as '/' }); }}>{s.cta} ←</button>
          <button type="button" data-sfx="none" className="h-11 rounded-full px-5 text-sm font-extrabold text-[#2a1a00]" style={{ background: `linear-gradient(135deg, #ffe29a, ${release.accent})` }} onClick={(e) => { e.stopPropagation(); go(i + 1); }}>{last ? 'يلا نبدأ 🎉' : 'التالي'}</button>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-white/10" aria-label="التالي" onClick={(e) => { e.stopPropagation(); go(i + 1); }}><ChevronLeft className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  );
}

/** Mounted once in the shell: auto-plays after an upgrade, or on demand. */
export function WhatsNew() {
  const enabled = useFlag('whats_new');
  const [open, setOpen] = useState<Release | null>(null);
  useEffect(() => {
    const latest = changelog.releases.find((r) => r.version === changelog.latest);
    const seen = readLocal<string | null>(SEEN, null);
    const onboarded = readLocal<boolean>('safqa.welcome.v4', false);
    if (latest && seen !== latest.version) {
      // Brand-new visitors get the welcome tour instead; they see the next release.
      if (!onboarded && !seen) writeLocal(SEEN, latest.version);
      else if (enabled) { const t = setTimeout(() => setOpen(latest), 1200); return () => clearTimeout(t); }
    }
    return undefined;
  }, [enabled]);
  useEffect(() => {
    const h = (e: Event) => setOpen(changelog.releases.find((r) => r.version === ((e as CustomEvent).detail ?? changelog.latest)) ?? changelog.releases[0]!);
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);
  if (!open) return null;
  return <WhatsNewPlayer release={open} onClose={() => { writeLocal(SEEN, changelog.latest); setOpen(null); }} />;
}

/** /whats-new — every release, newest first. */
export function WhatsNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-[#0b1020] p-6 text-white">
        <div className="aurora" />
        <div className="relative">
          <p className="text-xs font-bold tracking-widest text-white/60">CHANGELOG</p>
          <h1 className="mt-1 text-3xl font-extrabold"><span className="shimmer-text">الجديد في صفقة</span> ✨</h1>
          <p className="mt-2 text-sm text-white/75">كل ترقية بتيجي معاها عرض متحرك بالصور والأصوات. شغّله في أي وقت.</p>
        </div>
      </header>
      {changelog.releases.map((r, n) => (
        <article key={r.version} className="glass spring-in overflow-hidden rounded-3xl p-5" style={{ '--d': `${n * 80}ms` } as CSSProperties}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full px-3 py-1 text-sm font-extrabold text-[#2a1a00]" style={{ background: `linear-gradient(135deg,#ffe29a,${r.accent})` }}>v{r.version}</span>
            <span className="text-sm text-muted">{new Date(r.date).toLocaleDateString('ar-EG', { dateStyle: 'long' })} · {r.codename}</span>
            <button type="button" data-sfx="swell" className="press ms-auto rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => openWhatsNew(r.version)}>▶ شغّل العرض</button>
          </div>
          <h2 className="mt-3 text-xl font-extrabold">{r.headline}</h2>
          <p className="mt-1 text-sm text-muted">{r.lede}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {r.slides.map((s) => (
              <div key={s.id} className="magnetic overflow-hidden rounded-2xl bg-accent">
                <img src={`${import.meta.env.BASE_URL}${s.image}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <p className="p-2 text-sm font-bold">{s.emoji} {s.title}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
