-- =========================================================
-- Playlists do locutor
-- Rode no SQL Editor do Supabase (Dashboard → SQL Editor)
-- =========================================================

-- Playlists nomeadas
CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Músicas dentro de cada playlist (relação N:M com tracks)
CREATE TABLE IF NOT EXISTS playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playlist_items_playlist_idx ON playlist_items (playlist_id, position);

-- RLS
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlists_staff_select" ON playlists FOR SELECT USING (is_staff());
CREATE POLICY "playlists_staff_insert" ON playlists FOR INSERT WITH CHECK (is_staff());
CREATE POLICY "playlists_staff_update" ON playlists FOR UPDATE USING (is_staff());
CREATE POLICY "playlists_staff_delete" ON playlists FOR DELETE USING (is_staff());

ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlist_items_staff_select" ON playlist_items FOR SELECT USING (is_staff());
CREATE POLICY "playlist_items_staff_insert" ON playlist_items FOR INSERT WITH CHECK (is_staff());
CREATE POLICY "playlist_items_staff_delete" ON playlist_items FOR DELETE USING (is_staff());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE playlists;
ALTER PUBLICATION supabase_realtime ADD TABLE playlist_items;
