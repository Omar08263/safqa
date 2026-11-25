// Refined UI sounds for the app (assets/sfx/*.wav: synthesised by scripts/make-sfx.mjs, CC0) — on by default, toggle in Settings.
// Remote kill-switch: the «ui_sounds» flag from Safqa Hub.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { flagOn } from './remote';

const SRC = {
  tap: require('../../assets/sfx/tap.wav'), nav: require('../../assets/sfx/nav.wav'), ok: require('../../assets/sfx/ok.wav'), no: require('../../assets/sfx/no.wav'),
  alert: require('../../assets/sfx/alert.wav'), coin: require('../../assets/sfx/coin.wav'), chime: require('../../assets/sfx/chime.wav'),
} as const;
export type Cue = keyof typeof SRC;
const KEY = 'safqa.sound.v1';
const players = new Map<Cue, AudioPlayer>();
let on = true, ready = false;
const subs = new Set<(v: boolean) => void>();
export async function initSfx() {
  try { on = (await AsyncStorage.getItem(KEY)) !== 'off'; } catch {}
  try { await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }); } catch {}
  ready = true;
}
export const soundOn = () => on;
export const onSound = (f: (v: boolean) => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function setSound(v: boolean) { on = v; subs.forEach((f) => f(v)); void AsyncStorage.setItem(KEY, v ? 'on' : 'off'); if (v) play('ok'); }
export function play(cue: Cue, volume = 0.55) {
  if (!on || !ready || !flagOn('ui_sounds', true)) return;
  try {
    let p = players.get(cue);
    if (!p) { p = createAudioPlayer(SRC[cue]); players.set(cue, p); }
    p.volume = volume; void p.seekTo(0); p.play();
  } catch {}
}
