import { Gamepad2, Headphones, Laptop, Package, Refrigerator, Shirt, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const categoryVisual: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  audio: { icon: Headphones, from: '#6d4ad8', to: '#f472b6' },
  phones: { icon: Smartphone, from: '#1f6fb2', to: '#3dbe9a' },
  computing: { icon: Laptop, from: '#0e6b52', to: '#5fb0f5' },
  gaming: { icon: Gamepad2, from: '#b8432f', to: '#f0b429' },
  appliances: { icon: Refrigerator, from: '#3d5a80', to: '#98c1d9' },
  lifestyle: { icon: Shirt, from: '#c2346b', to: '#f0b429' },
};
export function visualFor(slug?: string | null) {
  return categoryVisual[slug ?? ''] ?? { icon: Package, from: '#c9840a', to: '#0e6b52' };
}

/** Generated product illustration: gradient tile + category glyph + soft orbs. */
export function ProductArt({ slug, className = 'h-28', seed = 0 }: { slug?: string | null; className?: string; seed?: number }) {
  const v = visualFor(slug);
  const Icon = v.icon;
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }} aria-hidden="true">
      <span className="absolute -start-6 -top-8 h-24 w-24 rounded-full bg-white/20 blur-md" />
      <span className="absolute -bottom-10 end-4 h-28 w-28 rounded-full bg-black/10 blur-lg" style={{ transform: `translateX(${(seed % 5) * 8}px)` }} />
      <span className="grid-bg absolute inset-0 opacity-20" />
      <Icon className="float absolute inset-0 m-auto h-1/2 w-1/2 text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]" strokeWidth={1.4} style={{ animationDelay: `${(seed % 7) * 0.4}s` }} />
    </div>
  );
}
