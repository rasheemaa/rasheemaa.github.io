const CACHE_NAME = "sheema-edit-v18";

const APP_SHELL = [
  "/",
  "/index.html",
  "/about.html",
  "/shop/",
  "/shop/reflection-journal/",
  "/shop/reflection-journal-product.html",
  "/shop/gentle-weekly-planner.html",
  "/shop/reset-bundle.html",
  "/offline.html",
  "/posts/we-really-need-to-touch-some-grass.html",
  "/posts/better-late-than-never.html",
  "/posts/forgive-them-anyway.html",
  "/posts/i-wanted-to-be-able-to.html",
  "/posts/to-old-new-beginnings.html",
  "/posts/the-forgiveness-i-never-saw-coming.html",
  "/posts/lip-gloss-little-joys-and-laughing-anyway.html",
  "/posts/motherhood-without-the-highlight-reel.html",
  "/posts/my-body-changed-the-schedule.html",
  "/posts/unmasking-is-messy-and-worth-it.html",
  "/assets/css/styles.css",
  "/assets/js/main.js",
  "/assets/images/favicon.svg",
  "/assets/images/app-icon-192.png",
  "/assets/images/app-icon-512.png",
  "/assets/images/app-icon-maskable-512.png",
  "/assets/images/apple-touch-icon.png",
  "/assets/images/hero.webp",
  "/assets/images/soft-reset-collection.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(APP_SHELL.map((url) => fetch(new Request(url, { cache: "reload" })).then((response) => {
    if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
    return cache.put(url, response);
  })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })).then(async (response) => {
      if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
      return response;
    }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || caches.match("/offline.html")));
    return;
  }
  event.respondWith(fetch(request).then(async (response) => {
    if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put(request, response.clone()); }
    return response;
  }).catch(() => caches.match(request)));
});
