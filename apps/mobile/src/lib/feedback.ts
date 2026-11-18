import * as Haptics from 'expo-haptics';
import { getState } from './store';

export function tap() {
  if (getState().settings.haptics) void Haptics.selectionAsync().catch(() => undefined);
}
export function success() {
  if (getState().settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
export function warn() {
  if (getState().settings.haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
