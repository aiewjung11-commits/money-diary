/* สมุดจ่ายรายวัน — service worker */
const VERSION = "money-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];
const RUNTIME = "money-runtime";
const INBOX = "share-inbox";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME && k !== INBOX).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Android share sheet: slips shared from a banking app arrive here
  if (req.method === "POST" && url.origin === location.origin && url.searchParams.has("share")) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll("slips");
        const inbox = await caches.open(INBOX);
        let i = 0;
        for (const f of files) {
          if (f && f.type && f.type.startsWith("image/")) {
            await inbox.put("./__share/" + Date.now() + "-" + (i++), new Response(f, { headers: { "Content-Type": f.type } }));
          }
        }
      } catch (err) {}
      return Response.redirect("./?shared=1", 303);
    })());
    return;
  }

  if (req.method !== "GET") return;

  // App pages: network first so updates land, cache when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Own files: cache first
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // Fonts and the OCR engine from CDNs: serve cached, refresh in background
  if (/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(url.hostname)) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
