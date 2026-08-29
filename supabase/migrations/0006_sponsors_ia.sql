-- =========================================================
-- Anúncios com IA + link direto pro WhatsApp do anunciante
-- Rode depois do 0001_init.sql e do 0002_storage.sql.
--
-- Não cria tabela nova: aproveita a `sponsors` que já existe e só
-- acrescenta o que faltava. Todas as colunas entram como NULL permitido,
-- então os patrocinadores já cadastrados continuam funcionando sem
-- nenhuma alteração — o card simplesmente não mostra o que estiver vazio.
-- =========================================================

-- Telefone do anunciante, só dígitos, com DDI e DDD (ex.: 5577988720718).
-- Guardar sem máscara evita ter que limpar a string toda vez que for montar
-- o link wa.me no app.
alter table sponsors add column if not exists whatsapp text;

-- Chamada curta do anúncio — é o texto que a IA sugere e o pastor aprova.
-- Fica separado de `tagline` de propósito: tagline é o que já existe hoje
-- (escrito à mão), headline é o que a IA gerou. Assim dá pra voltar atrás
-- sem perder o texto original.
alter table sponsors add column if not exists headline text;

-- Arte de fundo gerada pela IA, salva no bucket "anuncios". Guardamos o
-- caminho do arquivo, nunca a imagem em si nem o prompt — a imagem é
-- gerada UMA vez, na criação do anúncio, e depois é só um arquivo estático.
alter table sponsors add column if not exists background_storage_path text;

-- Texto do botão ("Falar no WhatsApp", "Peça um orçamento"...). Se ficar
-- nulo, o app usa um padrão.
alter table sponsors add column if not exists cta_text text;

-- =========================================================
-- Bucket das artes geradas
-- =========================================================
-- Público na leitura: o ouvinte anônimo precisa carregar a imagem do card.
insert into storage.buckets (id, name, public)
values ('anuncios', 'anuncios', true)
on conflict (id) do nothing;

-- Quem escreve no bucket é o servidor (via service role, que ignora RLS) e
-- o staff logado no Estúdio. O ouvinte só lê.
do $$
begin
  begin
    create policy "anuncios_public_read" on storage.objects
      for select using (bucket_id = 'anuncios');
  exception when duplicate_object then null;
  end;

  begin
    create policy "anuncios_staff_insert" on storage.objects
      for insert with check (bucket_id = 'anuncios' and is_staff());
  exception when duplicate_object then null;
  end;

  begin
    create policy "anuncios_staff_update" on storage.objects
      for update using (bucket_id = 'anuncios' and is_staff());
  exception when duplicate_object then null;
  end;

  begin
    create policy "anuncios_staff_delete" on storage.objects
      for delete using (bucket_id = 'anuncios' and is_staff());
  exception when duplicate_object then null;
  end;
end $$;
