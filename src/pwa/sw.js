// Dream Home's service worker (plain JS; the build fills in the file lists).
// - The app shell (the first screen's code, styles, fonts and icons) is kept
//   at install, so the app opens offline.
// - Other built files, the 3D models and pictures are kept as they're used.
//   A model's `?v=` is its version: a new one replaces the old copy.
// - The API and shared-home pages (/h/…) always go to the network.
// - A new version waits until the person taps "Update" (the page posts
//   SKIP_WAITING), so nothing changes under them mid-edit.
/* global self, caches, clients */
const VERSION = "__DH_VERSION__";
const PRECACHE = __DH_PRECACHE__;
const KNOWN = __DH_KNOWN__;
const SHELL = `dh-shell-${VERSION}`;
const KEPT = "dh-kept-v1";
// Our files don't vary by who asks (servers may still send `Vary: Origin`).
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("dh-shell-") && key !== SHELL) await caches.delete(key);
      // Built files from older versions are no use any more.
      const kept = await caches.open(KEPT);
      const current = new Set([...PRECACHE, ...KNOWN]);
      for (const request of await kept.keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/assets/") && !current.has(path)) await kept.delete(request);
      }
      await clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  // The page lists what it loaded before this worker took over (the first
  // visit): keep those too, so the app opens offline next time.
  if (event.data && event.data.type === "KEEP" && Array.isArray(event.data.urls)) event.waitUntil(keepLoaded(event.data.urls));
});

const KEEPABLE = /^\/(assets|models|looks|thumbs)\//;
async function keepLoaded(urls) {
  for (const raw of urls.slice(0, 300)) {
    if (typeof raw !== "string") continue;
    const url = new URL(raw, self.location.origin);
    if (url.origin !== self.location.origin || !KEEPABLE.test(url.pathname)) continue;
    if (await caches.match(url.href, MATCH)) continue;
    try {
      await cacheFirst(new Request(url.href), { replaceOlder: url.pathname.startsWith("/models/") });
    } catch {
      /* Offline or gone: it'll be kept the next time it's used. */
    }
  }
}

/** The cached copy, else the network's (kept for next time). */
async function cacheFirst(request, { replaceOlder = false } = {}) {
  const hit = (await caches.match(request, { ...MATCH, cacheName: SHELL })) || (await caches.match(request, { ...MATCH, cacheName: KEPT }));
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const kept = await caches.open(KEPT);
    if (replaceOlder) {
      const path = new URL(request.url).pathname;
      for (const old of await kept.keys()) if (new URL(old.url).pathname === path) await kept.delete(old);
    }
    await kept.put(request, response.clone());
  }
  return response;
}

/** The cached copy at once, refreshed from the network for next time. */
async function staleWhileRevalidate(event) {
  const kept = await caches.open(KEPT);
  const hit = await kept.match(event.request, MATCH);
  const fresh = fetch(event.request)
    .then((response) => {
      if (response.ok) kept.put(event.request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  // Never cached: the API, and shared homes (always the latest copy, with link previews).
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/h/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/", { ...MATCH, cacheName: SHELL })));
    return;
  }
  if (path.startsWith("/assets/")) return event.respondWith(cacheFirst(request));
  if (path.startsWith("/models/")) return event.respondWith(cacheFirst(request, { replaceOlder: true }));
  if (/\.(webp|png|jpg|svg|webmanifest)$/.test(path)) return event.respondWith(staleWhileRevalidate(event));
});
