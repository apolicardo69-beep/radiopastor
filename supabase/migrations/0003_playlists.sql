-- =========================================================
-- Playlists personalizadas (Estúdio → Músicas)
-- Rode depois do 0001_init.sql e 0002_storage.sql.
--
-- As 6 vinhetas da "cartucheira" (Estúdio → botões de disparo) NÃO têm
-- tabela própria: ficam salvas no localStorage do navegador do próprio
-- pastor (arquivo/link + nome de cada botão). Isso significa que a
-- configuração dos botões é por aparelho — se o pastor usar o app em mais
-- de um celular, cada um guarda sua própria configuração das vinhetas. Se
-- no futuro fizer sentido sincronizar isso entre aparelhos, dá pra criar
-- uma tabela `jingle_slots` seguindo o mesmo padrão desta migration.
-- =========================================================

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table playlists enable row level security;
create policy "playlists_staff_select" on playlists for select using (is_staff());
create policy "playlists_staff_write" on playlists for insert with check (is_staff());
create policy "playlists_staff_update" on playlists for update using (is_staff());
create policy "playlists_staff_delete" on playlists for delete using (is_staff());

create table if not exists playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id uuid not null references tracks(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists playlist_items_playlist_id_idx on playlist_items (playlist_id, position);

alter table playlist_items enable row level security;
create policy "playlist_items_staff_select" on playlist_items for select using (is_staff());
create policy "playlist_items_staff_write" on playlist_items for insert with check (is_staff());
create policy "playlist_items_staff_update" on playlist_items for update using (is_staff());
create policy "playlist_items_staff_delete" on playlist_items for delete using (is_staff());

-- "if not exists" nas tabelas acima já cobre o caso de você ter criado
-- essas tabelas manualmente antes de rodar esta migration; o bloco abaixo
-- faz o mesmo pras duas linhas de "alter publication", que dão erro se a
-- tabela já estiver na publicação (em vez de simplesmente ignorar).
do $$
begin
  begin
    alter publication supabase_realtime add table playlists;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table playlist_items;
  exception when duplicate_object then null;
  end;
end $$;
