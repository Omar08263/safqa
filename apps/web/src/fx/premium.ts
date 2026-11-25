// Premium motion layer (v5): touch glow on every press, sparkle bursts,
// magnetic hover, and a tiny spring solver. Everything respects
// prefers-reduced-motion / the «calm» appearance and the Hub flag premium_motion.
import { prefersCalm } from '../lib/appearance';

const off = () => prefersCalm() || document.documentElement.classList.contains('no-premium-motion');

/** Critically-damped-ish spring stepping a value; returns a cancel fn. */
export function spring(from: number, to: number, onUpdate: (v: number) => void, { stiffness = 170, damping = 18, mass = 1 } = {}) {
  if (off()) { onUpdate(to); return () => {}; }
  let x = from, v = 0, raf = 0, last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const a = (-stiffness * (x - to) - damping * v) / mass;
    v += a * dt; x += v * dt;
    onUpdate(x);
    if (Math.abs(v) > 0.001 || Math.abs(x - to) > 0.001) raf = requestAnimationFrame(step);
    else onUpdate(to);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Golden sparkle burst at a point (cheaper than confetti, for small wins). */
export function sparkle(x: number, y: number, n = 14, colors = ['#f5b544', '#ffe29a', '#3dbe9a', '#ffffff']) {
  if (off()) return;
  for (let i = 0; i < n; i += 1) {
    const s = document.createElement('i');
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = 26 + Math.random() * 38;
    s.className = 'fx-spark';
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--c:${colors[i % colors.length]};--s:${3 + Math.random() * 4}px;animation-delay:${Math.random() * 60}ms`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }
}

export function installPremiumFx() {
  if (typeof document === 'undefined') return;
  // Soft glow ring under the finger on every press.
  document.addEventListener('pointerdown', (e) => {
    if (off() || e.button > 0) return;
    const el = (e.target as HTMLElement | null)?.closest('button,a[href],[role="button"],[role="switch"],[role="tab"],summary');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const g = document.createElement('i');
    g.className = 'fx-touch';
    g.style.left = `${e.clientX}px`;
    g.style.top = `${e.clientY}px`;
    document.body.appendChild(g);
    setTimeout(() => g.remove(), 650);
    if ((el as HTMLElement).dataset.burst !== undefined) sparkle(e.clientX, e.clientY);
  }, { capture: true, passive: true });
  // Magnetic hover for elements with .magnetic (desktop pointers only).
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.magnetic');
      document.querySelectorAll<HTMLElement>('.magnetic.is-mag').forEach((m) => { if (m !== el) { m.classList.remove('is-mag'); m.style.transform = ''; } });
      if (!el || off()) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      el.classList.add('is-mag');
      el.style.transform = `translate(${dx * 6}px, ${dy * 6}px) rotateX(${-dy * 6}deg) rotateY(${dx * 6}deg)`;
    }, { passive: true });
  }
}
