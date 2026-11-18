import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrefsProvider } from './lib/prefs';
import { SessionProvider } from './lib/session';
import { ToastProvider } from './fx/fx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const root = document.getElementById('root');
if (!root) throw new Error('root missing');

if (import.meta.env.VITE_DEMO_MODE === 'static') {
  const { installDemoApi } = await import('./lib/demo-api');
  await installDemoApi(`${import.meta.env.BASE_URL}demo/snapshot.json`);
}
const { router } = await import('./router');

// Invite links: remember who invited this browser (local only).
const ref = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search).get('ref');
if (ref) {
  const key = 'safqa.referral.v1';
  const current = JSON.parse(window.localStorage.getItem(key) ?? '{}');
  if (current.code !== ref && !current.referredBy) window.localStorage.setItem(key, JSON.stringify({ ...current, referredBy: ref }));
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
