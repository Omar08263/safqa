import { useEffect, useState } from 'react';
import { useTr } from '../lib/tr';

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Live days/hours/minutes/seconds until an ISO date (Cairo midnight). */
export function Countdown({ date, compact = false }: { date: string; compact?: boolean }) {
  const tr = useTr();
  const now = useNow();
  const target = new Date(`${date}T00:00:00+02:00`).getTime();
  const diff = Math.max(0, target - now);
  const parts = [
    [Math.floor(diff / 86_400_000), tr('يوم', 'days')],
    [Math.floor((diff / 3_600_000) % 24), tr('ساعة', 'hrs')],
    [Math.floor((diff / 60_000) % 60), tr('دقيقة', 'min')],
    [Math.floor((diff / 1000) % 60), tr('ثانية', 'sec')],
  ] as const;
  return (
    <div className={`flex gap-2 ${compact ? 'text-sm' : ''}`} role="timer">
      {parts.map(([v, l]) => (
        <div key={l} className={`glass grid place-items-center rounded-2xl ${compact ? 'min-w-12 px-2 py-1' : 'min-w-16 px-3 py-2'}`}>
          <span className={`num font-bold ${compact ? 'text-lg' : 'text-2xl'}`}>{String(v).padStart(2, '0')}</span>
          <span className="text-[11px] text-muted">{l}</span>
        </div>
      ))}
    </div>
  );
}
