const CACHE = 'wdis-v41';
const SHELL = [
  '/what-do-i-say/',
  '/what-do-i-say/index.html',
  '/what-do-i-say/styles.css?v=10',
  '/what-do-i-say/sparkle.css?v=2',
  '/what-do-i-say/trust.css?v=1',
  '/what-do-i-say/bootstrap.js?v=2',
  '/what-do-i-say/config.js?v=9',
  '/what-do-i-say/chat-app.js?v=27',
  '/what-do-i-say/sparkle.js?v=22',
  '/what-do-i-say/sparkle-cloud-mobile.js?v=2',
  '/what-do-i-say/sparkle-quality-hotfix.js?v=4',
  '/what-do-i-say/sparkle-first-draft-polish.js?v=1',
  '/what-do-i-say/sparkle-worker.js?v=21',
  '/what-do-i-say/payment-v3.js?v=2',
  '/what-do-i-say/paid-trial-access.js?v=3',
  '/what-do-i-say/lifetime-copy.js?v=1',
  '/what-do-i-say/manifest.webmanifest',
  '/assets/images/app-icon-192.png',
  '/assets/images/app-icon-512.png'
];
const FRESH = new Set(SHELL.map(path => new URL(path, self.location.origin).pathname).filter(path => /\.(js|css)$/.test(path)));

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
    const key = request;
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
      return (await cache.match(key))
        || (request.mode === 'navigate' ? await cache.match('/what-do-i-say/') : null)
        || Response.error();
    }
  })());
});