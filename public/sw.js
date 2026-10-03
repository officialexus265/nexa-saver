/* NEXA-SAVER service worker.
 *
 * Deliberately conservative because this app handles money:
 *   - never touches /api/*, server functions, or any non-GET request
 *   - never caches HTML pages or user data
 *   - caches only versioned static build assets + a tiny offline fallback page
 */
const VERSION = "nexa-v2";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn") || url.pathname === "/sw.js") return;

  // Page navigations: always go to the network; show the offline page if it fails.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Hashed build assets never change, so cache-first is safe and fast.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons / manifest: serve from cache when present, otherwise the network.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});


self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
