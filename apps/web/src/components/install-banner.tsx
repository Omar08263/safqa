import { Link } from '@tanstack/react-router';
import { Download, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APK_URL, isStandalone, platform } from '../lib/app-links';
import { readLocal, writeLocal } from '../lib/local';
import { useTr } from '../lib/tr';
import { useInstall } from './chrome';

const KEY = 'safqa.installBanner.v1';

/** Smart install banner: after the 2nd visit or 45 s, never inside the app, snoozed 14 days on close. */
export function SmartInstallBanner() {
  const tr = useTr();
  const pwa = useInstall();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (isStandalone()) return;
    const st = readLocal<{ visits: number; snoozeUntil?: number }>(KEY, { visits: 0 });
    const visits = st.visits + 1;
    writeLocal(KEY, { ...st, visits });
    if (st.snoozeUntil && st.snoozeUntil > Date.now()) return;
    if (location.hash.includes('/app')) return;
    const t = setTimeout(() => setShow(true), visits >= 2 ? 6000 : 45_000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const p = platform();
  const close = () => { setShow(false); writeLocal(KEY, { ...readLocal(KEY, { visits: 1 }), snoozeUntil: Date.now() + 14 * 86_400_000 }); };
  return (
    <div className="no-print page-enter fixed inset-x-3 bottom-3 z-[65] mx-auto max-w-xl overflow-hidden rounded-3xl border border-primary/40 bg-card/95 p-3 shadow-2xl backdrop-blur md:bottom-6">
      <div className="mesh absolute inset-0 opacity-30" aria-hidden />
      <div className="relative flex items-center gap-3">
        <img src="/brand/icon-192.png" alt="" className="float h-12 w-12 rounded-2xl shadow-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{tr('صفقة في جيبك 📲', 'Safqa in your pocket 📲')}</p>
          <p className="text-xs text-muted">{p === 'ios' ? tr('اضغط زرار المشاركة ⬆️ وبعدين «إضافة إلى الشاشة الرئيسية»', 'Tap Share ⬆️ then “Add to Home Screen”') : tr('تنبيهات فورية للتخفيضات + بيشتغل من غير نت', 'Instant drop alerts + works offline')}</p>
        </div>
        {p === 'android' ? (
          <a href={APK_URL} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Download className="h-4 w-4" />APK</a>
        ) : pwa.available ? (
          <button type="button" onClick={() => void pwa.install().then(close)} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Download className="h-4 w-4" />{tr('ثبّت', 'Install')}</button>
        ) : null}
        <Link to="/app" onClick={close} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs font-semibold"><Smartphone className="h-4 w-4" />{tr('التفاصيل', 'Details')}</Link>
        <button type="button" onClick={close} aria-label={tr('قفل', 'Close')} className="text-muted"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
