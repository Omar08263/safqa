// Safqa Hub UI sounds — synthesised live with WebAudio (original, no samples; CC0 by the Safqa project).
let ctx = null, bus = null;
const K = 'hub.sound.v1';
export const sound = {
  get on() { return localStorage.getItem(K) !== 'off'; },
  set on(v) { localStorage.setItem(K, v ? 'on' : 'off'); },
  vol: Number(localStorage.getItem('hub.vol.v1') ?? 0.5),
};
function ac() {
  if (ctx) return ctx;
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  ctx = new C();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  const verb = ctx.createConvolver(); const len = ctx.sampleRate * 1.2; const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.16;
  bus = ctx.createGain(); bus.connect(comp); bus.connect(verb); verb.connect(wet); wet.connect(comp); comp.connect(ctx.destination);
  return ctx;
}
function tone(f, t0, dur, { type = 'sine', g = 0.2, to = null, q = 0 } = {}) {
  const o = ctx.createOscillator(), v = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = q;
  v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(g * sound.vol, t0 + 0.008); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(lp); lp.connect(v); v.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0, dur, f = 2400, g = 0.06) {
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), v = ctx.createGain(); s.buffer = b; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.4;
  v.gain.setValueAtTime(g * sound.vol, t0); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(bp); bp.connect(v); v.connect(bus); s.start(t0);
}
const CUES = {
  tap: (t) => { tone(1320, t, 0.06, { g: 0.07, to: 990 }); noise(t, 0.025, 5200, 0.03); },
  nav: (t) => { tone(660, t, 0.12, { g: 0.08, to: 880, type: 'triangle' }); },
  ok: (t) => { [784, 988, 1319].forEach((f, i) => tone(f, t + i * 0.07, 0.35, { g: 0.12 })); },
  no: (t) => { tone(330, t, 0.18, { g: 0.12, type: 'triangle', to: 247 }); },
  warn: (t) => { tone(880, t, 0.12, { g: 0.1 }); tone(880, t + 0.16, 0.12, { g: 0.1 }); },
  whoosh: (t) => noise(t, 0.35, 900, 0.08),
  coin: (t) => { tone(1568, t, 0.08, { g: 0.12, type: 'square' }); tone(2093, t + 0.07, 0.3, { g: 0.1, type: 'square' }); },
  chime: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.9, { g: 0.09 })); },
};
export function play(cue) {
  if (!sound.on || !CUES[cue]) return;
  try { if (!ac()) return; if (ctx.state === 'suspended') ctx.resume(); CUES[cue](ctx.currentTime + 0.01); } catch {}
}
export function installTaps() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('button,a,.switch,[data-sfx]'); if (!el) return;
    play(el.dataset.sfx || (el.tagName === 'A' ? 'nav' : 'tap'));
  }, { capture: true, passive: true });
}
