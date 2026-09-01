// =========================================================
// Console Graça & Paz — audio-bridge
//
// Recebe o microfone do pastor (e, opcionalmente, do convidado)
// direto do navegador via WebSocket — cada um manda pedaços de
// áudio já codificados em Opus/WebM (MediaRecorder do navegador
// faz isso sozinho, sem precisar de nenhuma lib extra no cliente).
// O bridge junta isso com FFmpeg e envia pro Icecast como uma
// fonte "ao vivo" comum, que o Liquidsoap prioriza automaticamente
// (ver streaming/liquidsoap/radio.liq).
//
// Por que WebSocket + MediaRecorder em vez de WebRTC "de verdade":
// WebRTC dá menos atraso e lida melhor com perda de pacote, mas
// exige um mixer de áudio em tempo real do zero (decodificar RTP,
// misturar PCM, tudo isso rodando perfeito sem poder testar com
// gente de verdade). MediaRecorder->WebSocket->FFmpeg é o mesmo
// truque usado por vários estúdios de rádio web na internet: mais
// simples, mais fácil de garantir que funciona, ao custo de mais
// ~1-2s de atraso. Pra uma pregação ao vivo isso é um bom negócio.
// =========================================================

import { WebSocket, WebSocketServer } from 'ws';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// O @supabase/supabase-js mais recente espera um WebSocket global (padrão em
// navegadores) mesmo quando só usamos os métodos de auth/REST, que não
// precisam dele — sem isso ele falha ao importar em runtimes Node puros.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const PORT = parseInt(process.env.PORT || '9000', 10);
const MOCK_AUTH = process.env.MOCK_AUTH === '1';

const ICECAST_HOST = process.env.ICECAST_HOST || 'localhost';
const ICECAST_HARBOR_PORT = process.env.ICECAST_HARBOR_PORT || '8005';
const HARBOR_PASSWORD = process.env.HARBOR_PASSWORD || 'CHANGE_ME_HARBOR_PASSWORD';
const ICECAST_LIVE_URL = `icecast://source:${HARBOR_PASSWORD}@${ICECAST_HOST}:${ICECAST_HARBOR_PORT}/live`;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  !MOCK_AUTH && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ---------------------------------------------------------
// Autenticação de quem está conectando
// ---------------------------------------------------------
async function authenticate({ role, token }) {
  if (MOCK_AUTH) {
    // Modo de teste local: qualquer token não vazio serve.
    // Nunca usar isso em produção — é só pra validar o pipeline de áudio
    // sem depender de um Supabase de verdade.
    if (!token) throw new Error('token ausente');
    return { name: role === 'pastor' ? 'Pastor (mock)' : `Convidado (mock): ${token}` };
  }

  if (!supabase) throw new Error('bridge sem configuração do Supabase');

  if (role === 'pastor') {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new Error('sessão do pastor inválida');
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, display_name')
      .eq('id', data.user.id)
      .single();
    if (!profile || !['pastor', 'moderador'].includes(profile.role)) {
      throw new Error('usuário não é da equipe');
    }
    return { name: profile.display_name };
  }

  if (role === 'guest') {
    const { data, error } = await supabase.rpc('get_guest_by_token', { p_token: token });
    const guest = Array.isArray(data) ? data[0] : data;
    if (error || !guest) throw new Error('convite inválido');
    await supabase.rpc('guest_set_status', { p_token: token, p_status: 'conectado' });
    return { name: guest.name, guestToken: token };
  }

  throw new Error('papel desconhecido');
}

async function setBroadcastState(patch) {
  if (!supabase) return; // modo mock: não escreve nada
  await supabase.from('broadcast_state').update(patch).eq('id', 1);
}

async function setGuestStatus(token, status) {
  if (!supabase || !token) return;
  await supabase.rpc('guest_set_status', { p_token: token, p_status: status });
}

// ---------------------------------------------------------
// Sessão de transmissão (uma só por vez, é uma rádio de igreja)
// ---------------------------------------------------------
const session = {
  pastor: null, // { ws, initChunk }
  guest: null,  // { ws, initChunk, token }
  ffmpeg: null,
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function stopFfmpeg() {
  if (session.ffmpeg) {
    log('encerrando ffmpeg atual');
    session.ffmpeg.kill('SIGTERM');
    session.ffmpeg = null;
  }
}

let rebuildAttempt = 0;

// Precisa cobrir com folga o "timeout" do input.harbor no radio.liq (5s):
// esse é o tempo máximo que o Liquidsoap pode segurar o mountpoint /live
// ocupado depois que a conexão anterior cai, mesmo quando a queda foi
// provocada por nós (por exemplo, ao trocar de "só pastor" pra "pastor +
// convidado" — testado aqui: com 4 tentativas de 1.2s, o orçamento total
// (~4.2s) ficava por um triz ABAIXO dos 5s do harbor e a transmissão
// desistia bem na hora de trazer o convidado ao ar). Com 6 tentativas de
// 1.3s (~7.8s de orçamento total) sobra folga mesmo com alguma variação.
const MAX_REBUILD_ATTEMPTS = 6;
const REBUILD_BACKOFF_MS = 1300;

// Recria o processo de ffmpeg toda vez que a composição muda
// (só pastor, ou pastor+convidado). É uma troca rápida (~1s de
// blip no áudio) — bem mais simples e confiável do que manter um
// mixer com entrada/saída dinâmica o tempo todo.
//
// `isRetry` diferencia uma chamada "nova" (pastor entrou, convidado
// entrou/saiu) de uma reconvocação automática depois de uma conexão
// recusada. Isso importa porque cada troca de composição já mata o
// ffmpeg anterior antes de subir o novo (ver stopFfmpeg() acima) —
// então quando o processo antigo finalmente dispara seu evento de
// saída, `session.ffmpeg` já aponta pro processo novo, e um reset de
// `rebuildAttempt` baseado nisso quase nunca dispararia. Sem o
// parâmetro `isRetry`, o contador ficava "vazando" tentativas entre
// trocas de composição legítimas (testado aqui: depois de uma leva de
// tentativas numa troca, uma troca seguinte — completamente saudável —
// já começava com o contador quase no limite, e eventualmente uma
// nova entrada de convidado não gerava tentativa nenhuma de novo,
// silenciosamente).
// ---------------------------------------------------------
// POR QUE NÃO DÁ PRA RECOMEÇAR O FFMPEG NO MEIO DO FLUXO
// ---------------------------------------------------------
// O navegador manda WebM contínuo: o primeiro pedaço traz o cabeçalho
// (EBML + Segment + Tracks) e os seguintes são a continuação byte a byte
// desse mesmo fluxo — não são pedaços independentes.
//
// A versão anterior tentava recomeçar o ffmpeg reenviando o cabeçalho
// guardado e continuando a alimentar de onde parou. Só que o que sai disso
// é [cabeçalho] + [metade de um cluster], e o ffmpeg não decodifica:
//
//     [matroska,webm] EBML header parsing failed
//     pipe:3: Invalid data found when processing input
//
// Pior: ele morre em poucos milissegundos, e a heurística "morreu rápido =
// o harbor recusou" classificava isso como recusa do Icecast e tentava de
// novo — do mesmo jeito, com o mesmo fluxo quebrado, seis vezes, até
// "desisti de reconectar ao harbor". A locução ficava fora do ar sem nenhum
// erro que apontasse pra causa real (visto em produção: o pastor reconectou
// depois de uma oscilação, o app mostrou AO VIVO e não saiu áudio nenhum).
//
// A correção: quando o ffmpeg precisa ser recriado com alguém já
// transmitindo, o bridge PEDE um cabeçalho novo a quem está no ar
// ({type:'restart'}), e o app reinicia o gravador. Só quando o cabeçalho
// novo chega é que o ffmpeg sobe — aí ele recebe um fluxo íntegro desde o
// começo.
//
// Isso vale pra três situações, não só pra reconexão: convidado entrando,
// convidado saindo, e nova tentativa depois de o harbor recusar. Todas
// recriam o ffmpeg com o pastor já no ar.

// Todo arquivo WebM começa com estes quatro bytes. É a diferença entre "isto
// é o começo de um fluxo" e "isto é o meio de um". Conferir aqui deixa o
// bridge imune a um app que mande a coisa errada — que foi exatamente o
// modo de falha que derrubou a transmissão.
function pareceCabecalhoWebM(buf) {
  return (
    buf &&
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  );
}

function participantes() {
  return [session.pastor, session.guest].filter(Boolean);
}

let timerConvidado = null;

function cancelarEsperaDoConvidado() {
  if (timerConvidado) {
    clearTimeout(timerConvidado);
    timerConvidado = null;
  }
}

// Derruba o ffmpeg e pede a todo mundo que está no ar um cabeçalho novo.
// Ninguém é alimentado até entregar — assim o próximo ffmpeg nasce com um
// fluxo íntegro em vez de um pedaço do meio.
function reiniciarMixagem(motivo, isRetry = false) {
  stopFfmpeg();
  cancelarEsperaDoConvidado();
  if (!isRetry) rebuildAttempt = 0;

  if (!session.pastor) {
    rebuildAttempt = 0;
    return; // sem pastor, não tem o que transmitir
  }

  for (const p of participantes()) {
    p.esperandoCabecalho = true;
    p.initChunk = null;
    try {
      p.ws.send(JSON.stringify({ type: 'restart' }));
    } catch {}
  }
  log(`pedindo cabeçalho novo a ${participantes().length} participante(s) — ${motivo}`);
}

// Chamado quando alguém entrega o cabeçalho. Monta assim que o pastor
// estiver pronto; se o convidado ainda estiver devendo o dele, dá um tempo
// curto e sobe só com o pastor em vez de deixar a rádio muda esperando.
function talvezMontar() {
  const pastor = session.pastor;
  if (!pastor || pastor.esperandoCabecalho) return;

  if (session.guest?.esperandoCabecalho) {
    if (!timerConvidado) {
      timerConvidado = setTimeout(() => {
        timerConvidado = null;
        log('convidado não mandou o cabeçalho a tempo — subindo só com o pastor');
        montarFfmpeg();
      }, 2000);
    }
    return;
  }

  cancelarEsperaDoConvidado();
  montarFfmpeg();
}

function montarFfmpeg() {
  stopFfmpeg();
  if (!session.pastor?.initChunk) return;

  // Entra na mixagem quem já tem cabeçalho. Se o convidado chegar depois,
  // a entrega dele dispara uma nova rodada e ele entra na próxima.
  const hasGuest = !!session.guest?.initChunk;
  const args = ['-nostdin', '-loglevel', 'error'];
  const stdio = ['ignore', 'pipe', 'pipe', 'pipe'];

  args.push('-f', 'webm', '-i', 'pipe:3');
  if (hasGuest) {
    stdio.push('pipe');
    args.push('-f', 'webm', '-i', 'pipe:4');
    args.push(
      '-filter_complex',
      '[0:a]aresample=async=1[a0];[1:a]aresample=async=1[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=2[aout]',
      '-map',
      '[aout]'
    );
  }
  args.push('-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-f', 'mp3', ICECAST_LIVE_URL);

  log('iniciando ffmpeg', hasGuest ? '(pastor + convidado)' : '(só pastor)');
  const ff = spawn('ffmpeg', args, { stdio });
  const startedAt = Date.now();
  let stderrBuf = '';
  ff.stderr.on('data', (d) => {
    stderrBuf += d.toString();
  });

  // CRÍTICO: um stream de stdio (em especial os pipes 3/4, que a gente
  // escreve manualmente em feed()) pode emitir 'error' — por exemplo
  // ECONNRESET quando o ffmpeg do outro lado já morreu e a gente ainda não
  // percebeu — e um EventEmitter sem listener de 'error' faz o Node
  // derrubar o PROCESSO INTEIRO (visto na prática: o bridge inteiro caiu no
  // meio de uma transmissão ao vivo por causa disso, sem nenhum log de
  // "encerrando"/"iniciando" explicando o motivo — só um stack trace de
  // ECONNRESET e o processo morto). Numa rádio ao vivo isso significa
  // silêncio total até alguém notar e reiniciar na mão, então cada stream
  // aqui precisa de um listener de erro que só loga e deixa o resto da
  // lógica (o 'close' do processo, o retry, etc.) lidar com a limpeza.
  for (const s of ff.stdio) {
    if (s && typeof s.on === 'function') {
      s.on('error', (err) => log('[ffmpeg stdio error]', err.code || err.message));
    }
  }
  ff.on('error', (err) => log('[ffmpeg process error]', err.code || err.message));
  // Usa 'close' em vez de 'exit': 'exit' pode disparar antes do stderr do
  // processo terminar de ser lido, fazendo a gente decidir se tenta de novo
  // sem ainda ter visto o motivo real da falha nos logs (visto na prática:
  // um "ffmpeg saiu" sem nenhuma linha "[ffmpeg]" antes). 'close' só
  // dispara depois que todos os streams de stdio já terminaram.
  ff.on('close', (code, sig) => {
    if (stderrBuf.trim()) log('[ffmpeg]', stderrBuf.trim());
    log('ffmpeg saiu', { code, sig });
    // Um ffmpeg que morre em menos de 1.5s costuma significar que a conexão
    // com o harbor do Liquidsoap foi recusada (ele ainda estava liberando o
    // mountpoint de uma conexão anterior — ver "timeout" em radio.liq). Em
    // vez de desistir e deixar a locução muda, tenta de novo.
    //
    // Cuidado que custou caro: essa mesma janela de 1.5s também pega o
    // ffmpeg que morreu porque o ÁUDIO estava quebrado, e aí a mensagem
    // "conexão recusada" aponta pro lugar errado. Por isso o motivo agora
    // sai do stderr do próprio ffmpeg, e por isso a nova tentativa começa
    // pedindo um cabeçalho novo em vez de reaproveitar o antigo: assim ela
    // resolve os dois casos, e não só o do harbor.
    const wasCurrent = session.ffmpeg === ff;
    if (wasCurrent && session.pastor && Date.now() - startedAt < 1500) {
      if (rebuildAttempt < MAX_REBUILD_ATTEMPTS) {
        rebuildAttempt += 1;
        const pareceAudioQuebrado = /EBML|Invalid data/i.test(stderrBuf);
        const motivo = pareceAudioQuebrado
          ? 'o ffmpeg não conseguiu decodificar o áudio'
          : 'o harbor recusou a conexão';
        log(
          `ffmpeg caiu logo no início (${motivo}) — tentando de novo (${rebuildAttempt}/${MAX_REBUILD_ATTEMPTS}) em ${REBUILD_BACKOFF_MS}ms`
        );
        session.ffmpeg = null;
        setTimeout(() => reiniciarMixagem('nova tentativa', true), REBUILD_BACKOFF_MS);
      } else {
        log('desisti de subir a transmissão depois de várias tentativas');
      }
    } else if (wasCurrent) {
      rebuildAttempt = 0;
    }
  });
  session.ffmpeg = ff;

  // O cabeçalho de cada participante abre o fluxo. Aqui ele é sempre recente
  // — foi pedido e entregue nesta rodada — então o que o ffmpeg recebe é um
  // WebM íntegro do primeiro byte em diante.
  safeWrite(ff.stdio[3], session.pastor.initChunk);
  if (hasGuest) safeWrite(ff.stdio[4], session.guest.initChunk);
}

// write() num pipe cujo outro lado (o processo ffmpeg) já morreu pode
// disparar 'error' de forma síncrona ou logo em seguida — o listener de
// 'error' acima evita o crash do processo, mas o try/catch aqui evita
// qualquer exceção síncrona da própria chamada de write.
function safeWrite(pipe, chunk) {
  if (!pipe || pipe.destroyed) return;
  try {
    pipe.write(chunk);
  } catch (err) {
    log('[ffmpeg stdio write falhou]', err.code || err.message);
  }
}

function feed(participant, chunk) {
  const idx = participant === 'pastor' ? 3 : 4;
  const pipe = session.ffmpeg?.stdio?.[idx];
  safeWrite(pipe, chunk);
}

// ---------------------------------------------------------
// HTTP & WebSocket Server
// ---------------------------------------------------------
// Um servidor HTTP simples embaixo do WebSocket só pra responder ao health
// check do Railway (que bate na porta com uma requisição HTTP comum antes
// de considerar o serviço "no ar") — o WebSocket em si continua sendo o
// único jeito de mandar áudio de verdade.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('audio-bridge OK');
});

const wss = new WebSocketServer({ server });
server.listen(PORT, '0.0.0.0', () => {
  log(`audio-bridge ouvindo em http/ws://0.0.0.0:${PORT}`);
});

// ---------------------------------------------------------
// SOBRE A RECONEXÃO DO LOCUTOR (por que existe `meuLugar`)
// ---------------------------------------------------------
// O bridge sempre soube trocar uma conexão por outra: quando um pastor chega,
// a conexão anterior é derrubada com o código 4002 e a nova toma o lugar. Isso
// é exatamente o que acontece quando o celular perde a internet e o app volta
// sozinho — o socket antigo virou zumbi e o novo precisa substituí-lo.
//
// O problema é que derrubar o socket antigo faz o 'close' DELE disparar, e o
// 'close' antigo não tinha como saber que já havia sido substituído: ele
// executava a limpeza de fim de transmissão em cima da conexão nova. Na
// prática, na ordem em que as coisas acontecem:
//
//   1. chega o pastor novo, derruba o socket antigo
//   2. session.pastor passa a apontar pro novo
//   3. o 'close' do antigo finalmente dispara e faz session.pastor = null,
//      stopFfmpeg() e is_live = false
//   4. o pastor novo manda áudio, o handler procura session.pastor, não acha
//      e descarta tudo em silêncio
//
// Resultado: o app diz "AO VIVO", o medidor do microfone se mexe, e não sai
// absolutamente nada no ar. Silêncio no meio do culto, sem nenhum erro na
// tela — o tipo de falha mais difícil de diagnosticar que existe.
//
// A correção é dar a cada conexão um crachá (`meuLugar`, o próprio objeto que
// foi guardado em session) e, antes de limpar qualquer coisa, conferir se o
// crachá ainda é o que está em session. Se não for, esta conexão já foi
// substituída e não tem mais nada pra limpar — quem assumiu cuida do resto.
wss.on('connection', (ws) => {
  let role = null;
  let guestToken = null;
  // O objeto que esta conexão ocupa dentro de `session`. Serve de identidade:
  // comparar por referência responde "eu ainda sou a conexão da vez?".
  let meuLugar = null;

  const aindaSouOAtual = () =>
    meuLugar !== null && (role === 'pastor' ? session.pastor : session.guest) === meuLugar;

  ws.once('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.close(1002, 'primeira mensagem precisa ser JSON de identificação');
      return;
    }

    try {
      const identity = await authenticate(msg);
      role = msg.role;
      guestToken = identity.guestToken || null;
      log(`${role} autenticado:`, identity.name);
      ws.send(JSON.stringify({ type: 'ready' }));
    } catch (err) {
      log('autenticação recusada:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
      ws.close(4001, 'auth');
      return;
    }

    if (role === 'pastor') {
      const anterior = session.pastor;
      // esperandoCabecalho começa true: numa conexão nova o app acabou de
      // criar o gravador, então o primeiro pedaço que vier JÁ é o cabeçalho.
      // Aqui não se pede restart — só nas recriações do ffmpeg.
      meuLugar = { ws, initChunk: null, esperandoCabecalho: true };
      // A ordem importa: primeiro o novo assume o lugar, só então o antigo é
      // derrubado. Assim, quando o 'close' do antigo disparar, ele já vai
      // encontrar o crachá novo em session e vai saber que não deve limpar
      // nada. O contrário abriria uma janela onde session.pastor está vazio.
      session.pastor = meuLugar;
      if (anterior) {
        log('pastor reconectou — substituindo a conexão anterior');
        anterior.ws.close(4002, 'substituído por nova conexão');
      }
      await setBroadcastState({ is_live: true });
    } else {
      const anterior = session.guest;
      meuLugar = { ws, initChunk: null, token: guestToken, esperandoCabecalho: true };
      session.guest = meuLugar;
      if (anterior) {
        log('convidado reconectou — substituindo a conexão anterior');
        anterior.ws.close(4002, 'substituído por nova conexão');
      }
    }

    ws.on('message', (data) => {
      if (typeof data === 'string') return; // só nos importa áudio binário aqui
      // Um socket zumbi pode voltar a si e mandar áudio depois de já ter sido
      // substituído. Se isso entrasse no ffmpeg, os pedaços de WebM de duas
      // conexões diferentes se misturariam no mesmo cano e o áudio sairia
      // embaralhado — pior do que não sair nada.
      if (!aindaSouOAtual()) return;

      if (meuLugar.esperandoCabecalho) {
        // Enquanto esperamos cabeçalho, tudo que NÃO for cabeçalho é resto do
        // fluxo antigo, ainda a caminho. Guardar isso como se fosse o começo
        // é justamente o que fazia o ffmpeg engasgar. Descarta e espera.
        if (!pareceCabecalhoWebM(data)) return;
        meuLugar.esperandoCabecalho = false;
        meuLugar.initChunk = data;
        talvezMontar();
      } else {
        feed(role, data);
      }
    });

    ws.on('close', async () => {
      // Esta conexão já foi substituída por outra (reconexão do celular, ou o
      // locutor abrindo o Estúdio num segundo aparelho). Quem assumiu está
      // transmitindo agora — encerrar a transmissão aqui derrubaria justamente
      // a conexão boa.
      if (!aindaSouOAtual()) {
        log(`${role} antigo desconectou (já substituído) — mantendo a transmissão no ar`);
        return;
      }

      log(`${role} desconectou`);
      if (role === 'pastor') {
        session.pastor = null;
        session.guest?.ws.close(4003, 'transmissão encerrada');
        session.guest = null;
        stopFfmpeg();
        await setBroadcastState({ is_live: false, guest_live: false, guest_id: null });
      } else {
        session.guest = null;
        await setGuestStatus(guestToken, 'encerrado');
        await setBroadcastState({ guest_live: false });
        // Volta a transmitir só o pastor. Ele já está no ar, então precisa
        // mandar um cabeçalho novo — senão o ffmpeg receberia o fluxo dele
        // pela metade.
        reiniciarMixagem('convidado saiu');
      }
    });
  });
});

process.on('SIGTERM', () => {
  stopFfmpeg();
  process.exit(0);
});

// Rede de segurança de última instância: os pontos conhecidos de erro (pipes
// do ffmpeg, o processo ffmpeg em si) já têm seus próprios listeners de
// 'error' acima, e é sempre melhor corrigir a causa do que confiar só nisto
// aqui. Mas numa rádio ao vivo, um processo que cai por causa de ALGUM
// evento inesperado que a gente não previu é pior do que um processo que
// continua de pé mesmo depois de logar um erro estranho — então isto fica
// como último recurso, não como substituto dos listeners específicos.
process.on('uncaughtException', (err) => {
  log('[erro não tratado — bridge continua rodando]', err.stack || err.message);
});
process.on('unhandledRejection', (err) => {
  log('[promessa rejeitada não tratada — bridge continua rodando]', err?.stack || err);
});
