import { useTr } from '../lib/tr';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type Hit, semanticSearch, useBrain } from '../ai/brain';
import { parseIntent } from '../ai/intent';
import { askOffline, useLlm } from '../ai/llm';
import { Feature } from '../components/feature-boundary';
import { prefersCalm } from '../lib/appearance';
import { edge } from '../lib/edge';
import { useLocal } from '../lib/local';
import { haptic, play } from '../lib/sound';
import { BrainCard } from './ai-lab';
import { cloudSearch, egp, FutureHero, HitCard } from './shared';

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
const SRCtor = () => (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

function speak(text: string, on: boolean) {
  if (!on || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => v.lang === 'ar-EG') ?? voices.find((v) => v.lang.startsWith('ar')) ?? null;
  u.lang = u.voice?.lang ?? 'ar-EG';
  u.rate = 1.02; u.pitch = 1.05;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/** Living orb: reacts to the microphone level (or breathes while thinking). */
function Orb({ level, mode }: { level: number; mode: 'idle' | 'listen' | 'think' | 'talk' }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const lv = useRef(level);
  lv.current = level;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    let raf = 0;
    const colors = { idle: ['#f5b544', '#ec4899'], listen: ['#ec4899', '#8b5cf6'], think: ['#8b5cf6', '#0ea5e9'], talk: ['#10b981', '#f5b544'] }[mode];
    const draw = (t: number) => {
      const w = c.width, h = c.height, cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.26;
      ctx.clearRect(0, 0, w, h);
      const amp = mode === 'listen' ? lv.current * 0.6 : mode === 'think' ? 0.12 + 0.06 * Math.sin(t / 180) : mode === 'talk' ? 0.15 + 0.1 * Math.abs(Math.sin(t / 90)) : 0.05 + 0.03 * Math.sin(t / 700);
      for (let ring = 3; ring >= 0; ring -= 1) {
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 90) {
          const wob = prefersCalm() ? 0 : Math.sin(a * (3 + ring) + t / (400 - ring * 60)) * amp * base * (0.35 + ring * 0.12);
          const r = base * (1 + ring * 0.13) + wob;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const g = ctx.createRadialGradient(cx, cy, base * 0.1, cx, cy, base * (1.4 + ring * 0.2));
        g.addColorStop(0, `${colors[0]}${ring ? '22' : 'ff'}`);
        g.addColorStop(1, `${colors[1]}${ring ? '05' : 'aa'}`);
        ctx.fillStyle = g;
        ctx.shadowBlur = 40 * dpr; ctx.shadowColor = colors[0]!;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [mode]);
  return <canvas ref={ref} className="h-64 w-64 sm:h-80 sm:w-80" aria-hidden="true" />;
}

export function VoicePage() {
  const tr = useTr();
  const brain = useBrain();
  const llm = useLlm();
  const [mode, setMode] = useState<'idle' | 'listen' | 'think' | 'talk'>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [level, setLevel] = useState(0);
  const [voiceOn, setVoiceOn] = useLocal<boolean>('safqa.voice.speak.v1', true);
  const [typed, setTyped] = useState('');
  const rec = useRef<SR | null>(null);
  const mic = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const supported = Boolean(SRCtor());

  function stopMic() {
    if (mic.current) { cancelAnimationFrame(mic.current.raf); mic.current.stream.getTracks().forEach((t) => t.stop()); void mic.current.ctx.close(); mic.current = null; }
    setLevel(0);
  }
  useEffect(() => () => { rec.current?.stop(); stopMic(); speechSynthesis?.cancel(); }, []);

  async function answer(q: string) {
    setMode('think'); setReply(''); play('magic');
    const it = parseIntent(q);
    const found = brain.status === 'ready' ? (await semanticSearch(q, 8).catch(() => ({ items: [] as Hit[] }))).items : await cloudSearch(q, 8).catch(() => []);
    setHits(found);
    let text = '';
    try {
      if (llm.status === 'ready') {
        for await (const t of askOffline(q)) { text += t; setReply(text); }
      } else {
        const r = await edge<{ reply: string }>('/api/chat', { body: { message: q } });
        text = r.reply;
      }
    } catch {
      text = found.length ? `لقيتلك ${found.length} اختيار${it.maxPrice ? ` تحت ${it.maxPrice.toLocaleString('en-US')} جنيه` : ''}. أرخصهم ${found.slice().sort((a, b) => a.p - b.p)[0]!.t} بـ ${egp(found.slice().sort((a, b) => a.p - b.p)[0]!.p)} 👌` : 'مش لاقي حاجة مناسبة دلوقتي، جرّب تقولها بطريقة تانية 🙏';
    }
    setReply(text);
    setMode('talk'); play('chime'); haptic('success');
    speak(text, voiceOn);
    setTimeout(() => setMode('idle'), 2500);
  }

  async function listen() {
    const C = SRCtor();
    if (!C) return;
    if (mode === 'listen') { rec.current?.stop(); return; }
    speechSynthesis?.cancel();
    setHeard(''); setReply(''); play('bubble'); haptic('medium');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteFrequencyData(buf); setLevel(Math.min(1, buf.reduce((a, b) => a + b, 0) / buf.length / 90)); if (mic.current) mic.current.raf = requestAnimationFrame(tick); };
      mic.current = { stream, ctx, raf: requestAnimationFrame(tick) };
    } catch { /* level meter optional */ }
    const r = new C();
    r.lang = 'ar-EG'; r.interimResults = true; r.continuous = false;
    let final = '';
    r.onresult = (e) => { let s = ''; for (let i = 0; i < e.results.length; i += 1) { s += e.results[i][0].transcript; if (e.results[i].isFinal) final = s; } setHeard(s); };
    r.onerror = () => { stopMic(); setMode('idle'); play('error'); };
    r.onend = () => { stopMic(); if (final.trim()) void answer(final.trim()); else setMode('idle'); };
    rec.current = r;
    setMode('listen');
    r.start();
  }

  return (
    <Feature flag="voice_assistant">
      <div className="mx-auto max-w-5xl">
        <FutureHero emoji="🎙️" kicker="VOICE SHOPPING" title={tr('كلّم صفقة', 'Talk to Safqa')} lede={tr('اتكلم بالمصري زي ما بتكلم صاحبك: «عايز لابتوب للمذاكرة تحت ٣٠ ألف» — صفقة بتسمعك، بتدوّر في آلاف المنتجات، وبترد عليك بصوت.', 'Speak in Egyptian Arabic like you would to a friend: “a study laptop under 30k”. Safqa listens, searches thousands of products and answers out loud.')} colors={['#ec4899', '#f5b544', '#8b5cf6']}>
          <button type="button" className="press inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold" onClick={() => setVoiceOn(!voiceOn)}>{voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {voiceOn ? tr('الرد بالصوت', 'Spoken replies') : tr('الرد مكتوب بس', 'Text replies only')}</button>
        </FutureHero>
        <div className="glass relative flex flex-col items-center overflow-hidden rounded-[2rem] p-6 text-center">
          <Orb level={level} mode={mode} />
          <button type="button" data-sfx="none" disabled={!supported || mode === 'think'} onClick={() => void listen()} aria-label={mode === 'listen' ? tr('وقّف', 'Stop') : tr('اتكلم', 'Speak')}
            className={`press -mt-44 grid h-24 w-24 place-items-center rounded-full text-white shadow-2xl transition sm:-mt-52 ${mode === 'listen' ? 'bg-pink-500 shadow-pink-500/50' : 'bg-gradient-to-br from-amber-400 to-pink-500 shadow-amber-500/40'} disabled:opacity-50`}>
            {mode === 'listen' ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
          </button>
          <p className="mt-24 min-h-7 text-lg font-bold sm:mt-28">{mode === 'listen' ? (heard || tr('سامعك… اتكلم 👂', 'Listening… go ahead 👂')) : mode === 'think' ? tr('بفكّر وبدوّر… 🔎', 'Thinking and searching… 🔎') : heard ? `«${heard}»` : supported ? tr('دوس على المايك واتكلم', 'Tap the mic and speak') : tr('المتصفح ده مش بيدعم التعرّف على الصوت — اكتب سؤالك تحت 👇', 'This browser has no speech recognition, so type your question below 👇')}</p>
          {reply && <p className="spring-in mt-3 max-w-2xl rounded-3xl bg-accent px-5 py-3 text-[15px] leading-7">{reply}</p>}
          <form className="mt-4 flex w-full max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { setHeard(typed); void answer(typed); setTyped(''); } }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={tr('أو اكتب: هدية لماما تحت ٢٠٠٠', 'Or type: a gift for mom under 2,000')} className="flex-1 rounded-full border border-border bg-transparent px-4 py-2.5 text-sm" />
            <button type="submit" className="press rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">{tr('اسأل', 'Ask')}</button>
          </form>
          <p className="mt-2 text-[11px] text-muted">{llm.status === 'ready' ? tr('🧠 الرد من النموذج الأوفلاين على جهازك', '🧠 Answer from the offline model on your device') : tr('☁️ الرد من وكلاء صفقة على Workers AI', '☁️ Answer from Safqa agents on Workers AI')} · {brain.status === 'ready' ? tr('البحث أوفلاين', 'offline search') : tr('البحث سحابي', 'cloud search')}</p>
        </div>
        {hits.length > 0 && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{hits.map((h, i) => <HitCard key={h.id} h={h} i={i} />)}</div>}
        {brain.status !== 'ready' && <div className="mt-5"><BrainCard /></div>}
      </div>
    </Feature>
  );
}
