// Tipos alinhados ao schema em supabase/migrations/0001_init.sql.
// Mantidos à mão (em vez de gerados via `supabase gen types`) pra não
// depender de acesso de rede ao projeto Supabase real neste ambiente —
// ao rodar `supabase gen types typescript` no seu projeto, pode substituir
// este arquivo pela versão gerada sem quebrar nada, desde que os nomes
// batam.

export type GuestStatus = 'pendente' | 'conectado' | 'ao_vivo' | 'encerrado';
export type MessageKind = 'texto' | 'audio';
export type MessageType = 'chat' | 'pedido';
export type StaffRole = 'pastor' | 'moderador';

export interface Profile {
  id: string;
  role: StaffRole;
  display_name: string;
  created_at: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  duration_seconds: number | null;
  storage_path: string | null;
  source_url: string | null;
  source: 'upload' | 'link';
  position: number;
  requested_by: string | null;
  created_at: string;
}

export interface Guest {
  id: string;
  name: string;
  invite_token: string;
  status: GuestStatus;
  created_at: string;
}

export interface BroadcastState {
  id: 1;
  is_live: boolean;
  pastor_name: string | null;
  guest_id: string | null;
  guest_live: boolean;
  now_playing_track_id: string | null;
  updated_at: string;
}

export interface Message {
  id: string;
  author_name: string;
  kind: MessageKind;
  content: string | null;
  audio_storage_path: string | null;
  type: MessageType;
  is_guest: boolean;
  fulfilled: boolean;
  client_id: string;
  created_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tagline: string | null;
  logo_storage_path: string | null;
  active: boolean;
  display_every_n_tracks: number;
  created_at: string;
}

export interface Playlist {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number;
  created_at: string;
}

