import { feedback } from '../lib/sound';
import { ArrowUp, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import {
  createContext,
  CSSProperties,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { prefersCalm } from '../lib/appearance';
import { cn } from '../lib/utils';

/** Fades/slides children in when they scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      // biome-ignore lint/suspicious/noExplicitAny: polymorphic ref
      ref={ref as any}
      className={cn('reveal', shown && 'is-in', className)}
      style={{ '--d': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Animated number that counts up when first visible. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString('en-US'),
  duration = 1200,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (prefersCalm()) {
      setShown(value);
      return;
    }
    let raf = 0;
    let started = false;
    const run = () => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - (1 - p) ** 3;
        setShown(value * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const node = ref.current;
    // Never leave a bare «0» on screen: if it isn't scrolled into view soon, just show the real number.
    const settle = window.setTimeout(() => { if (!started) { started = true; setShown(value); } }, 1800);
    const io = new IntersectionObserver((entries) => {
      if (!started && entries.some((e) => e.isIntersecting)) {
        started = true;
        run();
      }
    });
    if (node) io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className={cn('num', className)}>
      {format(shown)}
    </span>
  );
}

/** Lightweight canvas confetti burst. Skipped when motion is reduced. */
export function confetti(opts: { x?: number; y?: number; count?: number } = {}) {
  if (typeof window === 'undefined' || prefersCalm()) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const colors = ['#f0b429', '#0e6b52', '#3dbe9a', '#f07167', '#ffd166', '#6d4ad8', '#5fb0f5'];
  const ox = opts.x ?? window.innerWidth / 2;
  const oy = opts.y ?? window.innerHeight / 3;
  const parts = Array.from({ length: opts.count ?? 140 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      r: 3 + Math.random() * 5,
      c: colors[Math.floor(Math.random() * colors.length)] ?? '#f0b429',
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      shape: Math.random() > 0.5,
    };
  });
  const t0 = performance.now();
  const frame = (t: number) => {
    const life = (t - t0) / 1800;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.shape) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r / 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (life < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

type ToastKind = 'success' | 'info' | 'error';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastOptions {
  /** e.g. { label: 'تراجع', onClick: restore } for undo toasts. */
  action?: ToastAction;
  duration?: number;
}
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}
type PushToast = (text: string, kind?: ToastKind, options?: ToastOptions) => void;
const ToastContext = createContext<PushToast>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback<PushToast>((text, kind = 'success', options) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, kind, text, action: options?.action }].slice(-3));
    feedback(kind === 'error' ? 'error' : kind === 'success' ? 'pop' : 'tap', kind === 'error' ? 'warning' : 'light');
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), options?.duration ?? (options?.action ? 6000 : 3800));
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? TriangleAlert : Info;
          return (
            <div key={t.id} className="toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 text-sm shadow-xl backdrop-blur">
              <Icon className={cn('h-5 w-5 flex-none', t.kind === 'error' ? 'text-destructive' : t.kind === 'success' ? 'text-palm' : 'text-primary')} />
              <span className="min-w-0 flex-1">{t.text}</span>
              {t.action ? (
                <button type="button" className="flex-none rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/25" onClick={() => { t.action?.onClick(); setItems((l) => l.filter((x) => x.id !== t.id)); }}>
                  {t.action.label}
                </button>
              ) : null}
              <button type="button" aria-label={document.documentElement.lang === 'ar' ? 'اقفل' : 'Close'} className="flex-none text-muted" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

export function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? window.scrollY / h : 0);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <div className="scroll-progress" style={{ transform: `scaleX(${p})` }} aria-hidden="true" />;
}

export function BackToTop({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => window.scrollTo({ top: 0, behavior: prefersCalm() ? 'auto' : 'smooth' })}
      className="back-to-top fixed end-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-border bg-card/90 shadow-lg backdrop-blur transition hover:-translate-y-0.5"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-2xl', className)} />;
}

/** Card with a pointer-following spotlight glow. */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      className={cn('spotlight', className)}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || !ref.current) return;
        ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

export function Logo({ size = 40, withText = true, sub }: { size?: number; withText?: boolean; sub?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/brand/safqa-mark.svg" width={size} height={size} alt="" className="logo-mark drop-shadow-md" />
      {withText ? (
        <span className="leading-tight">
          <span className="block text-lg font-bold tracking-tight"><span lang="ar">صفقة</span> <span className="hidden text-xs font-semibold tracking-[0.3em] text-primary sm:inline">SAFQA</span></span>
          {sub ? <span className="hidden text-[11px] font-normal text-muted sm:block">{sub}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Gradient headline text. Emoji can't be painted by `background-clip: text` (they turn into solid
 * coloured squares), so emoji runs are rendered outside the gradient in their own colours.
 */
const EMOJI_RUN = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)/u;
export function GradientText({ text, className, gradient = 'text-gradient' }: { text: string; className?: string; gradient?: string }) {
  const parts = text.split(EMOJI_RUN).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) => (EMOJI_RUN.test(part) ? <span key={i} className="emoji-plain" aria-hidden="true">{part}</span> : <span key={i} className={gradient}>{part}</span>))}
    </span>
  );
}

export function PageHeader({ kicker, title, lede, icon, children }: { kicker?: string; title: string; lede?: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-hero accent-wash relative mb-8 overflow-hidden rounded-[2rem] border border-border p-6 sm:p-8">
      <div className="mesh" aria-hidden="true" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          {kicker ? <p className="text-sm font-semibold text-primary">{kicker}</p> : null}
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold leading-tight sm:text-4xl">
            {icon ? <span className="section-icon grid h-12 w-12 flex-none place-items-center rounded-2xl">{icon}</span> : null}
            <GradientText text={title} />
          </h1>
          {lede ? <p className="mt-3 leading-7 text-muted">{lede}</p> : null}
        </div>
        {children}
      </div>
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass rounded-3xl p-5', className)}>{children}</div>;
}
