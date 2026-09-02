-- =========================================================
-- Moderação do bate-papo
-- Rode depois do 0008_message_contacts.sql.
--
-- ---------------------------------------------------------------------------
-- POR QUE NÃO BASTA ESCONDER NA TELA
-- ---------------------------------------------------------------------------
-- O bate-papo é público: qualquer pessoa consulta a tabela `messages` direto
-- com a chave do app. Se a mensagem ofensiva só sumisse da tela, ela
-- continuaria acessível — o mesmo erro que a gente corrigiu no telefone do
-- ouvinte. A remoção precisa valer na RLS.
--
-- E aqui tem uma armadilha do Postgres: políticas de RLS se SOMAM por OU.
-- Criar uma política nova que diz "só o que não está oculto" não esconderia
-- nada, porque a política antiga (`using (true)`) continuaria liberando tudo.
-- Por isso a de leitura é SUBSTITUÍDA, não acrescentada.
-- =========================================================

-- ---------------------------------------------------------------------------
-- 1) Ocultar mensagem (com desfazer)
-- ---------------------------------------------------------------------------
-- A linha não é apagada: fica marcada. Assim o pastor pode desfazer se tocar
-- na mensagem errada no celular, e a equipe continua sabendo o que foi
-- removido — coisa que um DELETE levaria embora para sempre.
alter table messages add column if not exists hidden boolean not null default false;
alter table messages add column if not exists hidden_at timestamptz;

drop policy if exists "messages_public_select" on messages;

create policy "messages_public_select" on messages
  for select using (hidden = false or is_staff());

-- ---------------------------------------------------------------------------
-- 2) Silenciar um ouvinte por um tempo
-- ---------------------------------------------------------------------------
-- O ouvinte é anônimo; o que identifica o aparelho dele é o client_id que o
-- app guarda no navegador e manda junto de cada mensagem. Silenciar por
-- client_id não é à prova de bala (limpar os dados do navegador gera um id
-- novo), mas resolve o caso comum de quem insiste na mesma sessão.
create table if not exists muted_listeners (
  client_id text primary key,
  until timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table muted_listeners enable row level security;

-- A lista é só da equipe. O ouvinte não precisa (nem deve) enxergá-la.
create policy "muted_staff_select" on muted_listeners for select using (is_staff());
create policy "muted_staff_insert" on muted_listeners for insert with check (is_staff());
create policy "muted_staff_update" on muted_listeners for update using (is_staff());
create policy "muted_staff_delete" on muted_listeners for delete using (is_staff());

-- A política de INSERT de `messages` precisa consultar essa tabela, mas quem
-- está inserindo é o ouvinte anônimo — que não pode lê-la. Uma função
-- SECURITY DEFINER resolve: ela responde só "sim ou não", sem expor a lista.
create or replace function esta_silenciado(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from muted_listeners
    where client_id = p_client_id
      and until > now()
  );
$$;

grant execute on function esta_silenciado(text) to anon, authenticated;

-- Substitui o INSERT público para recusar quem está silenciado. A recusa
-- acontece no banco, não na tela: não adianta mexer no app pra burlar.
drop policy if exists "messages_public_insert" on messages;

create policy "messages_public_insert" on messages
  for insert with check (not esta_silenciado(client_id));

-- ---------------------------------------------------------------------------
-- 3) Realtime
-- ---------------------------------------------------------------------------
-- O Estúdio precisa ver a lista de silenciados mudar sem recarregar.
do $$
begin
  begin
    alter publication supabase_realtime add table muted_listeners;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Conferência (opcional): as políticas de messages devem ficar assim —
--
--   messages_public_insert  INSERT  with_check: (NOT esta_silenciado(client_id))
--   messages_public_select  SELECT  qual: ((hidden = false) OR is_staff())
--   messages_staff_update   UPDATE  qual: is_staff()
--
-- select policyname, cmd, qual, with_check
-- from pg_policies where tablename = 'messages' order by cmd, policyname;
-- ---------------------------------------------------------------------------
