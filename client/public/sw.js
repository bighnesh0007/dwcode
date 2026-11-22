/*
 * DWCode service worker (Phase F PWA).
 *
 *  - Built assets (/_next/static) are immutable: cache-first.
 *  - Public pages: network-first; when offline, the last copy of that page
 *    or the offline page. Personal pages (profile, admin, drafts…) are never
 *    stored, so nothing private stays on a shared device.
 *  - The API (/backend) and auth are never cached: answers and coins must be live.
 */
const VERSION = "dwcode-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PUBLIC_PAGES = ["/problems", "/blog", "/roadmap", "/certification", "/changelog", "/leaderboard", "/contests", "/privacy", "/terms", "/jobs", "/mentors"];
const isPublicPage = (path) => path === "/" || PUBLIC_PAGES.some((p) => path === p || path.startsWith(`${p}/`));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/backend") || url.pathname.startsWith("/api") || url.pathname.startsWith("/sign-")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && isPublicPage(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (isPublicPage(url.pathname) && (await caches.match(req))) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});
