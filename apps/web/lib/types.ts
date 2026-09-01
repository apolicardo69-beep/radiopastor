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
  whatsapp?: string | null;
  headline?: string | null;
  background_storage_path?: string | null;
  cta_text?: string | null;
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

export interface JingleSlot {
  id: number; // 1 a 6
  name: string;
  // audio_url é resolvido no cliente (a partir de storage_path ou
  // source_url) — a tabela jingle_slots no banco não tem essa coluna, só
  // guarda de onde o áudio vem, igual a tabela tracks.
  audio_url: string | null;
  storage_path: string | null;
  source_url?: string | null;
  duration_seconds?: number | null;
}

// Mensagem do dia do pastor — tabela daily_message (0005_daily_message.sql).
// Mesmo padrão de linha única do BroadcastState: o id é sempre 1.
export interface DailyMessage {
  id: 1;
  content: string | null;
  // Gravação de voz da palavra do dia (0007_daily_message_audio.sql).
  // Fica no bucket "mensagens-audio", sob o prefixo "palavra-do-pastor/".
  // Texto e áudio são independentes: pode haver só um, ou os dois.
  audio_storage_path: string | null;
  active: boolean;
  author_name: string | null;
  updated_at: string;
}

// Presença em tempo real dos ouvintes conectados
export interface OuvinteOnline {
  client_id: string;
  name: string;
  whatsapp?: string;
  online_at?: string;
  is_playing?: boolean;
}


