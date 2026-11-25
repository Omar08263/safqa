import * as Haptics from 'expo-haptics';
import { play } from './sfx';
import { getState } from './store';

export function tap() {
  play('tap', 0.4);
  if (getState().settings.haptics) void Haptics.selectionAsync().catch(() => undefined);
}
export function success() {
  play('ok');
  if (getState().settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
export function warn() {
  play('alert');
  if (getState().settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
