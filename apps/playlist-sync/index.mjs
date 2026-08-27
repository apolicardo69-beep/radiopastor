// =========================================================
// Console Graça & Paz — playlist-sync
//
// O Liquidsoap (streaming/liquidsoap/radio.liq) toca música lendo um
// arquivo .m3u local — ele não fala com o Supabase diretamente. Este
// serviço é a ponte: a cada alguns segundos, busca a tabela `tracks` (na
// ordem certa) e reescreve esse arquivo com uma URL por linha.
//
// Como cada música vira uma URL (o link direto, pra faixas por link; ou a
// URL pública do arquivo no Storage, pra faixas enviadas do celular), o
// Liquidsoap consegue tocar sem precisar baixar nada antes — ele mesmo
// busca via HTTP quando chega a vez daquela faixa. Isso evita ter que
// sincronizar arquivos binários entre o Supabase e o servidor do
// Liquidsoap, que seria uma fonte extra de bugs (disco cheio, arquivo
// baixado pela metade, etc.) sem necessidade real.
//
// Escolhi POLLING (consultar de tempos em tempos) em vez de assinar
// Realtime aqui de propósito: a playlist muda pouco (o pastor adiciona
// música de vez em quando, não a cada segundo), então um polling simples a
// cada alguns segundos é muito mais fácil de deixar robusto — sem se
// preocupar com reconexão de WebSocket, backoff, etc. — pelo mesmo
// resultado prático.
import { createClient } from '@supabase/supabase-js';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PLAYLIST_FILE = process.env.PLAYLIST_FILE || '/var/lib/radio-graca-paz/queue.m3u';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '8000', 10);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('faltam SUPABASE_URL / SUPABASE_ANON_KEY nas variáveis de ambiente');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function urlDaFaixa(track) {
  if (track.source === 'link' && track.source_url) return track.source_url;
  if (track.source === 'upload' && track.storage_path) {
    const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
    return data.publicUrl;
  }
  return null;
}

let ultimaAssinatura = null;

async function sincronizar() {
  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('id, title, source, source_url, storage_path, position')
    .order('position', { ascending: true });

  if (error) {
    log('erro ao buscar tracks do Supabase:', error.message);
    return;
  }

  const linhas = tracks.map(urlDaFaixa).filter(Boolean);

  // evita reescrever o arquivo (e o Liquidsoap recarregar a playlist à toa)
  // quando nada realmente mudou desde a última vez.
  const assinatura = linhas.join('\n');
  if (assinatura === ultimaAssinatura) return;
  ultimaAssinatura = assinatura;

  const conteudo = linhas.length > 0 ? linhas.join('\n') + '\n' : '';
  const arquivoTemporario = `${PLAYLIST_FILE}.tmp`;
  await mkdir(dirname(PLAYLIST_FILE), { recursive: true });
  // escreve num arquivo temporário e renomeia por cima do de verdade —
  // rename() é atômico, então o Liquidsoap (que fica de olho no arquivo
  // final) nunca vê um arquivo pela metade sendo escrito.
  await writeFile(arquivoTemporario, conteudo, 'utf8');
  await rename(arquivoTemporario, PLAYLIST_FILE);
  log(`playlist atualizada: ${linhas.length} música(s)`);
}

log(`playlist-sync rodando — atualizando ${PLAYLIST_FILE} a cada ${POLL_INTERVAL_MS}ms`);
sincronizar();
setInterval(sincronizar, POLL_INTERVAL_MS);
