/*
 * service-worker.js
 * PWA offline support: precache the app shell, cache-first for the pinned
 * magick-wasm CDN assets (safe because the version is pinned in the URL).
 */
const CACHE = 'magick-webcli-v2';
const APP_SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'operations.js',
  'zip-writer.js',
  'imagemagick-worker.js',
  'manifest.json',
  'icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isCdnAsset = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com';
  const isAppShell = url.origin === self.location.origin;

  if (!isCdnAsset && !isAppShell) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && (isCdnAsset || isAppShell)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    }),
  );
});
