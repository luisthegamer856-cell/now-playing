/* Now Playing: service worker.
   Keeps a copy of the site's own files so the app opens instantly and still shows its screen without
   a connection. It never touches Spotify, lyrics or any other website, and never stores anything
   about the listener. Bump VERSION to force every device to refresh its copy. */
const VERSION = 'np-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png',
               'privacy.html', 'terms.html', 'accessibility.html', 'Sky.jpeg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // add files one by one so a missing optional file (for example Sky.jpeg) can't break the install
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Spotify, lyrics, fonts: always straight to the network

  const isPage = req.mode === 'navigate' || req.destination === 'document';
  if (isPage) {
    event.respondWith((async () => {
      try {
        // always ask the network first so a new version shows up on the next open
        const fresh = await fetch(req.mode === 'navigate' && !url.search ? req.url : req, { cache: 'no-cache' });
        // never keep a copy of a login return (?code=...&state=...)
        if (fresh.ok && !url.search) { const c = await caches.open(VERSION); c.put(req.url, fresh.clone()); }
        return fresh;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // icons, manifest, small static files: serve the saved copy and refresh it in the background
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await refresh) || Response.error();
  })());
});
