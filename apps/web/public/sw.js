// Safqa service worker: offline support.
// - Hashed build assets: cache-first (they never change).
// - Pages, demo snapshot and GET API calls: network-first, falling back to cache.
const VERSION = 'safqa-v3';
const SHELL = ['/', '/index.html', '/privacy.html', '/terms.html', '/manifest.webmanifest', '/favicon.svg', '/brand/safqa-mark.svg', '/brand/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/events')) return;
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
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !authed) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(isLegal ? req : req.mode === 'navigate' ? '/index.html' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(isLegal ? req : req.mode === 'navigate' ? '/index.html' : req).then((hit) => hit || (isLegal ? undefined : caches.match('/index.html')))),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
