/*
 * DayFlow service worker — deliberately minimal.
 *
 * It caches exactly one file: /offline.html. Nothing else is ever stored, so no Day/Goal/Review/Recovery data, no
 * auth or API response and no app JavaScript can be served stale:
 * - Only same-origin GET page navigations are handled, always from the network. If the network fails, the
 *   "인터넷 연결이 필요해요" page is shown instead of a browser error.
 * - /api/** (auth rewrite: exchange / refresh / logout), /auth/** (Google login callback) and /login are never
 *   touched, and neither is any cross-origin request (Railway API, Google) or any non-GET request.
 * - Every deployment serves new HTML and JS straight from the network; bump CACHE when offline.html changes.
 */
const CACHE = "dayflow-offline-v1";
const OFFLINE_URL = "/offline.html";
const EXCLUDED_PREFIXES = ["/api/", "/auth/", "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** True only for a same-origin GET page navigation outside the excluded paths. */
function handlesNavigation(request) {
  if (request.method !== "GET" || request.mode !== "navigate") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => url.pathname === prefix.replace(/\/$/, "") || url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  if (!handlesNavigation(event.request)) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((response) => response || Response.error())),
  );
});
