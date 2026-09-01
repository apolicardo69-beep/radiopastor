// =========================================================
// Console Graça & Paz — playlist-sync
//
// O Liquidsoap (streaming/liquidsoap/radio.liq) toca música lendo um arquivo
// .m3u local. Este serviço é a ponte: acompanha a tabela `tracks` do Supabase
// e mantém esse arquivo atualizado, na ordem certa.
//
// ---------------------------------------------------------------------------
// POR QUE AGORA ELE BAIXA OS ARQUIVOS (e antes não baixava)
// ---------------------------------------------------------------------------
// A versão anterior escrevia no .m3u a URL pública de cada música no Storage
// do Supabase, deixando o Liquidsoap buscar por HTTP na hora de tocar. Era
// mais simples — sem arquivo binário pra sincronizar, sem risco de disco
// cheio ou download pela metade.
//
// Só que numa rádio que toca 24 horas por dia, isso significa baixar a mesma
// música do Supabase toda vez que ela entra no ar. Umas 15 faixas por hora,
// 360 por dia. Na prática consumiu 14,5 GB de tráfego num ciclo, contra uma
// cota de 5 GB no plano gratuito — 290%, com aviso de restrição do projeto.
// Uma biblioteca de 235 MB gerando dezenas de gigas de tráfego.
//
// Agora cada música é baixada UMA vez pro disco do container e o .m3u aponta
// pro arquivo local. O Supabase só é acessado quando entra faixa nova. O
// consumo cai de dezenas de gigas por mês pro tamanho da biblioteca por
// reinício do serviço.
//
// Os cuidados que a versão anterior queria evitar estão tratados:
//  - download pela metade: baixa num arquivo .part e só renomeia no fim
//    (rename é atômico, o Liquidsoap nunca vê arquivo incompleto)
//  - disco crescendo pra sempre: música removida da biblioteca tem o arquivo
//    local apagado junto
//  - rádio muda enquanto baixa: o .m3u é escrito na hora com o que já está
//    local, usando a URL como reserva pro que ainda não baixou — assim nunca
//    há silêncio esperando download
//
// Faixas cadastradas como LINK externo continuam como URL: não estão no nosso
// Storage, então não consomem a nossa cota.
//
// ---------------------------------------------------------------------------
// VARIÁVEIS DE AMBIENTE
// ---------------------------------------------------------------------------
//   SUPABASE_URL, SUPABASE_ANON_KEY   — obrigatórias
//   PLAYLIST_FILE                     — .m3u que o Liquidsoap observa
//   MUSIC_DIR                         — onde guardar as músicas baixadas
//   POLL_INTERVAL_MS                  — de quanto em quanto tempo conferir
//
// DICA DE INFRAESTRUTURA: no Railway o disco do container é apagado a cada
// reinício, então a biblioteca é baixada de novo (235 MB, uma vez). Se o
// serviço reiniciar muitas vezes no mês, vale montar um volume em MUSIC_DIR —
// aí os arquivos sobrevivem aos reinícios e o consumo vai praticamente a zero.

import { createClient } from '@supabase/supabase-js';
import { writeFile, rename, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PLAYLIST_FILE = process.env.PLAYLIST_FILE || '/var/lib/radio-graca-paz/queue.m3u';
const MUSIC_DIR = process.env.MUSIC_DIR || '/var/lib/radio-graca-paz/musicas';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '8000', 10);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('faltam SUPABASE_URL / SUPABASE_ANON_KEY nas variáveis de ambiente');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// O caminho no Storage pode ter barras e caracteres variados; viram um nome
// de arquivo plano e previsível, pra o mesmo track cair sempre no mesmo lugar.
function nomeLocal(storagePath) {
  return storagePath.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function caminhoLocal(storagePath) {
  return join(MUSIC_DIR, nomeLocal(storagePath));
}

function urlPublica(storagePath) {
  const { data } = supabase.storage.from('musicas').getPublicUrl(storagePath);
  return data.publicUrl;
}

async function existe(caminho) {
  try {
    const info = await stat(caminho);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

// Baixa uma música pro disco. Escreve em .part e só depois renomeia: assim o
// Liquidsoap, que pode estar lendo a pasta a qualquer momento, nunca encontra
// um arquivo cortado no meio.
async function baixar(storagePath) {
  const destino = caminhoLocal(storagePath);
  const temporario = `${destino}.part`;

  const { data, error } = await supabase.storage.from('musicas').download(storagePath);
  if (error) throw new Error(error.message);

  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0) throw new Error('arquivo veio vazio');

  await writeFile(temporario, bytes);
  await rename(temporario, destino);

  return bytes.length;
}

// Apaga do disco o que não está mais na biblioteca — senão a pasta cresceria
// pra sempre conforme o pastor troca as músicas.
async function limparOrfaos(nomesEmUso) {
  let arquivos;
  try {
    arquivos = await readdir(MUSIC_DIR);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (nomesEmUso.has(arquivo)) continue;
    try {
      await unlink(join(MUSIC_DIR, arquivo));
      log(`removido do disco (não está mais na biblioteca): ${arquivo}`);
    } catch {}
  }
}

let ultimaAssinatura = null;
let rodando = false;

async function escreverM3u(linhas) {
  const assinatura = linhas.join('\n');
  if (assinatura === ultimaAssinatura) return false;
  ultimaAssinatura = assinatura;

  const conteudo = linhas.length > 0 ? assinatura + '\n' : '';
  const temporario = `${PLAYLIST_FILE}.tmp`;
  await mkdir(dirname(PLAYLIST_FILE), { recursive: true });
  await writeFile(temporario, conteudo, 'utf8');
  await rename(temporario, PLAYLIST_FILE);
  return true;
}

async function sincronizar() {
  if (rodando) return; // um download longo não pode disparar em cima do outro
  rodando = true;

  try {
    const { data: tracks, error } = await supabase
      .from('tracks')
      .select('id, title, source, source_url, storage_path, position')
      .order('position', { ascending: true });

    if (error) {
      log('erro ao buscar tracks do Supabase:', error.message);
      return;
    }

    await mkdir(MUSIC_DIR, { recursive: true });

    const nomesEmUso = new Set();
    const pendentes = [];
    const linhas = [];

    for (const track of tracks) {
      // Link externo: fora do nosso Storage, segue como URL.
      if (track.source === 'link' && track.source_url) {
        linhas.push(track.source_url);
        continue;
      }

      if (track.source === 'upload' && track.storage_path) {
        const destino = caminhoLocal(track.storage_path);
        nomesEmUso.add(nomeLocal(track.storage_path));

        if (await existe(destino)) {
          linhas.push(destino);
        } else {
          // Ainda não baixada: entra na playlist pela URL, pra rádio não ficar
          // em silêncio esperando o download, e vai pra fila.
          linhas.push(urlPublica(track.storage_path));
          pendentes.push(track);
        }
      }
    }

    if (await escreverM3u(linhas)) {
      log(`playlist atualizada: ${linhas.length} música(s)`);
    }

    // Baixa uma de cada vez: são poucas e não há pressa — melhor do que
    // disparar tudo junto e disputar banda com a transmissão ao vivo.
    if (pendentes.length > 0) {
      log(`baixando ${pendentes.length} música(s) que ainda não estão no disco...`);

      for (const track of pendentes) {
        try {
          const bytes = await baixar(track.storage_path);
          log(`baixada: ${track.title} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
        } catch (e) {
          // Fica com a URL nesta rodada e tenta de novo na próxima.
          log(`falhou ao baixar "${track.title}": ${e.message}`);
        }
      }

      // Reescreve o .m3u trocando as URLs pelos arquivos já baixados.
      const linhasFinais = [];
      for (const track of tracks) {
        if (track.source === 'link' && track.source_url) {
          linhasFinais.push(track.source_url);
        } else if (track.source === 'upload' && track.storage_path) {
          const destino = caminhoLocal(track.storage_path);
          linhasFinais.push((await existe(destino)) ? destino : urlPublica(track.storage_path));
        }
      }
      if (await escreverM3u(linhasFinais)) {
        log('playlist reescrita apontando pros arquivos locais');
      }
    }

    await limparOrfaos(nomesEmUso);
  } finally {
    rodando = false;
  }
}

log(`playlist-sync rodando — playlist em ${PLAYLIST_FILE}, músicas em ${MUSIC_DIR}`);
log(`conferindo a cada ${POLL_INTERVAL_MS}ms`);
sincronizar();
setInterval(sincronizar, POLL_INTERVAL_MS);
