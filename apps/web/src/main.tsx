import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrefsProvider } from './lib/prefs';
import { SessionProvider } from './lib/session';
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

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}
