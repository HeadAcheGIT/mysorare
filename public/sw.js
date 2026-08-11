/**
 * Service worker for the installed PWA.
 *
 * The previous version served EVERY non-/api request cache-first, including
 * the "/" HTML document it cached at install time. That HTML hard-codes the
 * build's chunk URLs, so once a new version shipped the cached document kept
 * asking for chunks that no longer existed: 404s, React unable to hydrate,
 * and a permanently broken home-screen app. It never recovered on its own
 * either — the cache name was a fixed constant, so the `activate` cleanup
 * (which deletes every cache except the current name) had nothing to delete.
 *
 * The rule that avoids that whole class of bug: never serve a stale HTML
 * document, because HTML is what pins every other asset version.
 *
 *   - Navigations (HTML)   → network first, cache only as an offline fallback.
 *   - /_next/static/*      → cache first, safe because those URLs are
 *                            content-hashed: a new build means a new URL, so
 *                            a cached entry can never be the "wrong" version.
 *   - /api/*               → never touched; data is always live.
 *   - everything else      → network first, falling back to cache offline.
 *
 * Bump VERSION on any change here: the activate handler deletes every cache
 * that isn't the current name, which is what lets an already-broken install
 * heal itself as soon as it picks this file up.
 */
const VERSION = "v2";
const SHELL_CACHE = `cockpit-shell-${VERSION}`;

/** Kept to the bare minimum — anything listed here must be safe to serve offline. */
const SHELL_FILES = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Individually, so one missing file can't abort the whole install and
      // leave the app with no worker at all.
      Promise.allSettled(SHELL_FILES.map((f) => cache.add(f)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Content-hashed build output: the URL itself changes when the content does. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Only cache real successes. Caching an opaque/error response would
    // poison the offline fallback with something we can't even inspect.
    if (fresh && fresh.ok && fresh.type === "basic") {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Offline with nothing cached for this exact request: for a navigation,
    // the app shell is still a better answer than a browser error page.
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && fresh.type === "basic") {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET is cacheable; a POST to /api/import must never be intercepted.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Sorare CDN images etc.
  if (url.pathname.startsWith("/api/")) return; // data is always live

  event.respondWith(isImmutableAsset(url) ? cacheFirst(request) : networkFirst(request));
});
