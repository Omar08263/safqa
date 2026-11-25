import { useState } from 'react';
import { type Cue, play, setSoundEnabled, setVolume, useSound, useTapSounds, useVolume } from '../lib/sound';
import { useTr } from '../lib/tr';

const PREVIEWS: { cue: Cue; ar: string; en: string; emoji: string; mood: string }[] = [
  { cue: 'tap', ar: 'ضغطة', en: 'Tap', emoji: '👆', mood: 'خشب ناعم' },
  { cue: 'toggle-on', ar: 'تشغيل', en: 'Toggle', emoji: '🔘', mood: 'ماريمبا' },
  { cue: 'bubble', ar: 'فقاعة', en: 'Bubble', emoji: '🫧', mood: 'لطيف' },
  { cue: 'success', ar: 'تمام', en: 'Success', emoji: '✅', mood: 'جرس زجاج' },
  { cue: 'coin', ar: 'توفير', en: 'Coin', emoji: '🪙', mood: 'لمعة' },
  { cue: 'deal', ar: 'صفقة', en: 'Deal', emoji: '🔥', mood: 'احتفال' },
  { cue: 'magic', ar: 'ذكاء', en: 'Magic', emoji: '🪄', mood: 'سحري' },
  { cue: 'swell', ar: 'هيبة', en: 'Prestige', emoji: '👑', mood: 'فخم' },
  { cue: 'tier-diamond', ar: 'ماسي', en: 'Diamond', emoji: '💎', mood: 'ملكي' },
  { cue: 'whoosh', ar: 'انتقال', en: 'Whoosh', emoji: '💨', mood: 'نسمة' },
  { cue: 'shutter', ar: 'كاميرا', en: 'Shutter', emoji: '📸', mood: 'عدسة' },
  { cue: 'error', ar: 'تنبيه', en: 'Error', emoji: '⚠️', mood: 'هادي' },
];

/** Sound studio: on/off, master volume, tap sounds, and a playable palette. */
export function SoundStudio() {
  const tr = useTr();
  const [on] = useSound();
  const [vol] = useVolume();
  const [taps, setTaps] = useTapSounds();
  const [last, setLast] = useState<Cue | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent p-3">
        <span>
          <span className="block text-sm font-semibold">{tr('أصوات صفقة', 'Safqa sounds')} 🎼</span>
          <span className="text-xs text-muted">{tr('أصوات هادية ومريحة متصممة مخصوص — مولّدة جوه المتصفح ومن غير أي ملفات.', 'Calm, custom-designed sounds generated in your browser.')}</span>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-label={tr('أصوات صفقة', 'Safqa sounds')} data-sfx="none" onClick={() => setSoundEnabled(!on)} className={`relative h-7 w-12 flex-none rounded-full transition ${on ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} /></button>
      </div>
      <div className={`space-y-3 rounded-2xl bg-accent p-3 transition ${on ? '' : 'pointer-events-none opacity-50'}`}>
        <label className="block">
          <span className="flex items-center justify-between text-sm font-semibold"><span>{tr('مستوى الصوت', 'Volume')} 🔊</span><span className="tabular-nums text-muted">{Math.round(vol * 100)}%</span></span>
          <input type="range" min={0} max={100} value={Math.round(vol * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} onPointerUp={() => play('chime')} className="sfx-range mt-2 w-full" aria-label={tr('مستوى الصوت', 'Volume')} />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span><span className="block text-sm font-semibold">{tr('صوت مع كل ضغطة', 'Sound on every tap')}</span><span className="text-xs text-muted">{tr('تكّة خشب ناعمة للأزرار، ونغمتين للروابط والمفاتيح.', 'A soft wooden tick for buttons, two notes for links and switches.')}</span></span>
          <button type="button" role="switch" aria-checked={taps} aria-label={tr('صوت مع كل ضغطة', 'Sound on every tap')} onClick={() => setTaps(!taps)} className={`relative h-7 w-12 flex-none rounded-full transition ${taps ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${taps ? 'start-6' : 'start-1'}`} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {PREVIEWS.map((p) => (
            <button key={p.cue} type="button" data-sfx="none" onClick={() => { play(p.cue, true); setLast(p.cue); }} className={`press glass-tile rounded-2xl p-2 text-center ${last === p.cue ? 'ring-2 ring-primary' : ''}`}>
              <span className={`block text-2xl ${last === p.cue ? 'sfx-bounce' : ''}`} key={last === p.cue ? Date.now() : p.cue}>{p.emoji}</span>
              <span className="block text-xs font-semibold">{tr(p.ar, p.en)}</span>
              <span className="block text-[10px] text-muted">{p.mood}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">{tr('كل الأصوات أصلية ومتولّدة بـ WebAudio، ومنشورة CC0. بتحترم وضع «حركة أقل» والاهتزاز ليه مفتاح لوحده.', 'All sounds are original WebAudio synthesis, released CC0.')}</p>
      </div>
    </div>
  );
}
