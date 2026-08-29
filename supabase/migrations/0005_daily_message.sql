-- =========================================================
-- Mensagem do dia do pastor (fixada no topo do bate-papo do ouvinte)
-- Rode depois do 0001_init.sql.
--
-- Segue o mesmo padrão de "tabela de uma linha só" que broadcast_state já
-- usa: id fixo em 1, nunca se cria nem se apaga linha, só se atualiza a
-- que existe. Por isso não há policy de INSERT pra uso normal nem de
-- DELETE — a linha é semeada aqui embaixo e vive pra sempre.
--
-- Diferença importante em relação às outras tabelas do estúdio: a leitura
-- aqui é PÚBLICA (não usa is_staff()), porque quem precisa ver a mensagem
-- é o ouvinte anônimo no app da rádio. Escrever continua restrito ao
-- pastor/moderador.
-- =========================================================

create table if not exists daily_message (
  id smallint primary key check (id = 1),
  content text,
  active boolean not null default false,
  author_name text,
  updated_at timestamptz not null default now()
);

alter table daily_message enable row level security;

-- Leitura liberada pra todo mundo (inclusive ouvinte não logado).
create policy "daily_message_public_select" on daily_message
  for select using (true);

-- Só pastor/moderador altera o texto ou liga/desliga.
create policy "daily_message_staff_update" on daily_message
  for update using (is_staff());

-- A linha única. "on conflict do nothing" garante que rodar esta migration
-- de novo não apaga a mensagem que o pastor já tiver escrito.
insert into daily_message (id, content, active, author_name)
values (1, null, false, null)
on conflict (id) do nothing;

-- Realtime: quando o pastor salvar, a mensagem aparece/some no celular dos
-- ouvintes na hora, sem ninguém precisar recarregar a página.
do $$
begin
  begin
    alter publication supabase_realtime add table daily_message;
  exception when duplicate_object then null;
  end;
end $$;
