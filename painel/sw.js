/* LegislaGov — app do celular: abre mesmo com internet ruim e mostra um aviso quando estiver sem conexão.
   Os dados sempre vêm do servidor (nada da Câmara fica guardado aqui). */
const VERSAO = 'lg-app-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(['./app/offline.html', './app/app-192.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match('./app/offline.html')));
});
