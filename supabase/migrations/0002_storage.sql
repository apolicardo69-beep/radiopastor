-- =========================================================
-- Buckets de Storage + políticas de acesso
-- Rode depois do 0001_init.sql
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('musicas', 'musicas', true),
  ('mensagens-audio', 'mensagens-audio', true),
  ('patrocinadores', 'patrocinadores', true)
on conflict (id) do nothing;

-- MÚSICAS: leitura pública (é isso que toca no player), escrita só da equipe.
create policy "musicas_public_read"
  on storage.objects for select
  using (bucket_id = 'musicas');

create policy "musicas_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'musicas' and is_staff());

create policy "musicas_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'musicas' and is_staff());

-- MENSAGENS DE ÁUDIO: leitura pública, e qualquer ouvinte pode enviar a sua
-- (é a mesma lógica do chat de texto — público por natureza).
create policy "mensagens_audio_public_read"
  on storage.objects for select
  using (bucket_id = 'mensagens-audio');

create policy "mensagens_audio_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'mensagens-audio');

-- PATROCINADORES: leitura pública (a arte precisa aparecer pro ouvinte),
-- escrita só da equipe.
create policy "patrocinadores_public_read"
  on storage.objects for select
  using (bucket_id = 'patrocinadores');

create policy "patrocinadores_staff_write"
  on storage.objects for insert
  with check (bucket_id = 'patrocinadores' and is_staff());

create policy "patrocinadores_staff_delete"
  on storage.objects for delete
  using (bucket_id = 'patrocinadores' and is_staff());
