/* Painel de e-mails: guarda o app no celular para abrir mesmo sem internet.
   Sempre tenta a versão nova primeiro; sem internet, usa a cópia guardada. Os dados (/api/) nunca vêm da cópia. */
const CACHE = 'lgemail-v3';
const ARQS = ['./', 'index.html', 'carregando.js', 'icone-192.png', 'icone-512.png', 'icone-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(r).then(resp => {
    if (resp.ok) { const c = resp.clone(); caches.open(CACHE).then(k => k.put(r.mode === 'navigate' ? 'index.html' : r, c)); }
    return resp;
  }).catch(() => caches.match(r.mode === 'navigate' ? 'index.html' : r).then(m => m || caches.match('index.html'))));
});
