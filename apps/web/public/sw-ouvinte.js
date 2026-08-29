// Service worker do app do OUVINTE. Existe só pra habilitar a instalação
// como app de verdade (ícone próprio, tela cheia, sem barra do navegador) —
// de propósito SEM guardar nada em cache: este app depende de dados que
// mudam a todo momento (se está ao vivo, o chat, a playlist, o
// patrocinador da vez), e um service worker que armazena páginas ou
// respostas em cache corre o risco real de mostrar informação desatualizada
// pro ouvinte.
//
// IMPORTANTE — por que o handler de 'fetch' está vazio:
//
// A versão anterior fazia `event.respondWith(fetch(event.request))`,
// pensando que isso fosse um repasse neutro. Não é. Chamar respondWith faz
// o service worker assumir a responsabilidade pela requisição e reemiti-la
// de dentro dele, o que pode quebrar chamadas para outros domínios (as do
// Supabase, no nosso caso) — e quebrar em silêncio: o app carrega, mas o
// chat vem vazio e nenhum patrocinador aparece. Isso só acontecia no app
// instalado, porque lá o service worker controla a página desde o primeiro
// instante; no navegador, na primeira visita, a página costuma carregar
// antes de ele assumir.
//
// Um listener de 'fetch' que NÃO chama respondWith deixa o navegador tratar
// cada requisição do jeito normal, como se não houvesse service worker
// nenhum — e ainda assim satisfaz a exigência do Chrome de haver um handler
// de fetch pra considerar o app instalável. Se um dia for preciso cachear
// algo aqui, trate cada caso explicitamente e NUNCA repasse tudo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
