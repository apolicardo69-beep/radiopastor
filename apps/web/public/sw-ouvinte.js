// Service worker do app do OUVINTE. Existe só pra habilitar a instalação
// como app de verdade (ícone próprio, tela cheia, sem barra do navegador) —
// de propósito SEM guardar nada em cache: este app depende de dados que
// mudam a todo momento (se está ao vivo, o chat, a playlist, o
// patrocinador da vez), e um service worker que armazena páginas ou
// respostas em cache corre o risco real de mostrar informação desatualizada
// pro ouvinte. Cada pedido simplesmente vai direto pra rede, como se não
// houvesse service worker nenhum no meio.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
