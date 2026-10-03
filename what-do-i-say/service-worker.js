const CACHE = 'wdis-v11';
const SHELL = [
  '/what-do-i-say/',
  '/what-do-i-say/index.html',
  '/what-do-i-say/styles.css',
  '/what-do-i-say/sparkle.css',
  '/what-do-i-say/bootstrap.js',
  '/what-do-i-say/config.js',
  '/what-do-i-say/app.js',
  '/what-do-i-say/sparkle.js',
  '/what-do-i-say/sparkle-worker.js',
  '/what-do-i-say/manifest.webmanifest',
  '/assets/images/app-icon-192.png',
  '/assets/images/app-icon-512.png'
];
const FRESH = new Set(SHELL.filter(path => /\.(js|css)$/.test(path)));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith('wdis-')).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fresh = request.mode === 'navigate' || FRESH.has(url.pathname);
    const key = FRESH.has(url.pathname) ? url.pathname : request;
    if (!fresh) {
      const cached = await cache.match(key);
      if (cached) return cached;
    }
    try {
      const response = await fetch(fresh ? new Request(request, { cache: 'no-store' }) : request);
      if (response.ok) {
        try { await cache.put(key, response.clone()); } catch (_) {}
      }
      return response;
    } catch (_) {
      return (await cache.match(key, { ignoreSearch: true }))
        || (request.mode === 'navigate' ? await cache.match('/what-do-i-say/') : null)
        || Response.error();
    }
  })());
});
