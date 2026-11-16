self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys()) if(k.startsWith('freeride-')) await caches.delete(k); await self.registration.unregister();})()));
