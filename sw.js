// Service worker for true offline use on iOS home screen.
// Cache-first for the app shell so it loads with no network at the gym.
const CACHE = 'gymlog-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './splash/splash-1320x2868.png',
  './splash/splash-1206x2622.png',
  './splash/splash-1290x2796.png',
  './splash/splash-1179x2556.png',
  './splash/splash-1284x2778.png',
  './splash/splash-1170x2532.png',
  './splash/splash-1125x2436.png',
  './splash/splash-1242x2688.png',
  './splash/splash-828x1792.png',
  './splash/splash-1242x2208.png',
  './splash/splash-750x1334.png',
  './run.html',
  './fonts/archivo-var.woff2',
  './fonts/martian-var.woff2',
  './run.webmanifest',
  './run-icon-180.png',
  './run-icon-192.png',
  './run-icon-512.png',
  './run-splash/splash-1320x2868.png',
  './run-splash/splash-1206x2622.png',
  './run-splash/splash-1290x2796.png',
  './run-splash/splash-1179x2556.png',
  './run-splash/splash-1284x2778.png',
  './run-splash/splash-1170x2532.png',
  './run-splash/splash-1125x2436.png',
  './run-splash/splash-1242x2688.png',
  './run-splash/splash-828x1792.png',
  './run-splash/splash-1242x2208.png',
  './run-splash/splash-750x1334.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresh in the background when online, but serve cache immediately.
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
