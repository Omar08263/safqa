// UI sounds (assets/sfx/*.wav — synthesised by scripts/make-sfx.mjs, CC0) + haptics. Toggle persisted in SecureStore.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

const SRC = {
  tap: require('../../assets/sfx/tap.wav'), nav: require('../../assets/sfx/nav.wav'), ok: require('../../assets/sfx/ok.wav'), no: require('../../assets/sfx/no.wav'),
  alert: require('../../assets/sfx/alert.wav'), coin: require('../../assets/sfx/coin.wav'), chime: require('../../assets/sfx/chime.wav'),
} as const;
export type Cue = keyof typeof SRC;
const players = new Map<Cue, AudioPlayer>();
let on = true, vol = 0.6, ready = false;
export async function initSfx() {
  try { on = (await SecureStore.getItemAsync('hub.sound')) !== 'off'; vol = Number((await SecureStore.getItemAsync('hub.vol')) ?? 0.6); } catch {}
  try { await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }); } catch {}
  ready = true;
}
export const soundOn = () => on;
export async function setSound(v: boolean) { on = v; await SecureStore.setItemAsync('hub.sound', v ? 'on' : 'off'); if (v) play('ok'); }
export function play(cue: Cue) {
  const hap = cue === 'ok' || cue === 'chime' ? Haptics.NotificationFeedbackType.Success : cue === 'no' ? Haptics.NotificationFeedbackType.Error : cue === 'alert' ? Haptics.NotificationFeedbackType.Warning : null;
  void (hap ? Haptics.notificationAsync(hap) : Haptics.impactAsync(cue === 'tap' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium)).catch(() => undefined);
  if (!on || !ready) return;
  try {
    let p = players.get(cue);
    if (!p) { p = createAudioPlayer(SRC[cue]); players.set(cue, p); }
    p.volume = vol; void p.seekTo(0); p.play();
  } catch {}
}
