// Minimal service worker: caches the app shell so the PWA opens instantly
// and shows something even with a flaky connection. Data itself is always
// fetched fresh from /api — never cached, so you never see stale projections.
const SHELL_CACHE = "cockpit-shell-v1";
const SHELL_FILES = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // always network for data
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
