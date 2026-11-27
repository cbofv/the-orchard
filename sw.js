/* The Orchard: service worker.
   - Pages (index.html, login.html) and config.js: network first, so you always
     get the latest version when online; the saved copy is used when offline.
   - Fingerprinted files (app.js?v=…): these never change at a given address,
     so they load straight from the device, with no download at all.
   Requests to other sites (Supabase, fonts) are never cached here.
   The list below is written by tools/stamp.py. */
/* stamp:start */
const CACHE = "orchard-fc3dc826";
const SHELL = [
  "./",
  "index.html",
  "login.html",
  "welcome.html",
  "config.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
  "account.css?v=dd36b4fbaa",
  "account.js?v=5ce2f55eee",
  "app.css?v=f82133b5eb",
  "app.js?v=64fb92e53f",
  "game-prompts.js?v=e1e16d990f",
  "game.css?v=ccb8bfb87d",
  "game.js?v=474223eb4e",
  "phone.css?v=f690546a58",
  "phone.js?v=c91becab60",
  "prefs.css?v=d1a1601844",
  "prefs.js?v=b5f9d5ac06",
  "social.css?v=f9a02ffeac",
  "social.js?v=2749f797a7",
  "supabase.js?v=59d39487c3",
  "ui.css?v=4227a3d61a",
  "ui.js?v=f08b331c0c"
];
/* stamp:end */

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function fromNetwork(req) {
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") { const home = await caches.match("index.html"); if (home) return home; }
    throw err;
  }
}

async function fingerprinted(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    // Drop older versions of the same file
    for (const k of await cache.keys()) {
      const u = new URL(k.url);
      if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k);
    }
  }
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(url.searchParams.has("v") ? fingerprinted(req, url) : fromNetwork(req));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
