import { X } from 'lucide-react';
import { useState } from 'react';
import { flagValue, useFlag, useRemoteConfig } from '../lib/remote';

/** Banner pushed from Safqa Hub (flag «banner»), dismissible per message. */
export function RemoteBanner() {
  useRemoteConfig();
  const on = useFlag('banner', false);
  const v = flagValue<{ ar?: string; level?: string }>('banner', {});
  const [gone, setGone] = useState(() => localStorage.getItem('safqa.banner.dismissed') ?? '');
  if (!on || !v.ar || gone === v.ar) return null;
  const tone = v.level === 'warn' ? 'from-amber-500 to-red-500' : v.level === 'deal' ? 'from-emerald-500 to-amber-400' : 'from-violet-600 to-sky-500';
  return (
    <div className={`spring-in relative z-30 bg-gradient-to-l ${tone} px-10 py-2 text-center text-sm font-bold text-white`} role="status">
      {v.ar}
      <button type="button" aria-label="اقفل" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white/20" onClick={() => { localStorage.setItem('safqa.banner.dismissed', v.ar!); setGone(v.ar!); }}><X className="h-4 w-4" /></button>
    </div>
  );
}
