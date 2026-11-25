// Safqa service worker: installable, offline-first PWA.
// - Install: precache the app shell, every built chunk (/precache.json) and the price snapshot,
//   so every page — including the 400-tool toolbox — opens with no connection.
// - Hashed build assets & product photos: cache-first (they never change).
// - Pages, demo snapshot and GET API calls: network-first, falling back to the last synced copy.
const VERSION = 'safqa-v7';
const MEDIA = 'safqa-media-v1';
const SHELL = ['/', '/privacy.html', '/terms.html', '/manifest.webmanifest', '/favicon.svg', '/brand/safqa-mark.svg', '/brand/icon-192.png', '/brand/icon-512.png', '/demo/snapshot.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(VERSION);
      await c.addAll(SHELL).catch(() => undefined);
      try {
        const m = await (await fetch('/precache.json', { cache: 'no-store' })).json();
        // Small batches so a slow phone connection does not stall installation.
        for (let i = 0; i < m.files.length; i += 8) await Promise.all(m.files.slice(i, i + 8).map((f) => c.add(f).catch(() => undefined)));
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trimMedia(max = 400) {
  const c = await caches.open(MEDIA);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/events')) return;
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(
      caches.open(MEDIA).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone()).then(() => trimMedia());
        return res;
      }))),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }
  const authed = req.headers.has('authorization');
  const isLegal = url.pathname === '/privacy.html' || url.pathname === '/terms.html';
  const key = isLegal ? req : req.mode === 'navigate' ? '/' : req;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !authed) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key, { ignoreSearch: url.pathname === '/demo/snapshot.json' }).then((hit) => hit || (isLegal ? undefined : caches.match('/')))),
  );
});

// Deal alerts open the product they are about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins.find((x) => x.url.startsWith(self.location.origin));
      if (w) return w.navigate(target).then((x) => (x || w).focus());
      return self.clients.openWindow(target);
    }),
  );
});
