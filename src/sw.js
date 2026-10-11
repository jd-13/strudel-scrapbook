/* Service worker template. vite.config.ts fills in the version and the list of
   built files at build time and emits the result as sw.js. */

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = 'shell-' + VERSION;
const SAMPLES = 'samples-v1';
// Hosts Strudel loads sample maps and samples from.
const SAMPLE_HOSTS = ['strudel.b-cdn.net', 'raw.githubusercontent.com', 'cdn.freesound.org', 'tidalcycles.org'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page asks the waiting worker to take over when the user accepts an update.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App shell: cache first; navigations get the cached index page.
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: req.mode === 'navigate' });
        return hit || fetch(req);
      })(),
    );
    return;
  }

  if (SAMPLE_HOSTS.includes(url.hostname)) {
    const isMap = url.pathname.endsWith('.json');
    event.respondWith(
      (async () => {
        const cache = await caches.open(SAMPLES);
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok && res.type === 'cors') cache.put(req, res.clone());
            return res;
          })
          .catch((err) => {
            if (hit) return hit;
            throw err;
          });
        if (hit && !isMap) return hit; // samples never change: cache first
        if (hit) {
          event.waitUntil(network.catch(() => {})); // sample maps: serve cached, refresh in background
          return hit;
        }
        return network;
      })(),
    );
  }
});
