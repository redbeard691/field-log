// Field Log offline cache. Change VERSION whenever you upload new app files.
const VERSION = "field-log-v4";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  // cache: "reload" skips the phone's web cache so a new version always stores fresh files.
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req, { cache: "no-cache" }).then(res => {
      clearTimeout(t);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
        resolve(res);
      } else reject(new Error("bad response"));
    }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // The app page: use the newest copy when there's signal (3 s limit), otherwise the saved one.
    e.respondWith(fromNetwork(req, 3000).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Icons and other files: saved copy first, refresh in the background.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(cached => {
    const net = fromNetwork(req, 8000).catch(() => cached);
    return cached || net;
  }));
});
