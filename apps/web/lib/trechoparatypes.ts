// ===== ALTERAÇÕES EM lib/types.ts =====
// Não substitua o arquivo — faça as duas coisas abaixo.


// -------- 1. ACRESCENTE estas duas linhas dentro da interface Sponsor
//            que já existe (migration 0006_sponsors_ia.sql):

//   whatsapp: string | null;
//   background_storage_path: string | null;

// Ficando assim:
export interface Sponsor {
  id: string;
  name: string;
  tagline: string | null;
  logo_storage_path: string | null;
  whatsapp: string | null;               // <-- nova
  background_storage_path: string | null; // <-- nova
  active: boolean;
  display_every_n_tracks: number;
  created_at: string;
}


// -------- 2. COLE este bloco no final do arquivo
//            (migration 0005_daily_message.sql):

// Mensagem do dia do pastor — tabela daily_message.
// Mesmo padrão de linha única do BroadcastState: o id é sempre 1.
export interface DailyMessage {
  id: 1;
  content: string | null;
  active: boolean;
  author_name: string | null;
  updated_at: string;
}
