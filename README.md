# Rádio Graça & Paz

App de rádio web da igreja: o pastor transmite ao vivo direto do celular
(sozinho ou com um convidado em entrevista), toca uma playlist automática
quando ninguém está ao vivo, os ouvintes conversam em chat (texto ou áudio)
e patrocinadores aparecem na tela entre as músicas.

## Como o projeto é organizado

```
apps/
  web/            App Next.js — telas do ouvinte, da locução, do convidado
                  e dos patrocinadores. Deploy: Vercel.
  audio-bridge/   Recebe o microfone do pastor/convidado pelo navegador e
                  entrega pro Icecast como uma transmissão ao vivo comum.
                  Deploy: Railway (Docker).
  playlist-sync/  Mantém a playlist do Liquidsoap sincronizada com a tabela
                  `tracks` do Supabase. Roda JUNTO com o Liquidsoap (ver
                  streaming/liquidsoap/Dockerfile) — não é um serviço à parte.
streaming/
  icecast/        Configuração + Dockerfile do servidor de streaming.
  liquidsoap/     Script que decide "toca a playlist ou toca o microfone
                  ao vivo?", + Dockerfile combinado com o playlist-sync.
supabase/
  migrations/     Schema do banco (tabelas, permissões, funções).
  seed/           Dados de exemplo opcionais pra testar localmente.
```

Passo a passo completo de instalação: **[DEPLOY.md](./DEPLOY.md)**.

## Testando localmente

1. `cp .env.example .env` e preencha com as credenciais do seu projeto Supabase.
2. `docker compose up --build` — sobe Icecast, Liquidsoap+playlist-sync e o audio-bridge.
3. Em outro terminal: `cd apps/web && cp .env.local.example .env.local` (ajuste as
   URLs pra apontar pro `localhost`), depois `npm install && npm run dev`.
4. Abra `http://localhost:3000`.

## Testes automatizados que já validam o streaming ao vivo

`apps/audio-bridge/test/` tem um teste de ponta a ponta com navegador
headless (simula o microfone do pastor e do convidado com um tom de áudio
conhecido, e confirma por análise de frequência que o som chega misturado
do outro lado). Rode com o bridge no ar:

```
cd apps/audio-bridge/test
node run_test.mjs ./fake_pastor.wav pastor algum-token 8000
```
