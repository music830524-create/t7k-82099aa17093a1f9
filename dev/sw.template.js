// Offline cache (v3: grammar module). Network-first for the page and app code so updates arrive; cache fallback when offline.
const CACHE = "toeic7000-__VERSION__";
const ASSETS = ["./", "index.html", "app.js", "style.css", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "favicon.png", "grammar/grammar.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("toeic7000-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const path = new URL(req.url).pathname;
  // Example sentences and grammar JSON: cache-first (the cache name changes whenever they change).
  if (/\/ex\/(\d+-\d+|topics)\.json$/.test(path) || /\/grammar\/[a-z0-9_-]+\.json$/.test(path)) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req, { ignoreSearch: true }).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res && res.ok) c.put(req, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }
  // cache: "no-cache" revalidates with the server so a new app.js isn't held back by the browser's HTTP cache.
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
