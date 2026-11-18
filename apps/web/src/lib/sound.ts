/**
 * Tiny WebAudio sound kit, generated in the browser (no audio files, no
 * licences). Sounds are OFF by default; the user turns them on in the welcome
 * tour or Settings and the choice is remembered. Haptics use navigator.vibrate
 * on phones that support it and can be switched off separately.
 */
import { readLocal, useLocal, writeLocal } from './local';

export type Cue = 'tap' | 'success' | 'pop' | 'whoosh' | 'error' | 'coin' | 'welcome' | 'tier-free' | 'tier-silver' | 'tier-gold' | 'tier-diamond' | 'deal';

const SOUND_KEY = 'safqa.sound.v1';
const HAPTIC_KEY = 'safqa.haptics.v1';
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, glideTo?: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ac.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, ac.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + at);
  osc.stop(ac.currentTime + at + dur + 0.05);
}

function noise(ac: AudioContext, at: number, dur: number, gain = 0.05) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, ac.currentTime + at);
  filter.frequency.exponentialRampToValueAtTime(3200, ac.currentTime + at + dur);
  const g = ac.createGain();
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(ac.currentTime + at);
}

const recipes: Record<Cue, (ac: AudioContext) => void> = {
  tap: (ac) => tone(ac, 880, 0, 0.06, 'triangle', 0.05),
  pop: (ac) => tone(ac, 520, 0, 0.12, 'sine', 0.1, 980),
  success: (ac) => { tone(ac, 660, 0, 0.12, 'sine', 0.09); tone(ac, 990, 0.09, 0.2, 'sine', 0.08); },
  error: (ac) => { tone(ac, 300, 0, 0.14, 'square', 0.04); tone(ac, 220, 0.12, 0.2, 'square', 0.04); },
  whoosh: (ac) => noise(ac, 0, 0.35, 0.06),
  coin: (ac) => { tone(ac, 988, 0, 0.08, 'square', 0.04); tone(ac, 1319, 0.07, 0.25, 'square', 0.04); },
  deal: (ac) => { [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.07, 0.22, 'triangle', 0.07)); },
  welcome: (ac) => { noise(ac, 0, 0.4, 0.03); [392, 523, 659, 784].forEach((f, i) => tone(ac, f, 0.1 + i * 0.11, 0.5, 'sine', 0.07)); },
  'tier-free': (ac) => tone(ac, 660, 0, 0.18, 'sine', 0.08),
  'tier-silver': (ac) => { tone(ac, 784, 0, 0.2, 'sine', 0.07); tone(ac, 1175, 0.08, 0.35, 'sine', 0.05); },
  'tier-gold': (ac) => { [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.08, 0.4, 'triangle', 0.06)); },
  'tier-diamond': (ac) => { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(ac, f, i * 0.06, 0.6, 'sine', 0.05)); noise(ac, 0.3, 0.5, 0.02); },
};

export function soundEnabled(): boolean {
  return readLocal<boolean>(SOUND_KEY, false);
}
export function setSoundEnabled(on: boolean) {
  writeLocal(SOUND_KEY, on);
  if (on) play('success', true);
}
export function useSound() {
  return useLocal<boolean>(SOUND_KEY, false);
}
export function useHaptics() {
  return useLocal<boolean>(HAPTIC_KEY, true);
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
  const pattern = { light: 8, medium: 18, success: [10, 40, 18], warning: [30, 50, 30] }[kind];
  try { navigator.vibrate?.(pattern as number | number[]); } catch { /* unsupported */ }
}

/** Sound + haptic in one call for key actions. */
export function feedback(cue: Cue, kind: Parameters<typeof haptic>[0] = 'light') {
  play(cue);
  haptic(kind);
}
