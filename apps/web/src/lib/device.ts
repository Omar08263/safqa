import { useEffect, useState } from 'react';

/**
 * Phone / tablet / desktop detection from width AND pointer type, so a
 * 1024px touch tablet gets the tablet layout and a small desktop window
 * still gets real hover states. Written to <html data-device data-pointer>
 * so CSS can target it (see the phone:/tablet:/desktop: variants).
 */
export type Device = 'phone' | 'tablet' | 'desktop';

export function detectDevice(): { device: Device; coarse: boolean } {
  const w = window.innerWidth;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const device: Device = w < 768 ? 'phone' : w < 1024 || (coarse && w < 1280) ? 'tablet' : 'desktop';
  return { device, coarse };
}

function apply() {
  const { device, coarse } = detectDevice();
  const html = document.documentElement;
  html.dataset.device = device;
  html.dataset.pointer = coarse ? 'coarse' : 'fine';
  return device;
}

if (typeof window !== 'undefined') apply();

export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(() => (typeof window === 'undefined' ? 'desktop' : apply()));
  useEffect(() => {
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setDevice(apply()));
    };
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return device;
}

/** true while the user scrolls down (to tuck bars away), false on scroll up. */
export function useScrollingDown(threshold = 8): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      if (y < 80) setDown(false);
      else if (y - last > threshold) setDown(true);
      else if (last - y > threshold) setDown(false);
      last = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return down;
}

export function greeting(now = new Date()): { ar: string; en: string; emoji: string } {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }).format(now));
  if (h >= 5 && h < 12) return { ar: 'صباح الفل', en: 'Good morning', emoji: '☀️' };
  if (h >= 12 && h < 17) return { ar: 'نهارك سعيد', en: 'Good afternoon', emoji: '🌤️' };
  if (h >= 17 && h < 22) return { ar: 'مساء الخير', en: 'Good evening', emoji: '🌙' };
  return { ar: 'سهرانين؟ العروض صاحية', en: 'Up late? Deals never sleep', emoji: '🦉' };
}
