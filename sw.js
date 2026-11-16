// Service worker do Painel IBGE — mude VERSAO quando quiser forçar atualização do cache
const VERSAO = 'painel-v1';
const BASICO = [
  './', 'index.html', 'painel.html', 'painel.css', 'painel.js',
  'favicon.png', 'logo-ibge.png', 'inicial.jpg', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSAO)
      .then(c => Promise.all(BASICO.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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

  // Supabase, APIs e qualquer outro domínio (CDNs, mapas): não mexe, vai direto à rede
  if (url.origin !== location.origin) return;

  // Rede primeiro (sempre a versão mais nova); se estiver sem internet, usa o cache
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(VERSAO).then(c => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
