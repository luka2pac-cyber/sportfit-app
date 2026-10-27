// Sport&Fit GYM — service worker v3.
// Sempre la versione più recente dalla rete; la cache serve solo se sei offline.
// Necessario perché Chrome/Edge/Samsung mostrino il pulsante "Installa l'app".
const CACHE = 'sportfit-v3';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    } catch (e) {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // tutto il resto va direttamente in rete
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(async function () {
      const hit = (await caches.match(req, { ignoreSearch: true })) ||
                  (await caches.match('./', { ignoreSearch: true })) ||
                  (await caches.match('./index.html', { ignoreSearch: true }));
      return hit || Response.error();
    })
  );
});
