'use client';

// Hook compartilhado entre a tela do pastor (/locucao) e a do convidado
// (/convidado/[token]) pra transmitir o microfone do celular ao vivo.
//
// Usa Web Audio API para mixar o microfone + música de fundo (se houver) em tempo real,
// grava em pedaços de 250ms com MediaRecorder (Opus/WebM) e manda pro audio-bridge.
//
// ---------------------------------------------------------------------------
// RECONEXÃO AUTOMÁTICA
// ---------------------------------------------------------------------------
// Antes, se a internet do celular oscilasse por três segundos no meio da
// pregação, a conexão caía e não voltava sozinha: o pastor precisava perceber
// que tinha saído do ar, voltar no Estúdio e clicar em transmitir de novo.
// Num culto ao vivo esse é o pior momento possível pra descobrir isso.
//
// Agora, quando a conexão cai sem ter sido o próprio locutor que parou, o hook
// entra em 'reconectando' e tenta voltar sozinho, esperando cada vez um pouco
// mais entre as tentativas (1s, 2s, 4s, 8s, depois 15s fixo). O microfone e o
// mixer continuam montados o tempo todo — não pede permissão de novo, não
// perde o volume ajustado, e a volta é quase instantânea. Enquanto isso o
// Liquidsoap já cai na playlist automaticamente, então o ouvinte escuta música
// no lugar do silêncio.
//
// Dois detalhes que fazem a diferença na prática:
//
// 1. O MediaRecorder é reiniciado a cada reconexão, e isso NÃO é opcional. O
//    primeiro pedaço que ele entrega contém o cabeçalho do WebM; os seguintes
//    são só continuação. Se a gente reaproveitasse o gravador antigo, o
//    servidor receberia um fluxo começando no meio, sem cabeçalho, e não
//    conseguiria decodificar nada — voltaria "conectado" e mudo.
//
// 2. Existe queda que não avisa. Em rede móvel a conexão às vezes trava sem
//    fechar: o socket continua "aberto" e o áudio simplesmente não chega do
//    outro lado. Por isso o hook olha o bufferedAmount — se o que está na
//    fila pra enviar passa de meio mega, é porque nada está saindo há uns bons
//    segundos, e ele derruba e reconecta por conta própria.
import { useCallback, useEffect, useRef, useState } from 'react';

export type BroadcastStatus =
  | 'parado'
  | 'pedindo_microfone'
  | 'conectando'
  | 'ao_vivo'
  | 'reconectando'
  | 'erro';

const BRIDGE_WS_URL = process.env.NEXT_PUBLIC_AUDIO_BRIDGE_WS_URL || 'ws://localhost:9000';

// De onde sai o token de autenticação a cada tentativa de conexão.
//
// O convidado usa um texto fixo — o token do convite não vence no meio da
// entrevista. Já o pastor precisa passar uma FUNÇÃO, porque o token dele é o
// da sessão do Supabase e vence em cerca de uma hora: a função é chamada de
// novo a cada reconexão e devolve um token válido na hora.
export type FonteToken = string | (() => string | null | Promise<string | null>);

// Espera entre uma tentativa e a próxima. Começa curto porque a maioria das
// quedas é um soluço de dois segundos, e vai aumentando pra não martelar o
// servidor quando o problema é mais sério.
const ESPERA_RECONEXAO_MS = [1000, 2000, 4000, 8000, 15000];

// Teto de tentativas. Depende de já ter conseguido entrar no ar alguma vez:
//
//  - já esteve ao vivo → insiste bastante (uns 10 minutos com a escala acima).
//    A transmissão estava funcionando, então é oscilação de rede: túnel,
//    Wi-Fi reiniciando, troca de torre. Vale muito a pena esperar.
//
//  - nunca conectou → desiste rápido, em uns 15 segundos. Aqui o problema
//    provavelmente é servidor fora do ar ou endereço errado, e deixar
//    "reconectando..." girando por dez minutos só esconderia isso do pastor
//    em vez de mostrar logo que tem algo errado.
const MAX_TENTATIVAS_APOS_AO_VIVO = 40;
const MAX_TENTATIVAS_PRIMEIRA_CONEXAO = 5;

// Se o navegador acumular mais que isto esperando pra enviar, a conexão está
// travada mesmo que o socket diga que está aberto.
const LIMITE_FILA_BYTES = 512 * 1024;

export function useAudioBroadcast(role: 'pastor' | 'guest') {
  const [status, setStatus] = useState<BroadcastStatus>('parado');
  const [erro, setErro] = useState<string | null>(null);
  const [volumeMic, setVolumeMic] = useState<number>(1);
  const [volumeMusica, setVolumeMusica] = useState<number>(0.8);
  // Nível do microfone (0 a 1) atualizado várias vezes por segundo enquanto
  // está ao vivo — é o que alimenta o medidor de barrinhas na tela do
  // Estúdio, pra dar uma confirmação visual de que o áudio está sendo
  // captado de verdade (bem mais tranquilizador do que só confiar no texto
  // "AO VIVO" pra quem não é da área técnica).
  const [nivelMic, setNivelMic] = useState(0);
  // Qual tentativa de reconexão está em curso (0 = não está reconectando).
  // A tela usa isso pra mostrar "reconectando (3ª tentativa)" em vez de um
  // "reconectando..." parado que parece travado.
  const [tentativaReconexao, setTentativaReconexao] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  // O nó do microfone é o único trocado a cada transmissão (cada getUserMedia
  // devolve um stream novo); guardá-lo permite desligar o anterior.
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const musicSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedAudioElRef = useRef<HTMLAudioElement | null>(null);

  const vinhetaGainNodeRef = useRef<GainNode | null>(null);
  const vinhetaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedVinhetaElRef = useRef<HTMLAudioElement | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const medidorRafRef = useRef<number | null>(null);

  // --- estado da reconexão -------------------------------------------------
  // O que precisa sobreviver a uma queda pra conseguir refazer a conexão sem
  // mexer no microfone: o áudio já mixado e o token de autenticação.
  const outputStreamRef = useRef<MediaStream | null>(null);
  const fonteTokenRef = useRef<FonteToken | null>(null);
  // Marca que foi o locutor quem mandou parar. Sem isso, apertar "Parar" iria
  // disparar a reconexão automática e ele nunca conseguiria sair do ar.
  const pararSolicitadoRef = useRef(false);
  const tentativaRef = useRef(0);
  // Se alguma conexão desta sessão já chegou a entrar no ar. É o que separa
  // "caiu no meio do culto" (insiste muito) de "nunca subiu" (desiste logo).
  const jaEsteveAoVivoRef = useRef(false);
  // Numera os gravadores. Só o mais novo tem permissão de enviar áudio — ver
  // a explicação em iniciarGravacao.
  const geracaoGravadorRef = useRef(0);
  const timerReconexaoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A função de conectar vive num ref pra que o agendador de reconexão sempre
  // chame a versão mais recente sem virar dependência de meio hook.
  const conectarRef = useRef<((primeiraVez: boolean) => void) | null>(null);

  const pararMedidorNivel = useCallback(() => {
    if (medidorRafRef.current !== null) {
      cancelAnimationFrame(medidorRafRef.current);
      medidorRafRef.current = null;
    }
    setNivelMic(0);
  }, []);

  const cancelarReconexaoPendente = useCallback(() => {
    if (timerReconexaoRef.current !== null) {
      clearTimeout(timerReconexaoRef.current);
      timerReconexaoRef.current = null;
    }
  }, []);

  const parar = useCallback(() => {
    // Precisa vir antes de fechar o socket: o onclose vai disparar e é esta
    // flag que diz pra ele não tentar reconectar.
    pararSolicitadoRef.current = true;
    cancelarReconexaoPendente();
    tentativaRef.current = 0;
    setTentativaReconexao(0);

    pararMedidorNivel();
    try {
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    wsRef.current?.close(1000, 'encerrado pelo locutor');
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    fonteTokenRef.current = null;

    // Só o microfone é desligado. O resto do mixer fica montado — ver a
    // explicação logo abaixo.
    try {
      micSourceNodeRef.current?.disconnect();
    } catch {}
    micSourceNodeRef.current = null;

    setStatus('parado');
  }, [pararMedidorNivel, cancelarReconexaoPendente]);

  // ---------------------------------------------------------------------------
  // POR QUE O AudioContext NUNCA É FECHADO
  // ---------------------------------------------------------------------------
  // A versão anterior fechava o AudioContext aqui. Parece a coisa certa a
  // fazer — só que o elemento <audio> da música passa por
  // createMediaElementSource() pra entrar na mixagem, e a partir daí o som
  // dele SÓ existe dentro desse contexto. Fechar o contexto emudece a música,
  // mesmo com o player continuando a "tocar" normalmente: o tempo corre, a
  // capa aparece, e não sai áudio nenhum.
  //
  // E não dá pra desfazer: createMediaElementSource só pode ser chamado uma
  // vez por elemento. Depois que o contexto morre, aquele <audio> fica mudo
  // pra sempre — nem voltando pra aba do Estúdio a música volta.
  //
  // Era isso que acontecia ao sair da aba do Estúdio: o componente
  // desmontava, chamava parar(), o contexto fechava, e a música morria de vez.
  //
  // Agora o contexto é criado uma vez e fica de pé enquanto a locução estiver
  // aberta. parar() desliga o microfone e a transmissão; a música segue
  // tocando, e uma nova transmissão reaproveita o mesmo mixer.

  // Cada conexão precisa de um gravador novo, começando do zero, por causa do
  // cabeçalho do WebM (explicado no comentário do topo do arquivo).
  //
  // Também é chamada quando o servidor pede {type:'restart'}: ele faz isso
  // sempre que precisa recriar o ffmpeg com alguém já no ar, porque um fluxo
  // WebM não pode ser retomado do meio.
  const iniciarGravacao = useCallback((stream: MediaStream, ws: WebSocket) => {
    // Cada gravador ganha um número. O anterior para de ser aceito no mesmo
    // instante em que o novo nasce — e isso importa porque `stop()` ainda
    // dispara um último pedaço depois, com áudio do meio do fluxo antigo. Se
    // esse pedaço escapasse, o servidor o tomaria pelo começo do fluxo novo,
    // que é exatamente o que deixava a transmissão muda.
    const minhaGeracao = geracaoGravadorRef.current + 1;
    geracaoGravadorRef.current = minhaGeracao;

    try {
      recorderRef.current?.stop();
    } catch {}

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    recorder.ondataavailable = async (e) => {
      if (geracaoGravadorRef.current !== minhaGeracao) return;
      // Um gravador antigo pode entregar o último pedaço depois de já termos
      // trocado de socket; nesse caso o pedaço é descartado, senão ele entraria
      // no meio do fluxo novo e embaralharia o áudio.
      if (wsRef.current !== ws) return;
      if (e.data.size === 0 || ws.readyState !== WebSocket.OPEN) return;

      // Conexão travada sem fechar: nada está saindo, a fila só cresce.
      if (ws.bufferedAmount > LIMITE_FILA_BYTES) {
        console.warn('[AUDIO BROADCAST] fila de envio travada, forçando reconexão');
        ws.close(4001, 'fila travada');
        return;
      }

      ws.send(await e.data.arrayBuffer());
    };

    recorder.start(250);
    recorderRef.current = recorder;
  }, []);

  const agendarReconexao = useCallback(() => {
    if (pararSolicitadoRef.current) return;
    if (timerReconexaoRef.current !== null) return; // já tem uma agendada

    const maxTentativas = jaEsteveAoVivoRef.current
      ? MAX_TENTATIVAS_APOS_AO_VIVO
      : MAX_TENTATIVAS_PRIMEIRA_CONEXAO;

    if (tentativaRef.current >= maxTentativas) {
      setErro(
        jaEsteveAoVivoRef.current
          ? 'Não consegui restabelecer a transmissão. Confira sua internet e vá ao ar de novo.'
          : 'O servidor de transmissão não respondeu. Confira sua internet e tente de novo.'
      );
      setStatus('erro');
      setTentativaReconexao(0);
      return;
    }

    const espera =
      ESPERA_RECONEXAO_MS[Math.min(tentativaRef.current, ESPERA_RECONEXAO_MS.length - 1)];
    tentativaRef.current += 1;
    setTentativaReconexao(tentativaRef.current);
    setStatus('reconectando');

    timerReconexaoRef.current = setTimeout(() => {
      timerReconexaoRef.current = null;
      conectarRef.current?.(false);
    }, espera);
  }, []);

  // Abre o socket e faz o aperto de mão. Serve tanto pra primeira conexão
  // quanto pras reconexões — a diferença é só o que aparece na tela.
  const conectar = useCallback(
    async (primeiraVez: boolean) => {
      const fonte = fonteTokenRef.current;
      const outputStream = outputStreamRef.current;
      if (!fonte || !outputStream || pararSolicitadoRef.current) return;

      setStatus(primeiraVez ? 'conectando' : 'reconectando');

      // O token é pedido AGORA, a cada tentativa, e não guardado lá do começo.
      // O motivo: o token do pastor é o da sessão do Supabase, que vence em
      // cerca de uma hora. Num culto longo, uma queda depois desse prazo
      // tentaria reconectar com um token vencido e seria recusada em todas as
      // tentativas — a transmissão simplesmente não voltaria mais, e ninguém
      // entenderia por quê. Pedindo na hora, o Supabase renova sozinho.
      let token: string | null;
      try {
        token = typeof fonte === 'function' ? await fonte() : fonte;
      } catch {
        token = null;
      }
      if (pararSolicitadoRef.current) return;
      if (!token) {
        setErro('Sua sessão expirou. Entre de novo no Estúdio para voltar ao ar.');
        setStatus('erro');
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(BRIDGE_WS_URL);
      } catch {
        agendarReconexao();
        return;
      }
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ role, token }));
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'ready') {
            // Voltou. Zera o contador pra que uma próxima queda, daqui a uma
            // hora, comece de novo com espera curta em vez de já cair nos 15s.
            tentativaRef.current = 0;
            jaEsteveAoVivoRef.current = true;
            setTentativaReconexao(0);
            setErro(null);
            iniciarGravacao(outputStream, ws);
            setStatus('ao_vivo');
          } else if (msg.type === 'restart') {
            // O servidor precisou recriar o ffmpeg (convidado entrando ou
            // saindo, ou uma tentativa depois de o Icecast recusar) e pediu
            // um fluxo novo desde o cabeçalho. Um WebM não pode ser retomado
            // do meio: sem reiniciar o gravador aqui, o servidor receberia
            // um pedaço solto e não conseguiria decodificar nada.
            iniciarGravacao(outputStream, ws);
          } else if (msg.type === 'error') {
            if (primeiraVez) {
              // Recusa logo de cara é problema real (token errado, sala
              // ocupada) — insistir não resolve.
              setErro(msg.message || 'A transmissão recusou a conexão.');
              setStatus('erro');
              parar();
            } else {
              // Numa reconexão, recusa costuma ser o servidor ainda achando
              // que a conexão anterior está viva. Ele derruba a antiga sozinho
              // em alguns segundos, então vale insistir.
              setErro(msg.message || 'A transmissão recusou a reconexão. Tentando de novo...');
              ws.close(4002, 'recusado, vai tentar de novo');
            }
          }
        } catch {}
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        if (primeiraVez) {
          setErro('Não consegui conectar com o servidor de transmissão. Verifique sua internet.');
          setStatus('erro');
        }
        // Erro sempre vem seguido de close, e é lá que a reconexão é agendada.
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return; // socket velho fechando tarde
        wsRef.current = null;

        try {
          recorderRef.current?.stop();
        } catch {}
        recorderRef.current = null;

        if (pararSolicitadoRef.current || event.code === 1000) return;

        // A mensagem depende de já ter entrado no ar alguma vez nesta sessão,
        // não de ser a primeira tentativa: quem caiu na segunda hora de culto
        // não pode ler "não consegui conectar", e quem nunca subiu não pode
        // ler "a transmissão caiu".
        setErro(
          jaEsteveAoVivoRef.current
            ? 'A transmissão caiu. Reconectando...'
            : 'Não consegui conectar com o servidor de transmissão. Tentando de novo...'
        );

        agendarReconexao();
      };
    },
    [role, parar, agendarReconexao, iniciarGravacao]
  );

  useEffect(() => {
    conectarRef.current = conectar;
  }, [conectar]);

  // Quando o celular avisa que a internet voltou, não faz sentido continuar
  // esperando os 15 segundos do backoff — tenta na hora.
  useEffect(() => {
    function aoVoltarRede() {
      if (pararSolicitadoRef.current) return;
      if (timerReconexaoRef.current === null) return;
      clearTimeout(timerReconexaoRef.current);
      timerReconexaoRef.current = null;
      conectarRef.current?.(false);
    }
    window.addEventListener('online', aoVoltarRede);
    return () => window.removeEventListener('online', aoVoltarRede);
  }, []);

  const conectarElementoAudio = useCallback((audioEl: HTMLAudioElement) => {
    if (!audioCtxRef.current || !destNodeRef.current) return;
    try {
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      // Evita reconectar o mesmo elemento repetidas vezes se já conectado ao AudioContext
      if (connectedAudioElRef.current === audioEl && musicGainNodeRef.current) {
        musicGainNodeRef.current.gain.value = volumeMusica;
        return;
      }

      if (!musicSourceNodeRef.current) {
        const source = audioCtx.createMediaElementSource(audioEl);
        const musicGain = audioCtx.createGain();
        musicGain.gain.value = volumeMusica;

        source.connect(musicGain);
        musicGain.connect(destNodeRef.current);
        source.connect(audioCtx.destination);

        musicGainNodeRef.current = musicGain;
        musicSourceNodeRef.current = source;
        connectedAudioElRef.current = audioEl;
      } else if (musicGainNodeRef.current) {
        musicGainNodeRef.current.gain.value = volumeMusica;
      }
    } catch (e) {
      console.warn('[AUDIO BROADCAST] Aviso ao conectar elemento de áudio ao mixer:', e);
    }
  }, [volumeMusica]);

  const conectarElementoVinheta = useCallback((audioEl: HTMLAudioElement) => {
    if (!audioCtxRef.current || !destNodeRef.current) return;
    try {
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      if (connectedVinhetaElRef.current === audioEl && vinhetaGainNodeRef.current) {
        vinhetaGainNodeRef.current.gain.value = 1.0;
        return;
      }

      if (!vinhetaSourceNodeRef.current) {
        const source = audioCtx.createMediaElementSource(audioEl);
        const vinhetaGain = audioCtx.createGain();
        vinhetaGain.gain.value = 1.0;

        source.connect(vinhetaGain);
        vinhetaGain.connect(destNodeRef.current);
        source.connect(audioCtx.destination);

        vinhetaGainNodeRef.current = vinhetaGain;
        vinhetaSourceNodeRef.current = source;
        connectedVinhetaElRef.current = audioEl;
      }
    } catch (e) {
      console.warn('[AUDIO BROADCAST] Aviso ao conectar vinheta ao mixer:', e);
    }
  }, []);

  const alterarVolumeMic = useCallback((novoVolume: number) => {
    setVolumeMic(novoVolume);
    if (micGainNodeRef.current && audioCtxRef.current) {
      micGainNodeRef.current.gain.setValueAtTime(novoVolume, audioCtxRef.current.currentTime);
    }
  }, []);

  const alterarVolumeMusica = useCallback((novoVolume: number) => {
    setVolumeMusica(novoVolume);
    if (musicGainNodeRef.current && audioCtxRef.current) {
      musicGainNodeRef.current.gain.setValueAtTime(novoVolume, audioCtxRef.current.currentTime);
    }
  }, []);

  const iniciar = useCallback(
    async (fonteToken: FonteToken, audioMusicaEl?: HTMLAudioElement | null, audioVinhetaEl?: HTMLAudioElement | null) => {
      setErro(null);
      setStatus('pedindo_microfone');
      pararSolicitadoRef.current = false;
      tentativaRef.current = 0;
      // Sessão nova: até provar o contrário, esta ainda é a primeira conexão.
      jaEsteveAoVivoRef.current = false;
      setTentativaReconexao(0);
      cancelarReconexaoPendente();

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        setErro('Não consegui acessar o microfone. Verifique a permissão nas configurações do navegador.');
        setStatus('erro');
        return;
      }
      streamRef.current = stream;

      // Ligação recebida, fone bluetooth desconectado, outro app tomando o
      // microfone: a faixa termina e não dá pra recuperar sem pedir o
      // microfone de novo. Melhor dizer isso com todas as letras do que
      // deixar o pastor falando pra um app que já não está captando nada.
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (pararSolicitadoRef.current) return;
          setErro('O microfone foi interrompido (ligação recebida ou outro app usando). Toque em transmitir pra voltar ao ar.');
          setStatus('erro');
          parar();
        };
      });

      let outputStream = stream;
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          // O mixer é montado UMA vez e reaproveitado em todas as transmissões
          // seguintes. Ver a explicação em "POR QUE O AudioContext NUNCA É
          // FECHADO", mais acima.
          let ctx = audioCtxRef.current;
          if (!ctx || ctx.state === 'closed') {
            ctx = new AudioCtxClass();
            audioCtxRef.current = ctx;
            micGainNodeRef.current = null;
            destNodeRef.current = null;
            analyserRef.current = null;
          }
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          let micGain = micGainNodeRef.current;
          if (!micGain) {
            micGain = ctx.createGain();
            micGainNodeRef.current = micGain;
          }
          // Mesmo padrão usado em alterarVolumeMic: agendar o valor no nó em
          // vez de atribuir direto na propriedade.
          micGain.gain.setValueAtTime(volumeMic, ctx.currentTime);

          let dest = destNodeRef.current;
          if (!dest) {
            dest = ctx.createMediaStreamDestination();
            destNodeRef.current = dest;
            micGain.connect(dest);
          }

          // O microfone é o único pedaço trocado a cada transmissão: cada
          // getUserMedia devolve um stream novo, então o nó anterior é
          // desligado e um novo entra no lugar, no mesmo mixer.
          try {
            micSourceNodeRef.current?.disconnect();
          } catch {}
          const micSource = ctx.createMediaStreamSource(stream);
          micSource.connect(micGain);
          micSourceNodeRef.current = micSource;

          // Medidor de nível: "escuta" o sinal do microfone JÁ com o ganho
          // aplicado (então Mudo/Boost também refletem no medidor), sem
          // interferir no áudio que realmente vai pro ar — um nó de análise
          // só lê o sinal, não altera o que passa por ele.
          if (!analyserRef.current) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.65;
            micGain.connect(analyser);
            analyserRef.current = analyser;
            analyserDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
          }

          const medirNivel = () => {
            const an = analyserRef.current;
            const arr = analyserDataRef.current;
            if (!an || !arr) return;
            an.getByteTimeDomainData(arr);
            let somaQuadrados = 0;
            for (let i = 0; i < arr.length; i++) {
              const v = (arr[i] - 128) / 128;
              somaQuadrados += v * v;
            }
            const rms = Math.sqrt(somaQuadrados / arr.length);
            // Fala normal raramente satura o RMS bruto — amplifica pra o
            // medidor responder de um jeito visualmente útil.
            setNivelMic(Math.min(1, rms * 4));
            medidorRafRef.current = requestAnimationFrame(medirNivel);
          };
          medirNivel();

          // createMediaElementSource só pode ser chamado uma vez por elemento
          // — chamar de novo lança erro e deixa o áudio mudo. Como o mixer
          // agora sobrevive entre transmissões, a ligação já pode existir.
          if (audioMusicaEl && connectedAudioElRef.current !== audioMusicaEl) {
            try {
              const musicSource = ctx.createMediaElementSource(audioMusicaEl);
              const musicGain = ctx.createGain();
              musicGain.gain.value = volumeMusica;
              musicSource.connect(musicGain);
              musicGain.connect(dest);
              musicSource.connect(ctx.destination);
              musicGainNodeRef.current = musicGain;
              musicSourceNodeRef.current = musicSource;
              connectedAudioElRef.current = audioMusicaEl;
            } catch {}
          }

          if (audioVinhetaEl && connectedVinhetaElRef.current !== audioVinhetaEl) {
            try {
              const vinhetaSource = ctx.createMediaElementSource(audioVinhetaEl);
              const vinhetaGain = ctx.createGain();
              vinhetaGain.gain.value = 1.0;
              vinhetaSource.connect(vinhetaGain);
              vinhetaGain.connect(dest);
              vinhetaSource.connect(ctx.destination);
              vinhetaGainNodeRef.current = vinhetaGain;
              vinhetaSourceNodeRef.current = vinhetaSource;
              connectedVinhetaElRef.current = audioVinhetaEl;
            } catch {}
          }

          outputStream = dest.stream;
        }
      } catch {}

      // Guardados pra que a reconexão consiga refazer o socket sem tocar no
      // microfone nem no mixer que acabamos de montar.
      outputStreamRef.current = outputStream;
      fonteTokenRef.current = fonteToken;

      conectar(true);
    },
    [conectar, parar, cancelarReconexaoPendente, volumeMic, volumeMusica]
  );

  useEffect(() => () => parar(), [parar]);

  return {
    status,
    erro,
    iniciar,
    parar,
    volumeMic,
    volumeMusica,
    nivelMic,
    tentativaReconexao,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
    conectarElementoVinheta,
  };
}
