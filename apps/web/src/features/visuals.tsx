import { Gamepad2, Headphones, Laptop, Package, Refrigerator, Shirt, Smartphone } from 'lucide-react';
import { useMediaMap } from '../lib/media';
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

/** Generated placeholder in the same square tile as real photos (labelled as no photo). */
export function ProductArt({ slug, className = 'w-full', seed = 0 }: { slug?: string | null; className?: string; seed?: number }) {
  const v = visualFor(slug);
  const Icon = v.icon;
  return (
    <div className={`media-tile is-art ${className}`} style={{ background: `linear-gradient(135deg, ${v.from}, ${v.to})` }} aria-hidden="true">
      <span className="absolute -start-6 -top-8 h-24 w-24 rounded-full bg-white/20 blur-md" />
      <span className="grid-bg absolute inset-0 opacity-20" />
      <Icon className="relative h-2/5 w-2/5 text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.25)]" strokeWidth={1.4} style={{ animationDelay: `${(seed % 7) * 0.4}s` }} />
    </div>
  );
}

/**
 * Real store photo when the crawler captured one, else the generated art.
 * Always the same square white tile (images are pre-padded to squares by
 * deploy/hf/build-media.py, and object-fit: contain covers any stragglers).
 * Size it with width classes only (e.g. "w-full", "w-14 flex-none").
 */
export function ProductThumb({ id, slug, className = 'w-full', seed = 0, alt = '' }: { id: string; slug?: string | null; className?: string; seed?: number; alt?: string }) {
  const media = useMediaMap();
  const img = media.data?.[id];
  if (!img) return <ProductArt slug={slug} className={className} seed={seed} />;
  return (
    <div className={`media-tile group/tile ${className}`}>
      <img src={img.thumb} alt={alt} loading="lazy" decoding="async" width={480} height={480} className="transition duration-500 group-hover:scale-[1.04]" />
      {img.count > 1 ? <span className="num absolute bottom-1.5 end-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" aria-label={`${img.count} photos`}>{img.count} 📷</span> : null}
    </div>
  );
}
