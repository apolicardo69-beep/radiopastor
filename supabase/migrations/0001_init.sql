-- =========================================================
-- Console Graça & Paz — schema inicial
-- Rode este arquivo no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → colar → Run),
-- ou via `supabase db push` se estiver usando a CLI.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- PERFIS DE EQUIPE (pastor / moderador)
-- Ouvintes NÃO têm conta — só quem transmite ou modera loga.
-- ---------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('pastor', 'moderador')),
  created_at timestamptz not null default now()
);

create or replace function is_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid()
  );
$$;

create or replace function is_pastor()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'pastor'
  );
$$;

alter table profiles enable row level security;
create policy "profiles_self_select" on profiles for select using (auth.uid() = id);
create policy "profiles_staff_select_all" on profiles for select using (is_staff());

-- ---------------------------------------------------------
-- MÚSICAS (fila da rádio)
-- ---------------------------------------------------------
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  duration_seconds int,
  storage_path text,                -- caminho dentro do bucket "musicas" (quando source = 'upload')
  source_url text,                  -- link direto de áudio (quando source = 'link')
  source text not null default 'upload' check (source in ('upload', 'link')),
  position int not null default 0,  -- ordem na fila; menor = toca antes
  requested_by text,                -- preenchido quando vem de um pedido
  created_at timestamptz not null default now(),
  constraint tracks_storage_or_url check (
    (source = 'upload' and storage_path is not null) or
    (source = 'link' and source_url is not null)
  )
);

alter table tracks enable row level security;
create policy "tracks_public_select" on tracks for select using (true);
create policy "tracks_staff_write" on tracks for insert with check (is_staff());
create policy "tracks_staff_update" on tracks for update using (is_staff());
create policy "tracks_staff_delete" on tracks for delete using (is_staff());

-- ---------------------------------------------------------
-- CONVIDADOS
-- ---------------------------------------------------------
create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  status text not null default 'pendente' check (status in ('pendente', 'conectado', 'ao_vivo', 'encerrado')),
  created_at timestamptz not null default now()
);

alter table guests enable row level security;
-- ninguém lê a tabela de convidados direto (evita listar convites de outras pessoas);
-- o acesso é sempre pelas funções abaixo, que verificam o token.
create policy "guests_staff_select" on guests for select using (is_staff());
create policy "guests_staff_write" on guests for insert with check (is_staff());
create policy "guests_staff_update" on guests for update using (is_staff());

-- convidado abre o link com o token e só assim descobre os próprios dados
create or replace function get_guest_by_token(p_token text)
returns table (id uuid, name text, status text)
language sql
security definer
stable
as $$
  select id, name, status from guests where invite_token = p_token;
$$;

-- convidado atualiza o próprio status (ex: "conectado" ao abrir a página)
create or replace function guest_set_status(p_token text, p_status text)
returns void
language plpgsql
security definer
as $$
begin
  if p_status not in ('conectado', 'ao_vivo', 'encerrado') then
    raise exception 'status inválido';
  end if;
  update guests set status = p_status where invite_token = p_token;
end;
$$;

-- ---------------------------------------------------------
-- ESTADO DA TRANSMISSÃO (uma linha só, sempre id = 1)
-- ---------------------------------------------------------
create table if not exists broadcast_state (
  id smallint primary key default 1 check (id = 1),
  is_live boolean not null default false,
  pastor_name text not null default 'Pastor',
  guest_id uuid references guests(id) on delete set null,
  guest_live boolean not null default false,
  now_playing_track_id uuid references tracks(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into broadcast_state (id) values (1) on conflict (id) do nothing;

alter table broadcast_state enable row level security;
create policy "broadcast_state_public_select" on broadcast_state for select using (true);
create policy "broadcast_state_staff_update" on broadcast_state for update using (is_staff());

-- ---------------------------------------------------------
-- MENSAGENS (chat + pedidos, texto ou áudio)
-- client_id: um id anônimo gerado no navegador do ouvinte
-- (guardado em localStorage), usado só para limitar spam —
-- não é uma conta nem identifica a pessoa de verdade.
-- ---------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  -- "kind" é o MEIO da mensagem (texto digitado ou áudio gravado);
  -- "type" é o PROPÓSITO dela (bate-papo comum ou pedido de música).
  -- Nomes de valores propositalmente diferentes um do outro (texto/áudio vs.
  -- chat/pedido) pra nunca ficar ambíguo qual coluna um "chat" se refere.
  kind text not null check (kind in ('texto', 'audio')),
  content text,
  audio_storage_path text,
  type text not null default 'chat' check (type in ('chat', 'pedido')),
  is_guest boolean not null default false,
  fulfilled boolean not null default false,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  constraint content_or_audio check (
    (kind = 'texto' and content is not null) or
    (kind = 'audio' and audio_storage_path is not null)
  )
);

create index if not exists messages_created_at_idx on messages (created_at desc);
create index if not exists messages_client_id_idx on messages (client_id, created_at desc);

alter table messages enable row level security;
create policy "messages_public_select" on messages for select using (true);
create policy "messages_public_insert" on messages for insert with check (true);
create policy "messages_staff_update" on messages for update using (is_staff());

-- Limite simples de envio: no máx. 5 mensagens por minuto por client_id.
-- Evita que um ouvinte (ou um bot) inunde o chat.
create or replace function enforce_message_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from messages
  where client_id = new.client_id
    and created_at > now() - interval '1 minute';

  if recent_count >= 5 then
    raise exception 'Muitas mensagens em pouco tempo — espere um instante.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on messages;
create trigger messages_rate_limit
  before insert on messages
  for each row execute function enforce_message_rate_limit();

-- ---------------------------------------------------------
-- PATROCINADORES
-- ---------------------------------------------------------
create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text,
  logo_storage_path text,
  active boolean not null default true,
  display_every_n_tracks int not null default 9,
  created_at timestamptz not null default now()
);

alter table sponsors enable row level security;
create policy "sponsors_public_select" on sponsors for select using (active = true or is_staff());
create policy "sponsors_staff_write" on sponsors for insert with check (is_staff());
create policy "sponsors_staff_update" on sponsors for update using (is_staff());
create policy "sponsors_staff_delete" on sponsors for delete using (is_staff());

-- ---------------------------------------------------------
-- REALTIME: habilita as tabelas que o app escuta ao vivo
-- ---------------------------------------------------------
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table broadcast_state;
alter publication supabase_realtime add table tracks;
alter publication supabase_realtime add table guests;
