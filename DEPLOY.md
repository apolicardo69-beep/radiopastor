# Guia de instalação — Rádio Graça & Paz

Você disse que já tem contas no Supabase, Railway e Vercel — este guia
assume isso e vai direto ao ponto. São 4 partes, nesta ordem (cada uma
depende de dados da anterior):

1. Supabase (banco de dados, login da equipe, arquivos)
2. Railway — streaming (Icecast + Liquidsoap)
3. Railway — audio-bridge (recebe o microfone do celular)
4. Vercel — o site (apps/web)

## 1. Supabase

1. No painel do seu projeto, abra **SQL Editor → New query**, cole o
   conteúdo de `supabase/migrations/0001_init.sql` e rode. Repita com
   `supabase/migrations/0002_storage.sql`.
2. (Opcional, só pra testar com dados de exemplo) rode também
   `supabase/seed/seed.sql`.
3. Crie o login do pastor: **Authentication → Users → Add user**, preencha
   e-mail e senha. Copie o **User UID** gerado.
4. Volte no **SQL Editor** e rode (trocando os valores):
   ```sql
   insert into profiles (id, display_name, role)
   values ('COLE-O-USER-UID-AQUI', 'Pastor Fulano', 'pastor');
   ```
   Repita pra cada moderador que precisar entrar na área de locução (com
   `role = 'moderador'`).
5. Em **Project Settings → API**, anote:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — pode aparecer
     publicamente, é protegida pelas regras de acesso (RLS) que a migration
     já configurou.
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — **essa é secreta**.
     Só vai numa variável de ambiente do Railway (audio-bridge), nunca no
     site, nunca no chat, nunca num arquivo commitado.

## 2. Railway — Icecast

1. **New Project → Deploy from GitHub repo**, selecione este repositório.
2. Nas configurações do serviço: **Root Directory** = raiz do repo,
   **Dockerfile Path** = `streaming/icecast/Dockerfile`.
3. Em **Variables**, defina:
   - `ICECAST_SOURCE_PASSWORD` — invente uma senha forte.
   - `ICECAST_ADMIN_PASSWORD` — outra senha forte.
   - (`ICECAST_RELAY_PASSWORD` é opcional; se não definir, o container gera
     uma sozinha ao subir.)
4. Em **Settings → Networking**, gere um domínio público e confirme que a
   porta exposta é a **8000**.
5. Guarde a URL pública gerada — o stream final dos ouvintes vai ser
   `https://ESSE-DOMINIO/radio`.

## 3. Railway — Liquidsoap + playlist-sync

Rodam juntos no mesmo serviço (ver o porquê no comentário do
`streaming/liquidsoap/Dockerfile`).

1. **New → GitHub repo** (mesmo repositório, novo serviço dentro do mesmo
   projeto Railway).
2. **Root Directory** = raiz do repo, **Dockerfile Path** =
   `streaming/liquidsoap/Dockerfile`.
3. Variáveis:
   - `HARBOR_PASSWORD` — invente uma senha forte (guarde: o audio-bridge
     também vai precisar dela).
   - `ICECAST_SOURCE_PASSWORD` — a MESMA que você definiu no serviço do
     Icecast no passo anterior.
   - `ICECAST_HOST` — o domínio interno do serviço do Icecast no Railway
     (Railway mostra isso em **Settings → Networking → Private Networking**
     do serviço do Icecast, algo como `icecast.railway.internal`).
   - `ICECAST_PORT` = `8000`
   - `SUPABASE_URL` = a Project URL do passo 1
   - `SUPABASE_ANON_KEY` = a anon key do passo 1
4. Esse serviço não precisa de domínio público (só o Icecast e o
   audio-bridge precisam).

## 4. Railway — audio-bridge

1. **New → GitHub repo** (novo serviço, mesmo projeto).
2. **Root Directory** = `apps/audio-bridge` (aqui sim, a pasta específica —
   o Dockerfile dele já está pronto pra isso).
3. Variáveis:
   - `HARBOR_PASSWORD` — a MESMA do passo 3.
   - `ICECAST_HOST` — o mesmo domínio interno do Icecast usado no passo 3.
   - `ICECAST_HARBOR_PORT` = `8005`
   - `SUPABASE_URL` = a Project URL do passo 1
   - `SUPABASE_SERVICE_ROLE_KEY` = a service_role key **secreta** do passo 1
4. Gere um domínio público (**Settings → Networking**) — o app vai se
   conectar nele por WebSocket seguro (`wss://`).

## 5. Vercel — o site

1. **Add New → Project**, importe o repositório.
2. **Root Directory** = `apps/web`.
3. Em **Environment Variables**, defina:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` — do passo 1.
   - `NEXT_PUBLIC_ICECAST_STREAM_URL` = `https://DOMINIO-DO-ICECAST/radio`
     (passo 2).
   - `NEXT_PUBLIC_AUDIO_BRIDGE_WS_URL` = `wss://DOMINIO-DO-AUDIO-BRIDGE`
     (passo 4 — repare no `wss://`, não `https://`).
4. Deploy.

## 6. Testando tudo junto

1. Abra o site publicado → deve tocar a playlist (se você rodou o seed, ou
   depois de adicionar uma música em `/locucao/musicas`).
2. Entre em `/entrar` com o login do pastor, vá em `/locucao` e aperte
   **"Ir ao ar"** — autorize o microfone no navegador do celular. O site
   principal deve mostrar "AO VIVO" em poucos segundos.
3. Mande uma mensagem de texto e uma de áudio no chat do site principal.
4. Cadastre um patrocinador em `/locucao/patrocinadores` e confirme que a
   arte aparece na tela do ouvinte entre as músicas.
5. Crie um convite de convidado em `/locucao/convidados`, abra o link
   gerado (pode ser no seu próprio celular, por exemplo) e entre ao vivo —
   confirme que dá pra ouvir os dois ao mesmo tempo.

## O que não deu pra testar dentro deste ambiente

Este projeto foi construído e testado bastante a fundo (Icecast +
Liquidsoap rodando de verdade, o audio-bridge testado com navegador
headless simulando microfones reais, inclusive pastor e convidado ao mesmo
tempo — ver `apps/audio-bridge/test/`). A única parte que não deu pra
validar por aqui foi a construção final das imagens Docker: este ambiente
não tem acesso à internet liberado pra baixar imagens base do Docker Hub
(só repositórios de pacotes como apt/npm). Os Dockerfiles usam exatamente
os mesmos comandos (`apt-get install icecast2`, `liquidsoap`, etc.) já
validados rodando direto neste ambiente — mas vale rodar
`docker compose up --build` na sua máquina (ou deixar o próprio Railway
construir) como primeira conferência antes de anunciar pra igreja.

## Nota sobre "1000 ouvintes ao mesmo tempo"

A arquitetura escolhida (Icecast pra distribuir o áudio, Supabase Realtime
pro chat) foi desenhada pensando nisso: o Icecast é feito justamente pra
aguentar muitos ouvintes ao mesmo tempo com pouco uso de CPU por ouvinte, e
o chat passa pela infraestrutura do Supabase (não por um servidor que você
mesmo mantém). Ainda assim, antes de divulgar um evento com público grande
esperado, vale conferir os limites do seu plano do Supabase (conexões
Realtime simultâneas) e considerar testar com uma carga simulada — isso
não foi parte do que foi validado aqui.
