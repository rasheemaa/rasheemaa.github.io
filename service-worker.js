const CACHE_NAME = "sheema-edit-v53";
const CORE_SHELL = [
  "/",
  "/index.html",
  "/about.html",
  "/community/",
  "/shop/",
  "/offline.html",
  "/site.webmanifest",
  "/assets/css/styles.css?v=2",
  "/assets/css/app-polish.css",
  "/assets/css/community.css?v=14",
  "/assets/css/community-seed.css?v=4",
  "/assets/js/main.js?v=3",
  "/assets/js/community-config.js?v=4",
  "/assets/js/community.js?v=24",
  "/assets/js/community-seed.js?v=6",
  "/assets/images/favicon.svg",
  "/assets/images/app-icon-192.png",
  "/assets/images/app-icon-512.png",
  "/assets/images/app-icon-maskable-512.png",
  "/assets/images/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(CORE_SHELL.map((url) =>
        fetch(new Request(url, { cache: "reload" })).then((response) => {
          if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
          return cache.put(url, response);
        })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("sheema-edit-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // The private tool owns its cache. Do not serve older Sparkle scripts from
  // the site-wide cache on visits before its scoped worker takes control.
  if (url.pathname.startsWith("/what-do-i-say/")) {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(request, { ignoreSearch: true })) || caches.match("/offline.html"))
    );
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination) || url.pathname === "/site.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const refresh = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) || Response.error();
    })());
    return;
  }

  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
