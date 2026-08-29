// Service worker do app da LOCUÇÃO — mesma lógica do sw-ouvinte.js (existe
// só pra habilitar a instalação como app próprio, sem cache nenhum). Aqui
// importa ainda mais não cachear nada: o pastor precisa sempre ver o
// estado real da transmissão, nunca uma versão antiga da tela.
//
// IMPORTANTE — por que o handler de 'fetch' está vazio:
//
// A versão anterior fazia `event.respondWith(fetch(event.request))`,
// pensando que isso fosse um repasse neutro. Não é. Chamar respondWith faz
// o service worker assumir a responsabilidade pela requisição e reemiti-la
// de dentro dele, o que pode quebrar chamadas para outros domínios (as do
// Supabase, no nosso caso) — e quebrar em silêncio: a tela carrega, mas sem
// mensagens, sem playlists, sem vinhetas. Isso só aparecia no app
// instalado, porque lá o service worker controla a página desde o primeiro
// instante.
//
// Um listener de 'fetch' que NÃO chama respondWith deixa o navegador tratar
// cada requisição do jeito normal, como se não houvesse service worker
// nenhum — e ainda assim satisfaz a exigência do Chrome de haver um handler
// de fetch pra considerar o app instalável.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
