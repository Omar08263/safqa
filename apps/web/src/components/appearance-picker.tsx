import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Palette, Type } from 'lucide-react';
import { FONT_IDS, FONTS, PREVIEW, SKIN_IDS, SKINS, type FontId, type SkinId } from '../lib/skins';
import { useAppearance } from '../lib/appearance';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

function Preview({ family }: { family: string }) {
  return (
    <p className="rounded-2xl border border-border bg-card px-3 py-2 text-center text-base" style={{ fontFamily: family }} dir="rtl">
      {PREVIEW}
    </p>
  );
}

export function AppearancePicker({ compact = false }: { compact?: boolean }) {
  const tr = useTr();
  const { skin, setSkin, font, setFont } = usePrefs();
  const [a, setA] = useAppearance();
  const pickSkin = (id: SkinId) => { if (a.followSystem) setA({ ...a, followSystem: false }); setSkin(id); };
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" />{tr('الثيم', 'Theme')}</p>
        <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {SKIN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={skin === id}
              onClick={() => pickSkin(id)}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-start text-sm transition ${skin === id ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-card hover:bg-accent'}`}
            >
              <span className="h-6 w-6 flex-none rounded-full border border-border shadow-inner" style={{ background: SKINS[id].swatch }} aria-hidden="true" />
              <span>{tr(SKINS[id].ar, SKINS[id].en)}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Type className="h-4 w-4 text-primary" />{tr('الخط', 'Font')}</p>
        <div className="grid gap-1.5">
          {FONT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={font === id}
              onClick={() => setFont(id)}
              className={`rounded-2xl border px-3 py-2 text-start text-sm transition ${font === id ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-card hover:bg-accent'}`}
              style={{ fontFamily: FONTS[id].family }}
            >
              {tr(FONTS[id].ar, FONTS[id].en)}
            </button>
          ))}
        </div>
        <div className="mt-2"><Preview family={FONTS[font].family} /></div>
      </div>
    </div>
  );
}

/** Header / overflow control: a compact popover with the font + theme pickers. */
export function AppearanceMenu({ children }: { children?: ReactNode }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const { skin } = usePrefs();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tr('الخط والثيم', 'Font and theme')}
        title={tr('الخط والثيم', 'Font and theme')}
      >
        {children ?? <span className="h-4 w-4 rounded-full border border-border" style={{ background: SKINS[skin as SkinId]?.swatch ?? SKINS.sand.swatch }} />}
      </button>
      {open ? (
        <div role="dialog" aria-label={tr('الخط والثيم', 'Font and theme')} className="absolute end-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-border bg-background p-3 shadow-lg">
          <AppearancePicker compact />
        </div>
      ) : null}
    </div>
  );
}

export type { FontId, SkinId };
