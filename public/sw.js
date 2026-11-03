/**
 * AeroGap service worker - installability plus a cached app shell.
 *
 * Deliberately small. It never caches API calls, Convex, Clerk or anything
 * cross-origin: the data is live and the auth is cookie-bound, and a stale copy
 * of either is worse than an error.
 *
 *   Navigations   network first; the last good index.html when offline, so the
 *                 installed app opens to its own "you're offline" state instead
 *                 of the browser's dinosaur.
 *   /assets/*     cache first. Vite fingerprints these, so a cached file can
 *                 never be the wrong version of its name.
 *   everything    straight to the network.
 *
 * A new deploy ships a new sw.js byte-for-byte (the version below), which
 * installs, takes over at once and drops the old caches.
 */
const VERSION = 'v1';
const SHELL_CACHE = `aerogap-shell-${VERSION}`;
const ASSET_CACHE = `aerogap-assets-${VERSION}`;
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('aerogap-') && key !== SHELL_CACHE && key !== ASSET_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/config.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  }
});
