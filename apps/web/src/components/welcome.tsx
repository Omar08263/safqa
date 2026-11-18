import { Link } from '@tanstack/react-router';
import { Bell, ChevronLeft, ChevronRight, Radar, ShieldCheck, Sparkles, Users, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { greeting } from '../lib/device';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { feedback, haptic, play, setSoundEnabled, useHaptics, useSound } from '../lib/sound';
import { useTr } from '../lib/tr';

const slides = [
  {
    icon: Sparkles, emoji: '👋', color: ['#0E6B52', '#F0B429'],
    ar: ['أهلًا بيك في صفقة', 'بنقرا أسعار المتاجر المصرية الحقيقية كل يوم (بي.تك، 2B، راية، أمازون مصر) ونقولك السعر ده لقطة ولا لأ.'],
    en: ['Welcome to Safqa', 'We read real Egyptian store prices every day (B.TECH, 2B, Raya, Amazon.eg) and tell you whether a price is a real deal.'],
  },
  {
    icon: ShieldCheck, emoji: '🕵️', color: ['#B8432F', '#F0B429'],
    ar: ['كاشف الخصومات الوهمية', '«كان 20 ألف وبقى 12»؟ بنقارن السعر المشطوب بتاريخ السعر الحقيقي ونعلّم على الخصم المضخّم بالأحمر.'],
    en: ['Fake-discount detector', '"Was 20k, now 12k"? We compare the struck-out price with real price history and flag inflated discounts.'],
  },
  {
    icon: Bell, emoji: '🔔', color: ['#1F6FB2', '#3DBE9A'],
    ar: ['قولّي لما السعر ينزل', 'ضيف أي منتج للمراقبة وحدد السعر اللي يناسبك. أول ما يوصل له هنبعتلك تنبيه.'],
    en: ['Tell me when it drops', 'Watch any product with your target price. We alert you the moment it gets there.'],
  },
  {
    icon: Radar, emoji: '📡', color: ['#6D4AD8', '#F472B6'],
    ar: ['رادار العروض', 'كل صبح بنرتّب أقوى العروض بدرجة من 100، ومعاها مشاركة سريعة على واتساب وتيليجرام.'],
    en: ['Deal radar', 'Every morning we rank the strongest deals out of 100, with one-tap sharing to WhatsApp and Telegram.'],
  },
  {
    icon: Users, emoji: '🤝', color: ['#0E6B52', '#5FB0F5'],
    ar: ['مجتمع ووكلاء أذكياء', 'اسأل، شارك صفقتك، واتكلم مع وكلاء صفقة. وفيه قوانين واضحة بتحمي الكل.'],
    en: ['Community & smart agents', 'Ask, share your find, and chat with Safqa agents, under clear rules that protect everyone.'],
  },
] as const;

/** First-visit animated welcome (5 short cards). Sound is off unless the user turns it on. */
export function WelcomeTour() {
  const tr = useTr();
  const { locale, theme, setTheme } = usePrefs();
  const [done, setDone] = useLocal<boolean>('safqa.welcome.v4', false);
  const [legacyDone] = useLocal<boolean>('safqa.tourDone.v1', false);
  const [sound] = useSound();
  const [haptics, setHaptics] = useHaptics();
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const last = slides.length; // index of the "make it yours" card
  const open = !done && !new URLSearchParams(window.location.search).has('notour');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowLeft') step(locale === 'ar' ? 1 : -1);
      if (e.key === 'ArrowRight') step(locale === 'ar' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  if (!open) return null;
  function step(d: number) {
    setI((v) => Math.max(0, Math.min(last, v + d)));
    play('whoosh');
    haptic('light');
  }
  function finish() {
    play('welcome');
    haptic('success');
    setDone(true);
  }
  const g = greeting();
  const slide = i < last ? slides[i] : null;
  const colors = slide?.color ?? ['#F0B429', '#0E6B52'];
  const Prev = locale === 'ar' ? ChevronRight : ChevronLeft;
  const Next = locale === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <div className="no-print fixed inset-0 z-[95] grid place-items-center bg-black/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={tr('جولة الترحيب', 'Welcome tour')}>
      <div
        className="page-enter relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-card shadow-2xl"
        onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => { const s = touch.current; const x = e.changedTouches[0]?.clientX; if (s != null && x != null && Math.abs(x - s) > 45) step((x < s ? 1 : -1) * (locale === 'ar' ? -1 : 1)); touch.current = null; }}
      >
        <div className="relative h-44 overflow-hidden sm:h-52" style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}>
          <span className="welcome-orb h-40 w-40 bg-white/40" style={{ top: -40, insetInlineStart: -30 }} />
          <span className="welcome-orb h-32 w-32 bg-black/30" style={{ bottom: -50, insetInlineEnd: 10, animationDelay: '1.5s' }} />
          <div key={i} className="page-enter absolute inset-0 grid place-items-center">
            {slide ? (
              <span className="grid h-24 w-24 place-items-center rounded-[1.75rem] bg-white/20 text-5xl shadow-xl ring-1 ring-white/40 backdrop-blur" aria-hidden="true">{slide.emoji}</span>
            ) : (
              <img src="/brand/safqa-mark.svg" alt="" className="float h-24 w-24 drop-shadow-2xl" />
            )}
          </div>
          <div className="absolute end-3 top-3 flex gap-2">
            <button type="button" onClick={() => setSoundEnabled(!sound)} className="press grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur" aria-pressed={sound} aria-label={sound ? tr('اقفل الصوت', 'Mute') : tr('شغّل الصوت', 'Turn sound on')} title={sound ? tr('اقفل الصوت', 'Mute') : tr('شغّل الصوت', 'Turn sound on')}>
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button type="button" onClick={finish} className="press grid h-9 w-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur" aria-label={tr('تخطّي الجولة', 'Skip tour')}><X className="h-4 w-4" /></button>
          </div>
          {i === 0 ? <p className="absolute start-4 top-4 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{g.emoji} {locale === 'ar' ? g.ar : g.en}</p> : null}
        </div>
        <div key={`t${i}`} className="page-enter min-h-[176px] px-6 pb-2 pt-5">
          {slide ? (
            <>
              <h2 className="flex items-center gap-2 text-xl font-bold"><slide.icon className="h-5 w-5 text-primary" />{locale === 'ar' ? slide.ar[0] : slide.en[0]}</h2>
              <p className="t-body mt-2 text-muted">{locale === 'ar' ? slide.ar[1] : slide.en[1]}</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">{tr('خليها على مزاجك ✨', 'Make it yours ✨')}</h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Choice on={sound} onClick={() => setSoundEnabled(!sound)} label={sound ? tr('أصوات: شغّالة', 'Sounds: on') : tr('أصوات: مقفولة', 'Sounds: off')} emoji={sound ? '🔊' : '🔇'} />
                <Choice on={haptics} onClick={() => { setHaptics(!haptics); feedback('tap'); }} label={haptics ? tr('اهتزاز: شغّال', 'Haptics: on') : tr('اهتزاز: مقفول', 'Haptics: off')} emoji="📳" />
                <Choice on={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} label={theme === 'dark' ? tr('الوضع الليلي', 'Dark mode') : tr('الوضع النهاري', 'Light mode')} emoji={theme === 'dark' ? '🌙' : '☀️'} />
              </div>
              <p className="t-meta mt-3">{tr('تقدر تغيّر أي حاجة بعدين من الإعدادات. ', 'You can change any of this later in Settings. ')}<Link to="/plans" onClick={() => setDone(true)} className="font-semibold text-primary">{tr('شوف الباقات 👑', 'See plans 👑')}</Link></p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 px-6 pb-5 pt-2">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {Array.from({ length: last + 1 }, (_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`} />
            ))}
          </div>
          {i > 0 ? <button type="button" onClick={() => step(-1)} className="press grid h-11 w-11 place-items-center rounded-full border border-border" aria-label={tr('السابق', 'Back')}><Prev className="h-5 w-5" /></button> : <button type="button" onClick={finish} className="t-meta px-2">{tr('تخطّي', 'Skip')}</button>}
          {i < last ? (
            <button type="button" onClick={() => step(1)} className="press flex h-11 items-center gap-1 rounded-full bg-primary px-5 font-semibold text-primary-foreground">{tr('التالي', 'Next')}<Next className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={finish} className="press shine h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground">{tr('يلا نبدأ 🚀', "Let's go 🚀")}</button>
          )}
        </div>
        <span className="sr-only" aria-live="polite">{`${i + 1} / ${last + 1}`}</span>
      </div>
      {legacyDone ? null : null}
    </div>
  );
}

function Choice({ on, onClick, label, emoji }: { on: boolean; onClick: () => void; label: string; emoji: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center ${on ? 'border-primary/50 bg-primary/10 font-semibold' : 'border-border bg-background'}`}>
      <span className="text-xl" aria-hidden="true">{emoji}</span>
      <span>{label}</span>
    </button>
  );
}
