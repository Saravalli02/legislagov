/* LegislaGov Rural: guarda o app no celular para abrir sem internet.
   Busca a versão nova quando há internet (rede primeiro) e usa a cópia guardada quando não há. */
const CACHE = 'lgrural-v2';
const ARQS = ['./', 'index.html', 'manifest.json', 'icone-192.png', 'icone-512.png', 'icone-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(resp => { if (resp.ok) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return resp; })
    .catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});
