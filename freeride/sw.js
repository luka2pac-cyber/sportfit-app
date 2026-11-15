// Sella Nevea Freeride – service worker: sempre dalla rete, cache solo offline.
const CACHE = 'freeride-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('freeride-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)).catch(() => {}); }
    return res;
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./', { ignoreSearch: true })) || Response.error()));
});
