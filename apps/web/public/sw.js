// Service Worker para PWA da Rádio Graça & Paz
const CACHE_NAME = 'graca-paz-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições de áudio/streaming e API para não travar o stream ao vivo
  const url = new URL(event.request.url);
  if (
    url.pathname.endsWith('/radio') ||
    url.pathname.includes('/storage/v1') ||
    url.pathname.includes('/rest/v1') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

