/* PRINTS service worker template. Build script injects the revision and asset list. */
const CACHE = "prints-shell-__CACHE_VERSION__";
const PRECACHE = __PRECACHE_ASSETS__;
const SHELL_URL = new URL("./index.html", self.registration.scope).href;
const SHELL_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./mark.svg", "./wordmark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // An incomplete offline bundle must never activate.
    await cache.addAll([...SHELL_FILES, ...PRECACHE]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Keep the immediately previous build: open tabs can request old lazy
    // chunks after this worker activates. Bound retention to two builds.
    const old=names.filter(name=>name.startsWith("prints-shell-") && name!==CACHE);
    await Promise.all(old.slice(0,-1).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        // Do not overwrite the versioned offline HTML with a newer deployment's
        // HTML. Its hashed chunks may not exist in this worker's precache yet.
        // The next installed worker atomically precaches the matching new shell.
        return response;
      } catch {
        return (await (await caches.open(CACHE)).match(SHELL_URL)) || Response.error();
      }
    })());
    return;
  }

  // Never cache arbitrary, private or future API requests. Hashed build files
  // and static shell assets are the only permitted offline resources.
  const allowed = [...SHELL_FILES, ...PRECACHE].some(
    entry => url.pathname === new URL(entry, self.registration.scope).pathname);
  // Serve cached old hashed assets to still-open tabs after a deployment.
  // Unknown paths are fetched normally but never stored in the offline cache.
  const hashedAsset=/^\/assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/.test(url.pathname);
  if (!allowed && !hashedAsset) return;
  event.respondWith((async () => {
    // Static icon/manifest paths repeat across releases: always prefer the
    // active worker's cache. Only hashed chunks may use a previous version.
    const cache = await caches.open(CACHE);
    const current = await cache.match(request);
    if (current) return current;
    if (hashedAsset) {
      const previous = await caches.match(request);
      if (previous) return previous;
    }
    const response = await fetch(request);
    if (response.ok && allowed) await cache.put(request, response.clone());
    return response;
  })());
});
