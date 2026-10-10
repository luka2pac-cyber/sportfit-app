// Sport&Fit GYM — service worker di pulizia.
// Una versione precedente salvava index.html in cache e mostrava sempre la vecchia app.
// Questo file cancella tutte le cache, si disattiva e ricarica la pagina con la versione aggiornata.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { c.navigate(c.url); });
    } catch (e) {}
  })());
});

// Nessuna gestione delle richieste: tutto viene caricato direttamente dalla rete.
