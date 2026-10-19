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
    await Promise.all(names
      .filter((name) => name.startsWith("prints-shell-") && name !== CACHE)
      .map((name) => caches.delete(name)));
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
        if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
          const cache = await caches.open(CACHE);
          await cache.put(SHELL_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(SHELL_URL)) || Response.error();
      }
    })());
    return;
  }

  // Never cache arbitrary, private or future API requests. Hashed build files
  // and static shell assets are the only permitted offline resources.
  const allowed = PRECACHE.some((entry) => url.pathname === new URL(entry, self.registration.scope).pathname) ||
    ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname);
  if (!allowed) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
