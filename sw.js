const CACHE = 'sportfit-v2';

const PRECACHE = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=Nunito:wght@800;900&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => 
      Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  
  // Suoni su sport-fit.org: prova rete, se offline ignora silenziosamente
  if(e.request.url.includes('sport-fit.org') && 
     (e.request.url.includes('.mp3') || e.request.url.includes('.wav'))) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', {status: 200}))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(resp => {
        if(!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const clone = resp.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return resp;
      }).catch(() => {
        // Fallback: restituisce index.html per navigazione
        if(e.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', {status: 200});
      });
    })
  );
});
