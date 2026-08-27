-- =========================================================
-- Criar bucket "musicas" no Supabase Storage
-- Rode no SQL Editor do Supabase (Dashboard → SQL Editor)
-- =========================================================

-- 1) Criar o bucket (público, para que os áudios possam ser tocados)
INSERT INTO storage.buckets (id, name, public)
VALUES ('musicas', 'musicas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Permitir que qualquer pessoa LEIA os arquivos (pra tocar no player)
CREATE POLICY "musicas_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'musicas');

-- 3) Permitir que staff (pastor/moderador) ENVIE arquivos
CREATE POLICY "musicas_staff_upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'musicas'
  AND (SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()))
);

-- 4) Permitir que staff DELETE arquivos
CREATE POLICY "musicas_staff_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'musicas'
  AND (SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()))
);
