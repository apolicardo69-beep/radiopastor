// Extrai a faixa de áudio de um vídeo do YouTube e entrega pelo NOSSO domínio.
//
// Vai em: app/api/youtube/stream/route.ts
//
// ---------------------------------------------------------------------------
// POR QUE NÃO PODE REDIRECIONAR
// ---------------------------------------------------------------------------
// A versão anterior respondia com um redirecionamento 307 pra URL do Google.
// Funciona pra simplesmente ouvir, mas quebra o que a gente precisa aqui: o
// mixer da transmissão usa a Web Audio API, e ela se recusa a processar áudio
// de outro domínio que não mande cabeçalho de CORS — o servidor do Google não
// manda. O resultado seria o pastor ouvindo a música e os ouvintes recebendo
// silêncio, que é exatamente o problema que estamos resolvendo.
//
// Por isso aqui os bytes passam por dentro do nosso servidor: pro navegador,
// o áudio vem do mesmo domínio da página, e a Web Audio aceita sem ressalvas.
//
// ---------------------------------------------------------------------------
// SOBRE RANGE (as requisições em pedaços)
// ---------------------------------------------------------------------------
// O <audio> não baixa a música inteira de uma vez: ele pede pedaços, com o
// cabeçalho Range. Repassamos esse cabeçalho pro Google e devolvemos a
// resposta com o mesmo status (206) e os cabeçalhos de faixa. Sem isso, o
// navegador não consegue avançar a música e, em alguns casos, nem começa a
// tocar. E cada requisição fica curta, o que evita estourar o tempo limite da
// função na Vercel.
//
// ---------------------------------------------------------------------------
// LIMITAÇÕES QUE VOCÊ PRECISA SABER
// ---------------------------------------------------------------------------
// - Isto contraria os termos de uso do YouTube. Foi uma decisão consciente.
// - As URLs que o YouTube devolve expiram em algumas horas, e o formato muda
//   de tempos em tempos. Quando o YouTube mexer no site, isto para de
//   funcionar até a biblioteca youtubei.js ser atualizada. Não é "se", é
//   "quando" — conte com manutenção.
// - Transmitir música em rádio no Brasil envolve ECAD, seja qual for a fonte.

import { NextRequest, NextResponse } from 'next/server';
import { Innertube, UniversalCache } from 'youtubei.js';

export const maxDuration = 60;

let innertubeInstance: Innertube | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    innertubeInstance = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
    });
  }
  return innertubeInstance;
}

// Resolver a URL do áudio é a parte cara (consulta o YouTube inteiro). Como o
// navegador faz várias requisições Range pra mesma música, guardamos o
// resultado por um tempo curto — senão cada pedacinho de áudio dispararia uma
// consulta nova e a reprodução ficaria travando.
const CACHE_MS = 60 * 60 * 1000; // 1h (as URLs do YouTube duram mais que isso)
const cacheUrls = new Map<string, { url: string; tipo: string; expiraEm: number }>();

async function resolverUrlDoAudio(videoId: string): Promise<{ url: string; tipo: string }> {
  const agora = Date.now();
  const guardado = cacheUrls.get(videoId);
  if (guardado && guardado.expiraEm > agora) {
    return { url: guardado.url, tipo: guardado.tipo };
  }

  const yt = await getInnertube();

  // O YouTube costuma NÃO devolver os dados de streaming quando a consulta vem
  // como "site no navegador" a partir de um servidor de nuvem: ele responde
  // sem erro, só sem as faixas. Os clientes de aplicativo (iPhone/Android) em
  // geral não passam por essa verificação, então tentamos nessa ordem e
  // paramos no primeiro que devolver o áudio.
  const CLIENTES = ['IOS', 'ANDROID', 'WEB'] as const;
  type ClienteAceito = Parameters<typeof yt.getBasicInfo>[1];

  let info: Awaited<ReturnType<typeof yt.getBasicInfo>> | null = null;
  const tentativas: string[] = [];

  for (const cliente of CLIENTES) {
    try {
      const resultado = await yt.getBasicInfo(videoId, cliente as unknown as ClienteAceito);
      if (resultado?.streaming_data) {
        info = resultado;
        console.log('[YOUTUBE STREAM]', videoId, 'resolvido pelo cliente', cliente);
        break;
      }
      tentativas.push(cliente + ': sem dados de streaming');
    } catch (e) {
      tentativas.push(cliente + ': ' + (e instanceof Error ? e.message : 'falhou'));
    }
  }

  if (!info?.streaming_data) {
    console.error('[YOUTUBE STREAM]', videoId, 'nenhum cliente funcionou —', tentativas.join(' | '));
    throw new Error(
      'O YouTube não entregou o áudio deste vídeo (' + tentativas.join('; ') + ').'
    );
  }

  // Só formatos de áudio puro (sem vídeo junto), do melhor bitrate pro pior.
  const formatosAudio = info.streaming_data.adaptive_formats
    .filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  // Preferimos audio/mp4 (AAC) porque toca em qualquer navegador, incluindo
  // o Safari do iPhone, que não reproduz webm/opus.
  const melhor =
    formatosAudio.find((f) => f.mime_type?.includes('audio/mp4')) || formatosAudio[0];

  if (!melhor) {
    throw new Error('Nenhuma faixa de áudio encontrada neste vídeo.');
  }

  // decipher() é assíncrono nesta versão da youtubei.js — sem o await, o que
  // volta é a promessa, não o endereço (foi o que quebrou o build).
  const url = await melhor.decipher(yt.session.player);
  if (!url) {
    throw new Error('Não consegui liberar o endereço do áudio.');
  }

  const tipo = (melhor.mime_type || 'audio/mp4').split(';')[0];
  cacheUrls.set(videoId, { url, tipo, expiraEm: agora + CACHE_MS });

  return { url, tipo };
}

export async function GET(req: NextRequest) {
  const videoId = new URL(req.url).searchParams.get('id');

  if (!videoId || videoId.length !== 11) {
    return NextResponse.json({ error: 'ID do vídeo inválido' }, { status: 400 });
  }

  try {
    const { url, tipo } = await resolverUrlDoAudio(videoId);

    // Repassa o Range que o navegador pediu, pra reprodução em pedaços
    // funcionar (e o pastor conseguir avançar a música).
    const range = req.headers.get('range');
    const upstream = await fetch(url, {
      headers: range ? { Range: range } : {},
    });

    if (!upstream.ok && upstream.status !== 206) {
      // 403 aqui quase sempre significa URL expirada: limpamos o cache pra
      // próxima tentativa resolver de novo do zero.
      cacheUrls.delete(videoId);
      console.error('[YOUTUBE STREAM] Google respondeu', upstream.status, 'para', videoId);
      return NextResponse.json(
        { error: 'O YouTube recusou a entrega do áudio (' + upstream.status + ').' },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('content-type') || tipo);
    headers.set('Accept-Ranges', 'bytes');
    // Sem cache do lado do navegador: as URLs de origem expiram, e áudio
    // guardado com endereço vencido dá erro silencioso na próxima vez.
    headers.set('Cache-Control', 'no-store');

    const tamanho = upstream.headers.get('content-length');
    if (tamanho) headers.set('Content-Length', tamanho);

    const faixa = upstream.headers.get('content-range');
    if (faixa) headers.set('Content-Range', faixa);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar o áudio do YouTube.';
    console.error('[YOUTUBE STREAM] Falha em', videoId, '—', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
