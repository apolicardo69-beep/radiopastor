// Service worker do app da LOCUÇÃO — mesma lógica do sw-ouvinte.js (existe
// só pra habilitar a instalação como app próprio, sem cache nenhum). Aqui
// importa ainda mais não cachear nada: o pastor precisa sempre ver o
// estado real da transmissão, nunca uma versão antiga da tela.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
