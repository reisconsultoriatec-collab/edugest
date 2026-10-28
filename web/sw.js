/* =====================================================================
 *  EduGest — service worker (aplicativo instalável)
 *  Só faz duas coisas: permite instalar o EduGest como aplicativo e,
 *  sem internet, mostra uma página explicando (offline.html).
 *  Não guarda dados do colégio nem respostas da API: tudo continua vindo
 *  sempre do servidor (dados pessoais nunca ficam no aparelho).
 * ===================================================================== */
'use strict';
const CACHE = 'edugest-app-2';
const ARQUIVOS = ['offline.html', 'assets/icones/icone-192.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('edugest-') && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  // API, scripts, estilos e PDFs: direto do servidor, sem cache aqui
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  // Sempre confere com o servidor (no-cache): página atualizada e, sem internet, o aviso em vez de uma tela velha
  ev.respondWith(fetch(new Request(req, { cache: 'no-cache' })).catch(() => caches.match('offline.html')));
});
