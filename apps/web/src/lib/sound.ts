/**
 * Safqa Sound — a tiny, original UI sound kit synthesised live with WebAudio
 * (no audio files, no licences: every cue is generated here and released CC0).
 * Design brief: luxurious, warm, prestigious and sometimes cute. Soft attacks,
 * rounded low-passed tones, a short generated "velvet room" reverb, nothing
 * harsh. Master volume + on/off live in localStorage; the remote flag
 * `ui_sounds` can switch the whole kit off. Haptics use navigator.vibrate.
 */
import { readLocal, useLocal, writeLocal } from './local';

export type Cue =
  | 'tap' | 'nav' | 'soft' | 'toggle-on' | 'toggle-off' | 'success' | 'pop' | 'bubble' | 'whoosh' | 'error' | 'coin'
  | 'welcome' | 'swell' | 'magic' | 'chime' | 'sparkle' | 'shutter' | 'deal'
  | 'tier-free' | 'tier-silver' | 'tier-gold' | 'tier-diamond';

const SOUND_KEY = 'safqa.sound.v1';
const VOL_KEY = 'safqa.sound.vol.v1';
const HAPTIC_KEY = 'safqa.haptics.v1';
const TAPS_KEY = 'safqa.sound.taps.v1';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: GainNode | null = null;
let remoteOff = false;

function impulse(ac: AudioContext, seconds = 1.6, decay = 3.2) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = volume();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowpass'; warmth.frequency.value = 7200; warmth.Q.value = 0.5;
    master.connect(warmth).connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
const out = () => master!;

type Opt = { type?: OscillatorType; gain?: number; glide?: number; attack?: number; reverb?: number; detune?: number; pan?: number };
/** One soft voice: rounded attack, exponential tail, optional glide + reverb send. */
function tone(ac: AudioContext, freq: number, at: number, dur: number, o: Opt = {}) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + dur * 0.8);
  const peak = o.gain ?? 0.12;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc.connect(g);
  if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = o.pan; node = node.connect(p); }
  node.connect(out());
  if (wet && (o.reverb ?? 0.4) > 0) { const s = ac.createGain(); s.gain.value = o.reverb ?? 0.4; node.connect(s).connect(wet); }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
/** Bell / glass: a sine with inharmonic partials (FM-free, light on CPU). */
function bell(ac: AudioContext, f: number, at: number, dur: number, gain = 0.06, pan = 0) {
  tone(ac, f, at, dur, { gain, reverb: 0.7, pan });
  tone(ac, f * 2.76, at, dur * 0.5, { gain: gain * 0.28, reverb: 0.7, pan });
  tone(ac, f * 5.4, at, dur * 0.25, { gain: gain * 0.12, reverb: 0.8, pan });
}
/** Marimba-ish wooden tick: fundamental + 4th harmonic, very short. */
function wood(ac: AudioContext, f: number, at: number, gain = 0.07) {
  tone(ac, f, at, 0.16, { gain, attack: 0.002, reverb: 0.25 });
  tone(ac, f * 4, at, 0.05, { gain: gain * 0.35, attack: 0.001, reverb: 0.1 });
}
function noise(ac: AudioContext, at: number, dur: number, gain = 0.05, from = 600, to = 3200, q = 0.9) {
  const t = ac.currentTime + at;
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / data.length);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass'; filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.value = gain;
  src.buffer = buffer;
  const n = src.connect(filter).connect(g);
  n.connect(out());
  if (wet) { const s = ac.createGain(); s.gain.value = 0.3; n.connect(s).connect(wet); }
  src.start(t);
}

// Pentatonic-ish palette in A (440) so every cue sits in the same "key" and never clashes.
const N = { A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760 };

const recipes: Record<Cue, (ac: AudioContext) => void> = {
  // Felt-tipped tap: tiny wooden tick + air. Barely there, satisfying.
  tap: (ac) => { wood(ac, N.A5 * (0.98 + Math.random() * 0.04), 0, 0.05); noise(ac, 0, 0.025, 0.012, 3000, 5000, 2); },
  nav: (ac) => { wood(ac, N.E5, 0, 0.045); wood(ac, N.A5, 0.035, 0.03); },
  soft: (ac) => tone(ac, N.A4, 0, 0.12, { gain: 0.035, reverb: 0.3 }),
  'toggle-on': (ac) => { wood(ac, N.E5, 0, 0.055); wood(ac, N.A5, 0.05, 0.05); },
  'toggle-off': (ac) => { wood(ac, N.A5, 0, 0.045); wood(ac, N.E5, 0.05, 0.04); },
  pop: (ac) => tone(ac, N.C5, 0, 0.14, { gain: 0.08, glide: N.C6, reverb: 0.3 }),
  // Cute bubble: quick rising sine with a droplet tail.
  bubble: (ac) => { tone(ac, 380, 0, 0.09, { gain: 0.07, glide: 1100, attack: 0.003, reverb: 0.35 }); tone(ac, 1400, 0.06, 0.05, { gain: 0.02 }); },
  success: (ac) => { bell(ac, N.E5, 0, 0.9, 0.05, -0.2); bell(ac, N.A5, 0.08, 1.1, 0.05, 0.2); },
  error: (ac) => { tone(ac, N.D4, 0, 0.18, { gain: 0.07, type: 'triangle', reverb: 0.2 }); tone(ac, N.A3, 0.13, 0.26, { gain: 0.07, type: 'triangle', reverb: 0.2 }); },
  whoosh: (ac) => noise(ac, 0, 0.42, 0.05, 300, 4200, 0.7),
  coin: (ac) => { bell(ac, N.E6, 0, 0.5, 0.035); bell(ac, N.A6, 0.06, 0.7, 0.03); },
  deal: (ac) => { [N.A4, N.C5, N.E5, N.A5].forEach((f, i) => bell(ac, f, i * 0.07, 0.8, 0.04, (i - 1.5) * 0.25)); },
  chime: (ac) => { [N.E5, N.G5, N.C6].forEach((f, i) => bell(ac, f, i * 0.09, 1.2, 0.035, (i - 1) * 0.3)); },
  sparkle: (ac) => { for (let i = 0; i < 6; i += 1) bell(ac, [N.C6, N.E6, N.G6, N.A6][i % 4]! * (1 + (Math.random() - 0.5) * 0.01), i * 0.045, 0.45, 0.018, Math.random() * 1.2 - 0.6); },
  magic: (ac) => { noise(ac, 0, 0.6, 0.015, 2000, 8000, 3); [N.A4, N.C5, N.E5, N.G5, N.A5, N.C6].forEach((f, i) => bell(ac, f, 0.05 + i * 0.06, 0.9, 0.028, (i - 2.5) * 0.2)); },
  shutter: (ac) => { noise(ac, 0, 0.035, 0.09, 1800, 2400, 1.5); noise(ac, 0.06, 0.05, 0.07, 1200, 1600, 1.5); },
  // Prestige swell: a slow, warm pad that blooms then a high bell crowns it.
  swell: (ac) => { [N.A3, N.E4, N.A4, N.C5].forEach((f) => tone(ac, f, 0, 1.6, { gain: 0.03, attack: 0.5, reverb: 0.9, type: 'sine' })); bell(ac, N.A5, 0.55, 1.4, 0.04); },
  welcome: (ac) => { noise(ac, 0, 0.5, 0.02, 400, 3000); [N.A4, N.C5, N.E5, N.A5].forEach((f, i) => bell(ac, f, 0.12 + i * 0.12, 1.2, 0.04, (i - 1.5) * 0.3)); tone(ac, N.A3, 0.1, 1.4, { gain: 0.035, attack: 0.3, reverb: 0.8 }); },
  'tier-free': (ac) => bell(ac, N.E5, 0, 0.8, 0.05),
  'tier-silver': (ac) => { bell(ac, N.E5, 0, 0.9, 0.045); bell(ac, N.A5, 0.1, 1.1, 0.04); },
  'tier-gold': (ac) => { [N.A4, N.C5, N.E5, N.A5].forEach((f, i) => bell(ac, f, i * 0.09, 1.2, 0.04)); tone(ac, N.A3, 0, 1.4, { gain: 0.03, attack: 0.25, reverb: 0.9 }); },
  'tier-diamond': (ac) => { recipes.swell(ac); [N.C6, N.E6, N.G6, N.A6].forEach((f, i) => bell(ac, f, 0.5 + i * 0.07, 1.2, 0.025, (i - 1.5) * 0.4)); noise(ac, 0.45, 0.7, 0.012, 3000, 9000, 3); },
};

export const CUES = Object.keys(recipes) as Cue[];

export function soundEnabled(): boolean {
  return !remoteOff && readLocal<boolean>(SOUND_KEY, true);
}
export function setSoundEnabled(on: boolean) {
  writeLocal(SOUND_KEY, on);
  if (on) play('success', true);
}
export function useSound() {
  return useLocal<boolean>(SOUND_KEY, true);
}
export function volume(): number {
  return Math.max(0, Math.min(1, readLocal<number>(VOL_KEY, 0.55)));
}
export function setVolume(v: number) {
  writeLocal(VOL_KEY, Math.max(0, Math.min(1, v)));
  if (master && ctx) master.gain.setTargetAtTime(volume(), ctx.currentTime, 0.05);
}
export function useVolume() {
  return useLocal<number>(VOL_KEY, 0.55);
}
/** Tap sounds on every button/link (separate from event cues). */
export function useTapSounds() {
  return useLocal<boolean>(TAPS_KEY, true);
}
export function useHaptics() {
  return useLocal<boolean>(HAPTIC_KEY, true);
}
/** The Hub can mute the whole kit remotely (flag ui_sounds). */
export function setRemoteSoundOff(off: boolean) {
  remoteOff = off;
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Plays a cue if the user opted in (force skips the check for previews). */
export function play(cue: Cue, force = false) {
  if (!force && !soundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  try { recipes[cue](ac); } catch { /* audio is a nicety */ }
}

/** Short vibration on phones; respects the haptics switch and reduced motion. */
export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (!readLocal<boolean>(HAPTIC_KEY, true) || reduceMotion()) return;
  // Browsers block vibration until the first tap; skip instead of logging an error.
  if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === false) return;
  const pattern = { light: 8, medium: 18, success: [10, 40, 18], warning: [30, 50, 30] }[kind];
  try { navigator.vibrate?.(pattern as number | number[]); } catch { /* unsupported */ }
}

/** Sound + haptic in one call for key actions. */
export function feedback(cue: Cue, kind: Parameters<typeof haptic>[0] = 'light') {
  play(cue);
  haptic(kind);
}

let lastTap = 0;
/**
 * One delegated listener gives every interactive element a voice:
 * links → nav, buttons → tap, switches/checkboxes → toggle on/off,
 * and any element can pick its own with data-sfx="chime" (or "none").
 */
export function installTapSounds() {
  if (typeof document === 'undefined') return;
  document.addEventListener('pointerdown', (e) => {
    if (!soundEnabled() || !readLocal<boolean>(TAPS_KEY, true)) return;
    const now = performance.now();
    if (now - lastTap < 45) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-sfx],button,a[href],[role="button"],[role="switch"],[role="tab"],input[type="checkbox"],input[type="radio"],summary,select');
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    lastTap = now;
    const custom = el.dataset.sfx as Cue | 'none' | undefined;
    if (custom === 'none') return;
    if (custom && custom in recipes) return play(custom);
    const role = el.getAttribute('role');
    if (role === 'switch' || (el as HTMLInputElement).type === 'checkbox') {
      const on = el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked;
      return play(on ? 'toggle-off' : 'toggle-on');
    }
    if (el.tagName === 'A' || role === 'tab') return play('nav');
    play('tap');
  }, { capture: true, passive: true });
}
