import './lib/admin-bounce';
import './lib/clean-url';
import './lib/device';
import { startEarlyProduct } from './lib/early';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './fx/fx';
import {
  captureGoogleRedirectFromLocation,
  completeGoogleRedirectLogin,
} from './lib/google-oauth';
import { PrefsProvider } from './lib/prefs';
import { SessionProvider } from './lib/session';
import './styles.css';
import './styles-v5.css';
import { installPremiumFx } from './fx/premium';
import { installRemote } from './lib/remote';
import { installTapSounds } from './lib/sound';

startEarlyProduct(window.location.pathname);

// Must run before the router is created: Google returns /auth/callback#id_token=...
captureGoogleRedirectFromLocation();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const root = document.getElementById('root');
if (!root) throw new Error('root missing');

// Download the router + pages in parallel with the price snapshot (was sequential).
const routerModule = import('./router');
/** Where to land once the router exists (Google sign-in result). */
let afterBoot: string | null = null;

if (import.meta.env.VITE_DEMO_MODE === 'static') {
  const { installDemoApi } = await import('./lib/demo-api');
  await installDemoApi(`${import.meta.env.BASE_URL}demo/snapshot.json`);
  // Real backend (Cloudflare) for accounts, sync, chat, payments; demo stays as the offline fallback.
  (await import('./lib/edge')).installEdgeBridge();
  // The member's tier (limits, perks, flair) comes from the server; cached for offline.
  void (await import('./lib/tiers')).syncServerTier();
  const google = await completeGoogleRedirectLogin();
  if (google?.ok) afterBoot = '/dashboard';
  else if (google && !google.ok) afterBoot = '/login';
  else if (window.location.pathname === '/auth/callback') afterBoot = '/login';
}
// v5: remote config + telemetry (Safqa Hub), a voice for every tap, premium motion.
installRemote();
installTapSounds();
installPremiumFx();
const { router } = await routerModule;
if (afterBoot) router.history.replace(afterBoot);

// Invite links: remember who invited this browser (local only).
const ref = new URLSearchParams(window.location.search).get('ref');
if (ref) {
  const key = 'safqa.referral.v1';
  const current = JSON.parse(window.localStorage.getItem(key) ?? '{}');
  if (current.code !== ref && !current.referredBy)
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...current, referredBy: ref }),
    );
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <SessionProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </SessionProvider>
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}
