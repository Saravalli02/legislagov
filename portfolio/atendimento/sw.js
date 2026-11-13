/* LegislaGov · Atendimento WhatsApp — service worker
   Guarda a "casca" do app para abrir rápido. As páginas sempre buscam a
   versão nova na rede primeiro; o cache só é usado se a internet cair.
   Para forçar atualização em todas as máquinas, troque a VERSAO. */
const VERSAO = 'atendimento-v2';
const CASCA = [
  '/atendimento/',
  '/atendimento/manifest.webmanifest',
  '/atendimento/icons/icon-192.png',
  '/atendimento/icons/icon-512.png',
  '/atendimento/logo-legislagov.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // dados e login nunca ficam guardados no aparelho
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/atendimento/')))
  );
});
