-- =========================================================
-- Cartucheira de vinhetas (Estúdio → 6 botões de disparo)
-- Rode depois do 0001_init.sql.
--
-- Antes essa configuração ficava só no localStorage do navegador — cada
-- aparelho tinha a sua própria, e trocar de celular ou limpar o navegador
-- apagava tudo. Esta tabela guarda os 6 botões no banco, então qualquer
-- pastor/moderador que entrar no Estúdio, em qualquer aparelho, vê a mesma
-- cartucheira configurada.
-- =========================================================

create table if not exists jingle_slots (
  id smallint primary key check (id between 1 and 6),
  name text not null,
  storage_path text,   -- arquivo no bucket "musicas" (upload direto)
  source_url text,     -- ou um link direto de áudio, quando a vinheta foi
                        -- escolhida a partir de uma música cadastrada por link
  updated_at timestamptz not null default now()
);

alter table jingle_slots enable row level security;
create policy "jingle_slots_staff_select" on jingle_slots for select using (is_staff());
create policy "jingle_slots_staff_write" on jingle_slots for insert with check (is_staff());
create policy "jingle_slots_staff_update" on jingle_slots for update using (is_staff());

-- Os 6 botões com os nomes padrão — "on conflict do nothing" garante que
-- rodar esta migration de novo (ou numa instalação que já tem os slots
-- configurados) nunca sobrescreve o que já foi personalizado.
insert into jingle_slots (id, name) values
  (1, 'Vinheta Principal'),
  (2, 'Abertura / Chamada'),
  (3, 'Passagem de Bloco'),
  (4, 'Fundo de Oração'),
  (5, 'Hora Certa / Ao Vivo'),
  (6, 'Efeito / Aplausos')
on conflict (id) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table jingle_slots;
  exception when duplicate_object then null;
  end;
end $$;
