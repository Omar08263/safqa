// 📦 Over-the-air updates (expo-updates + our own signed update server at safqaeg.pages.dev/ota/manifest).
// - On launch expo-updates already checks (checkAutomatically: ON_LOAD, fallbackToCacheTimeout: 0), so the
//   app never waits on the network; a downloaded update runs on the next cold start.
// - Here: also check when the app comes back to the foreground (at most every 30 min), download in the
//   background, and apply it quietly the next time the app is backgrounded (no mid-screen reload).
// - Safety: expo-updates verifies the RSA signature (certs/certificate.pem) and, if a new update crashes
//   before it finishes launching, automatically rolls back to the previous working update / the APK bundle.
//   The server can also send a signed «rollBackToEmbedded» directive (deploy/mobile/publish-ota.mjs --rollback).
import * as Updates from 'expo-updates';
import { AppState, type AppStateStatus } from 'react-native';

const MIN_GAP_MS = 30 * 60_000;
let lastCheck = 0;
let pending = false;
let busy = false;

export async function checkForOta(force = false): Promise<'none' | 'downloaded' | 'error' | 'disabled'> {
  if (__DEV__ || !Updates.isEnabled) return 'disabled';
  if (busy || (!force && Date.now() - lastCheck < MIN_GAP_MS)) return pending ? 'downloaded' : 'none';
  busy = true; lastCheck = Date.now();
  try {
    const r = await Updates.checkForUpdateAsync();
    if (r.isRollBackToEmbedded || r.isAvailable) {
      const f = await Updates.fetchUpdateAsync();
      if (f.isNew || f.isRollBackToEmbedded) { pending = true; return 'downloaded'; }
    }
    return 'none';
  } catch {
    return 'error';
  } finally {
    busy = false;
  }
}

/** Apply a downloaded update now (used by Settings → «حدّث دلوقتي»). */
export async function applyOtaNow() {
  if (pending) await Updates.reloadAsync();
}

export function otaInfo() {
  return {
    enabled: Updates.isEnabled,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
    embedded: Updates.isEmbeddedLaunch,
    createdAt: Updates.createdAt ? Updates.createdAt.toISOString() : null,
    emergency: Updates.isEmergencyLaunch, // true = a bad update crashed and we fell back automatically
    pending,
  };
}

/** Call once from the root layout. Returns an unsubscribe function. */
export function startOta(): () => void {
  if (__DEV__ || !Updates.isEnabled) return () => undefined;
  let state: AppStateStatus | string | null | undefined = AppState.currentState;
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && state !== 'active') void checkForOta();
    // Apply while the user is away: the next time they open the app it is already up to date.
    if (next === 'background' && pending) void Updates.reloadAsync().catch(() => undefined);
    state = next;
  });
  setTimeout(() => void checkForOta(true), 8_000);
  return () => sub.remove();
}
