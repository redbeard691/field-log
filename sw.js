/* Field Log – offline support.
   Saves every app file on the phone the first time the app opens, so it works without signal.

   WHEN YOU CHANGE ANY APP FILE: bump VERSION below (and APP_VERSION in js/common.js).
   That tells phones a new version exists; they download it in the background the next
   time the app is opened with signal, and use it from the next page they open.
   If you add a new file, add it to FILES too. */
const VERSION = "field-log-v7";
const FILES = [
  "./", "./index.html", "./week.html", "./timesheet.html", "./backup.html",
  "./css/styles.css",
  "./js/common.js", "./js/log.js", "./js/week.js", "./js/timesheet.js", "./js/backup.js",
  "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

// Install: download fresh copies of every file (cache: "reload" skips the phone's web cache).
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

// Activate: delete files saved by older versions.
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Every request: use the copy saved on the phone (instant, works offline).
// Anything not saved yet is fetched from the internet and saved for next time.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(saved => saved || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error()))
  );
});
