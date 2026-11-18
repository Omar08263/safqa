import { useCallback, useEffect, useState } from 'react';

// Tiny localStorage store with cross-component (and cross-tab) sync.
const EVENT = 'safqa:local';

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readLocal(key, fallback));
  useEffect(() => {
    const sync = (event: Event) => {
      const changed = event instanceof CustomEvent ? event.detail : (event as StorageEvent).key;
      if (changed === key) setValue(readLocal(key, fallback));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = readLocal(key, fallback);
      const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next;
      writeLocal(key, resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, update] as const;
}

export const isStaticDemo = import.meta.env.VITE_DEMO_MODE === 'static';

export function downloadFile(name: string, content: string | Blob, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic correctly.
  return `\ufeff${rows.map((r) => r.map(cell).join(',')).join('\n')}`;
}
