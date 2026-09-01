-- =========================================================
-- Telefone do ouvinte fora da vista do público
-- Rode depois do 0001_init.sql.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA QUE ISTO CORRIGE
-- ---------------------------------------------------------------------------
-- O app do ouvinte guardava o telefone dentro do próprio author_name, no
-- formato "Carlos 📱 77988720718". Como a tabela messages é lida por qualquer
-- pessoa (é o bate-papo público), o telefone de quem escreveu ficava visível
-- pra todo mundo — inclusive pra quem só abrisse o app.
--
-- E o rótulo do campo dizia "para o Pastor / Locutor", ou seja: a pessoa
-- informava o número achando que só a equipe veria.
--
-- Esconder na tela não bastaria: qualquer um consegue consultar a tabela
-- direto com a chave pública do app. O telefone precisa sair de messages e
-- ficar numa tabela que o ouvinte não consiga ler.
--
-- ---------------------------------------------------------------------------
-- COMO FICA
-- ---------------------------------------------------------------------------
-- messages          → continua público, mas author_name passa a ter só o nome
-- message_contacts  → telefone, gravável por qualquer um (o ouvinte registra o
--                     próprio contato ao mandar a mensagem) e legível SÓ pela
--                     equipe da locução
-- =========================================================

create table if not exists message_contacts (
  -- Uma linha por mensagem. Se a mensagem for apagada, o contato vai junto.
  message_id uuid primary key references messages(id) on delete cascade,
  whatsapp text not null,
  created_at timestamptz not null default now()
);

alter table message_contacts enable row level security;

-- O ouvinte é anônimo: ele precisa poder registrar o próprio telefone junto da
-- mensagem que acabou de enviar. Escrever é liberado, igual já é em messages.
create policy "message_contacts_public_insert" on message_contacts
  for insert with check (true);

-- Ler, só pastor/moderador. É esta linha que resolve o vazamento.
create policy "message_contacts_staff_select" on message_contacts
  for select using (is_staff());

-- =========================================================
-- Limpeza do que já foi gravado errado
-- =========================================================
-- Sem isto, as mensagens antigas continuariam expondo o telefone pra sempre.
-- Primeiro copiamos o número pra tabela protegida...
insert into message_contacts (message_id, whatsapp)
select id, btrim(split_part(author_name, '📱', 2))
from messages
where author_name like '%📱%'
  and btrim(split_part(author_name, '📱', 2)) <> ''
on conflict (message_id) do nothing;

-- ...e só então tiramos o número do nome que fica visível no bate-papo.
update messages
set author_name = btrim(split_part(author_name, '📱', 1))
where author_name like '%📱%';

-- Realtime: o Estúdio precisa receber o contato assim que a mensagem chega,
-- pra o botão do WhatsApp aparecer sem recarregar a página.
do $$
begin
  begin
    alter publication supabase_realtime add table message_contacts;
  exception when duplicate_object then null;
  end;
end $$;
