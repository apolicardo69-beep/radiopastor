-- Dados de exemplo — opcional, só para testar o app localmente.
-- Rode manualmente se quiser (Dashboard → SQL Editor).

update broadcast_state set pastor_name = 'Pr. Josué' where id = 1;

insert into sponsors (name, tagline, active, display_every_n_tracks) values
  ('Farmácia Saúde Total', 'Cuidando de você com amor', true, 9),
  ('Pizzaria Dom Sabor', 'O melhor da cidade', true, 9),
  ('Imob. Conquista', 'Seu lar dos sonhos', false, 9)
on conflict do nothing;

-- Músicas de exemplo apontam para arquivos que você precisa subir no bucket
-- "musicas" com esses mesmos nomes (ou troque storage_path pelo caminho real).
insert into tracks (title, artist, duration_seconds, storage_path, position) values
  ('Quão Grande és Tu', 'Ministério Palavra Viva', 227, 'exemplo/quao-grande-es-tu.mp3', 0),
  ('Deus te abençoe', 'Fernandinho', 252, 'exemplo/deus-te-abencoe.mp3', 1),
  ('Preciso de Ti', 'Coral Vida Nova', 235, 'exemplo/preciso-de-ti.mp3', 2)
on conflict do nothing;
