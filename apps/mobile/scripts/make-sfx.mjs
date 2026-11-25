// Generates the Hub's UI sounds as small WAV files — synthesised from scratch (no samples), released CC0.
import { writeFileSync, mkdirSync } from 'node:fs';
const SR = 44100;
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767 | 0, 44 + i * 2));
  return b;
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function render(dur, fn) { const n = Math.round(dur * SR), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = fn(i / SR); // soft reverb tail
  const taps = [[0.031, 0.25], [0.053, 0.18], [0.079, 0.12], [0.113, 0.08]]; const r = Float32Array.from(out); for (const [dl, g] of taps) { const k = Math.round(dl * SR); for (let i = k; i < n; i++) r[i] += out[i - k] * g; } return Array.from(r); }
const note = (f, t, t0, dur, g = 0.3, tone = 0) => (t < t0 ? 0 : g * env(t - t0, 0.004, dur) * (Math.sin(2 * Math.PI * f * (t - t0)) + tone * Math.sin(4 * Math.PI * f * (t - t0)) * 0.3));
const SFX = {
  tap: [0.12, (t) => note(1320 - 3000 * t, t, 0, 0.025, 0.22) + (Math.random() * 2 - 1) * 0.04 * env(t, 0.001, 0.008)],
  nav: [0.25, (t) => note(660 + 900 * t, t, 0, 0.06, 0.2, 1)],
  ok: [0.8, (t) => [784, 988, 1319].reduce((s, f, i) => s + note(f, t, i * 0.07, 0.18, 0.18), 0)],
  no: [0.4, (t) => note(330 - 150 * t, t, 0, 0.12, 0.3, 1)],
  alert: [0.7, (t) => note(880, t, 0, 0.08, 0.25) + note(1175, t, 0.16, 0.12, 0.25)],
  coin: [0.6, (t) => note(1568, t, 0, 0.04, 0.2, 1) + note(2093, t, 0.07, 0.15, 0.18, 1)],
  chime: [1.6, (t) => [523, 659, 784, 1047].reduce((s, f, i) => s + note(f, t, i * 0.09, 0.45, 0.14), 0)],
};
mkdirSync(new URL('../assets/sfx/', import.meta.url), { recursive: true });
for (const [k, [d, fn]] of Object.entries(SFX)) writeFileSync(new URL(`../assets/sfx/${k}.wav`, import.meta.url), wav(render(d, fn)));
console.log('sfx:', Object.keys(SFX).join(', '));
