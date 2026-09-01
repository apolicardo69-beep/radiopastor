'use client';

// Tela principal da locução: controle do Ao Vivo + Mesa de Som / Músicas, Playlists e Cartucheira de Vinhetas
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';
import { usePlayer } from '@/lib/PlayerContext';
import type { BroadcastState, Track, Playlist, PlaylistItem, JingleSlot } from '@/lib/types';
import MensagemDoDiaEditor from '@/components/MensagemDoDiaEditor';
import { isYouTubeUrl, getYouTubeThumbnail } from '@/lib/youtube';

const TEXTO_STATUS: Record<string, string> = {
  parado: 'Fora do ar · Toca playlist 24h',
  pedindo_microfone: 'Solicitando microfone...',
  conectando: 'Conectando ao estúdio...',
  ao_vivo: '🔴 VOCÊ ESTÁ AO VIVO NA RÁDIO',
  reconectando: 'Reconectando... a playlist está no ar',
  erro: 'Não foi possível ir ao ar',
};

interface PlaylistComTracks extends Playlist {
  itens: (PlaylistItem & { track?: Track })[];
}

interface OuvinteOnline {
  client_id: string;
  name: string;
  whatsapp?: string;
  online_at?: string;
}

// Nomes padrão dos 6 botões — usados como estado inicial (antes da tabela
// jingle_slots carregar) e como fallback se, por algum motivo, a migration
// 0004_jingle_slots.sql ainda não tiver rodado nesse projeto Supabase.
const SLOTS_PADRAO: JingleSlot[] = [
  { id: 1, name: 'Vinheta Principal', audio_url: null, storage_path: null, source_url: null },
  { id: 2, name: 'Abertura / Chamada', audio_url: null, storage_path: null, source_url: null },
  { id: 3, name: 'Passagem de Bloco', audio_url: null, storage_path: null, source_url: null },
  { id: 4, name: 'Fundo de Oração', audio_url: null, storage_path: null, source_url: null },
  { id: 5, name: 'Hora Certa / Ao Vivo', audio_url: null, storage_path: null, source_url: null },
  { id: 6, name: 'Efeito / Aplausos', audio_url: null, storage_path: null, source_url: null },
];

const CORES_SLOTS = [
  { bg: 'from-amber-600 to-amber-700 border-amber-500', glow: 'shadow-amber-500/40', icone: '🔔' },
  { bg: 'from-emerald-600 to-emerald-700 border-emerald-500', glow: 'shadow-emerald-500/40', icone: '🟢' },
  { bg: 'from-blue-600 to-blue-700 border-blue-500', glow: 'shadow-blue-500/40', icone: '🔵' },
  { bg: 'from-purple-600 to-purple-700 border-purple-500', glow: 'shadow-purple-500/40', icone: '🟣' },
  { bg: 'from-rose-600 to-rose-700 border-rose-500', glow: 'shadow-rose-500/40', icone: '🔴' },
  { bg: 'from-cyan-600 to-cyan-700 border-cyan-500', glow: 'shadow-cyan-500/40', icone: '🌊' },
];

export default function LocucaoHome() {
  const supabase = createClient();
  const {
    status,
    erro: erroBroadcast,
    iniciar,
    parar,
    volumeMic,
    nivelMic,
    tentativaReconexao,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
    conectarElementoVinheta,
  } = useAudioBroadcast('pastor');

  const {
    musicaTocando,
    estaTocando,
    playlistAtiva,
    filaPlaylist,
    indiceFila,
    tocar,
    pausar,
    retomar,
    tocarPlaylist,
    pararPlaylist,
    proxima,
    anterior,
    audioRef,
    volumeMusica,
    setVolumeMusica,
    ouvintesOnline,
    setModalOuvintesAberto,
  } = usePlayer();

  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistComTracks[]>([]);
  const [erroMusica, setErroMusica] = useState<string | null>(null);

  // Cartucheira de Vinhetas (6 Botões de Disparo Imediato)
  const [jingleSlots, setJingleSlots] = useState<JingleSlot[]>(SLOTS_PADRAO);
  const [slotTocando, setSlotTocando] = useState<number | null>(null);
  const [slotEditando, setSlotEditando] = useState<JingleSlot | null>(null);
  const [nomeEditando, setNomeEditando] = useState('');
  const [enviandoVinheta, setEnviandoVinheta] = useState(false);
  const audioVinhetaRef = useRef<HTMLAudioElement | null>(null);
  const inputVinhetaFileRef = useRef<HTMLInputElement | null>(null);

  async function carregarDados() {
    const { data: bData } = await supabase.from('broadcast_state').select('*').eq('id', 1).single();
    if (bData) setBroadcast(bData);

    const { data: tData } = await supabase.from('tracks').select('*').order('position', { ascending: true });
    if (tData) setTracks(tData);

    const { data: pData } = await supabase.from('playlists').select('*').order('created_at', { ascending: false });
    if (pData) {
      const { data: piData } = await supabase.from('playlist_items').select('*').order('position', { ascending: true });
      const tracksMap = new Map<string, Track>((tData || []).map((t) => [t.id, t]));

      const formatadas: PlaylistComTracks[] = pData.map((pl) => {
        const itens = (piData || [])
          .filter((it) => it.playlist_id === pl.id)
          .map((it) => ({ ...it, track: tracksMap.get(it.track_id) }));
        return { ...pl, itens };
      });
      setPlaylists(formatadas);
    }
  }

  // Busca a configuração da cartucheira no banco (jingle_slots), pra ela ser
  // a mesma em qualquer aparelho em que o pastor/moderador entrar — antes
  // isso ficava só no localStorage de cada navegador.
  async function carregarJingleSlots() {
    const { data } = await supabase.from('jingle_slots').select('*').order('id', { ascending: true });
    const porId = new Map((data || []).map((s) => [s.id as number, s]));

    const completos: JingleSlot[] = SLOTS_PADRAO.map((padrao) => {
      const salvo = porId.get(padrao.id);
      if (!salvo) return padrao;

      let audio_url: string | null = null;
      if (salvo.source_url) {
        audio_url = salvo.source_url;
      } else if (salvo.storage_path) {
        const { data: pub } = supabase.storage.from('musicas').getPublicUrl(salvo.storage_path);
        audio_url = pub.publicUrl;
      }

      return {
        id: salvo.id,
        name: salvo.name || padrao.name,
        storage_path: salvo.storage_path ?? null,
        source_url: salvo.source_url ?? null,
        audio_url,
      };
    });

    setJingleSlots(completos);
  }

  useEffect(() => {
    carregarDados();
    carregarJingleSlots();

    const channel = supabase
      .channel('locucao-home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcast_state' },
        (payload) => setBroadcast(payload.new as BroadcastState)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_items' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jingle_slots' }, () => carregarJingleSlots())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passamos uma FUNÇÃO, não o token pronto. O token da sessão do Supabase
  // vence em cerca de uma hora; num culto longo, uma reconexão depois desse
  // prazo tentaria usar um token vencido e seria recusada pra sempre. Como o
  // hook chama esta função a cada tentativa, o getSession() renova sozinho e
  // a reconexão continua funcionando na terceira hora igual na primeira.
  async function obterTokenDoPastor(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function alternarAoVivo() {
    // Reconectando também conta como "em transmissão": o pastor precisa
    // conseguir desistir e sair do ar sem esperar a reconexão terminar.
    if (status === 'ao_vivo' || status === 'reconectando') {
      parar();
      return;
    }
    if (!(await obterTokenDoPastor())) {
      setErroMusica('Você precisa estar logado como pastor para ir ao ar.');
      return;
    }
    iniciar(obterTokenDoPastor, audioRef.current, audioVinhetaRef.current);
  }

  async function dispararAudioNaTransmissao(acao: () => void) {
    setErroMusica(null);
    acao();

    if (audioRef.current) {
      conectarElementoAudio(audioRef.current);
    }

    // Se ainda não estiver ao vivo, inicia a transmissão para os ouvintes escutarem
    if (status === 'parado' && (await obterTokenDoPastor())) {
      iniciar(obterTokenDoPastor, audioRef.current, audioVinhetaRef.current);
    }
  }

  // Disparo Imediato da Vinheta
  async function dispararVinheta(slot: JingleSlot) {
    if (!slot.audio_url) {
      // Se não tiver áudio configurado, abre configuração do slot
      setSlotEditando(slot);
      setNomeEditando(slot.name);
      return;
    }

    const audioEl = audioVinhetaRef.current;
    if (!audioEl) return;

    // Se já estiver tocando esta vinheta, para imediatamente
    if (slotTocando === slot.id) {
      audioEl.pause();
      setSlotTocando(null);
      return;
    }

    audioEl.src = slot.audio_url;
    if (slot.audio_url.includes('supabase.co')) {
      audioEl.crossOrigin = 'anonymous';
    } else {
      audioEl.removeAttribute('crossOrigin');
    }
    audioEl.volume = 1.0;
    audioEl.load();

    conectarElementoVinheta(audioEl);

    // Se estiver fora do ar, mas o pastor quiser transmitir na hora:
    if (status === 'parado' && (await obterTokenDoPastor())) {
      iniciar(obterTokenDoPastor, audioRef.current, audioEl);
    }

    audioEl
      .play()
      .then(() => {
        setSlotTocando(slot.id);
      })
      .catch((err) => {
        console.error('Erro ao disparar vinheta:', err);
        setSlotTocando(null);
      });
  }

  function pararVinhetas() {
    if (audioVinhetaRef.current) {
      audioVinhetaRef.current.pause();
      setSlotTocando(null);
    }
  }

  // As tr\u00eas fun\u00e7\u00f5es abaixo gravam direto na tabela jingle_slots (upsert:
  // atualiza a linha do bot\u00e3o se ela j\u00e1 existe, cria se n\u00e3o existe) e depois
  // recarregam do banco \u2014 assim a cartucheira fica igual em qualquer
  // aparelho que o pastor ou um moderador use, em vez de presa a um
  // navegador s\u00f3.
  async function handleUploadArquivoVinheta(file: File) {
    if (!slotEditando) return;
    setEnviandoVinheta(true);
    try {
      const nomeLimpo = file.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const caminho = `vinheta-${slotEditando.id}-${Date.now()}-${nomeLimpo}`;

      const { error: erroUpload } = await supabase.storage.from('musicas').upload(caminho, file);
      if (erroUpload) throw erroUpload;

      const { error: erroSalvar } = await supabase.from('jingle_slots').upsert({
        id: slotEditando.id,
        name: nomeEditando.trim() || slotEditando.name,
        storage_path: caminho,
        source_url: null,
      });
      if (erroSalvar) throw erroSalvar;

      await carregarJingleSlots();
      setSlotEditando(null);
    } catch (err: any) {
      alert(`Erro no upload da vinheta: ${err.message || 'tente novamente'}`);
    } finally {
      setEnviandoVinheta(false);
    }
  }

  async function selecionarTrackParaVinheta(track: Track) {
    if (!slotEditando) return;
    const { error } = await supabase.from('jingle_slots').upsert({
      id: slotEditando.id,
      name: nomeEditando.trim() || track.title,
      storage_path: track.source === 'upload' ? track.storage_path : null,
      source_url: track.source === 'link' ? track.source_url : null,
    });
    if (error) {
      alert(`N\u00e3o consegui salvar a vinheta: ${error.message}`);
      return;
    }
    await carregarJingleSlots();
    setSlotEditando(null);
  }

  async function limparSlotVinheta(id: number) {
    const nomeAtual = jingleSlots.find((s) => s.id === id)?.name || `Bot\u00e3o ${id}`;
    const { error } = await supabase.from('jingle_slots').upsert({
      id,
      name: nomeAtual,
      storage_path: null,
      source_url: null,
    });
    if (!error) await carregarJingleSlots();
    setSlotEditando(null);
    if (slotTocando === id) pararVinhetas();
  }

  function handleVolumeMusica(novoVolume: number) {
    alterarVolumeMusica(novoVolume);
    setVolumeMusica(novoVolume);
  }

  function handleVolumeMic(novoVolume: number) {
    alterarVolumeMic(novoVolume);
  }

  function getWhatsappLink(phone?: string) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${fullNumber}?text=${encodeURIComponent('A paz do Senhor! Obrigado por estar conectado na Rádio Graça & Paz.')}`;
  }

  const noAr = status === 'ao_vivo';
  const reconectando = status === 'reconectando';
  // "Encerrar" continua clicável durante a reconexão — só as fases em que não
  // há o que encerrar ainda é que travam o botão.
  const emTransmissao = noAr || reconectando;
  const ocupado = status === 'pedindo_microfone' || status === 'conectando';

  const textoStatus = reconectando
    ? `Reconectando${tentativaReconexao > 1 ? ` (${tentativaReconexao}ª tentativa)` : ''}... a playlist está no ar`
    : TEXTO_STATUS[status];

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* Audio element dedicado à Cartucheira de Vinhetas */}
      <audio
        ref={audioVinhetaRef}
        onEnded={() => setSlotTocando(null)}
        onError={() => setSlotTocando(null)}
        className="hidden"
      />

      {/* Modal de Configuração do Slot de Vinheta */}
      {slotEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-[#f7f1e6] p-5 shadow-2xl border border-[#d9c9a8] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#d9c9a8] pb-3 mb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#2b2118] flex items-center gap-1.5">
                  <span>⚙️</span> Configurar Botão {slotEditando.id}
                </h3>
                <p className="text-[11px] text-[#7a6a52]">
                  Defina o nome e o áudio desta vinheta para disparo imediato
                </p>
              </div>
              <button
                onClick={() => setSlotEditando(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b2118]/10 text-xs font-bold text-[#2b2118] hover:bg-[#2b2118]/20"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-4 pr-1">
              {/* Nome do Botão */}
              <div>
                <label className="text-xs font-bold text-[#2b2118] block mb-1">
                  Nome no Botão:
                </label>
                <input
                  value={nomeEditando}
                  onChange={(e) => setNomeEditando(e.target.value)}
                  placeholder="Ex: Vinheta Principal, Abertura, etc."
                  className="w-full rounded-xl border border-[#d9c9a8] bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#2b2118]"
                />
              </div>

              {/* Opção 1: Upload de Arquivo */}
              <div className="rounded-2xl bg-white p-3.5 border border-[#d9c9a8]/50 shadow-xs">
                <p className="text-xs font-bold text-[#2b2118] mb-1">
                  📁 Enviar Áudio do Celular / Computador:
                </p>
                <p className="text-[11px] text-[#7a6a52] mb-2.5">
                  Envie vinhetas curtas (.mp3, .wav, .m4a)
                </p>
                <button
                  type="button"
                  disabled={enviandoVinheta}
                  onClick={() => inputVinhetaFileRef.current?.click()}
                  className="w-full rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-xs hover:bg-[#1a140e] transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span>{enviandoVinheta ? '⏳' : '📤'}</span>
                  <span>{enviandoVinheta ? 'Enviando vinheta...' : 'Escolher Arquivo no Celular'}</span>
                </button>
                <input
                  ref={inputVinhetaFileRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => e.target.files?.[0] && handleUploadArquivoVinheta(e.target.files[0])}
                  className="hidden"
                />
              </div>

              {/* Opção 2: Escolher da biblioteca existente */}
              {tracks.length > 0 && (
                <div className="rounded-2xl bg-white p-3.5 border border-[#d9c9a8]/50 shadow-xs">
                  <p className="text-xs font-bold text-[#2b2118] mb-1">
                    🎵 Ou escolher da biblioteca de áudios:
                  </p>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-1.5 mt-2 pr-1">
                    {tracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selecionarTrackParaVinheta(t)}
                        className="flex items-center justify-between rounded-xl bg-[#f0e6d2]/50 p-2 text-left text-xs font-semibold text-[#2b2118] hover:bg-[#f0e6d2] transition active:scale-95"
                      >
                        <span className="truncate flex-1">{t.title}</span>
                        <span className="text-[10px] text-[#2f6b4f] font-bold ml-2 shrink-0">
                          Selecionar →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Limpar Slot */}
              {slotEditando.audio_url && (
                <button
                  type="button"
                  onClick={() => limparSlotVinheta(slotEditando.id)}
                  className="rounded-xl bg-[#b3261e]/10 py-2 text-xs font-bold text-[#b3261e] hover:bg-[#b3261e]/20 transition active:scale-95"
                >
                  🗑️ Remover Áudio deste Botão
                </button>
              )}
            </div>

            <button
              onClick={async () => {
                if (!slotEditando) return;
                const { error } = await supabase.from('jingle_slots').upsert({
                  id: slotEditando.id,
                  name: nomeEditando.trim() || slotEditando.name,
                  storage_path: slotEditando.storage_path,
                  source_url: slotEditando.source_url ?? null,
                });
                if (!error) await carregarJingleSlots();
                setSlotEditando(null);
              }}
              className="mt-3 w-full rounded-2xl bg-[#2f6b4f] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#255740] transition active:scale-95"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      )}



      {/* Cartão Principal do Microfone / Ao Vivo */}
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#f0e6d2]">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                noAr
                  ? 'animate-ping bg-[#b3261e]'
                  : reconectando
                    ? 'animate-pulse bg-[#8a6d3b]'
                    : 'bg-[#7a6a52]'
              }`}
            />
            <span
              className={
                noAr ? 'text-[#b3261e]' : reconectando ? 'text-[#8a6d3b]' : 'text-[#7a6a52]'
              }
            >
              {textoStatus}
            </span>
          </div>

          {/* Marcador Ao Vivo de Ouvintes Conectados */}
          <button
            onClick={() => setModalOuvintesAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-[#eaf3ec] text-[#2f6b4f] hover:bg-[#d8edd9] transition active:scale-95 shadow-xs border border-[#2f6b4f]/20 cursor-pointer"
            title="Clique para ver quem está ouvindo"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2f6b4f] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2f6b4f]" />
            </span>
            <span>👥 {ouvintesOnline.length} {ouvintesOnline.length === 1 ? 'Ouvinte Online' : 'Ouvintes Online'}</span>
          </button>
        </div>

        {/* Botão Gigante de Transmissão */}
        <div className="my-2 flex justify-center">
          <button
            onClick={alternarAoVivo}
            disabled={ocupado}
            className={`relative flex h-36 w-36 flex-col items-center justify-center rounded-full text-base font-extrabold text-white shadow-xl transition active:scale-95 disabled:opacity-60 ${
              noAr
                ? 'bg-[#b3261e] ring-8 ring-[#b3261e]/20 hover:bg-[#8f1e17]'
                : reconectando
                  ? 'animate-pulse bg-[#8a6d3b] ring-8 ring-[#8a6d3b]/20 hover:bg-[#6f5730]'
                  : 'bg-[#2f6b4f] ring-8 ring-[#2f6b4f]/15 hover:bg-[#255740]'
            }`}
          >
            <span className="text-3xl">{emTransmissao ? '🛑' : '🎙️'}</span>
            <span className="mt-1 text-sm">{emTransmissao ? 'Encerrar' : 'Ir ao Ar'}</span>
          </button>
        </div>

        {/* Medidor de nível do microfone: confirmação visual de que o áudio
            está sendo captado de verdade, sem precisar confiar só no texto
            "AO VIVO". As barrinhas acendem em tempo real conforme o volume
            da fala — bem mais tranquilizador pra quem não é da área técnica. */}
        {noAr && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <div className="flex items-end justify-center gap-1.5" style={{ height: 26 }}>
              {[0.1, 0.24, 0.4, 0.58, 0.78].map((limite, i) => {
                const aceso = nivelMic >= limite;
                const cor = i < 3 ? '#2f6b4f' : i === 3 ? '#8a6d3b' : '#b3261e';
                return (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 10 + i * 4,
                      borderRadius: 3,
                      backgroundColor: aceso ? cor : '#e4d6be',
                      transition: 'background-color 80ms linear',
                    }}
                  />
                );
              })}
            </div>
            <span className="text-[10px] font-semibold text-[#7a6a52]">
              🎤 Captando áudio do microfone
            </span>
          </div>
        )}

        {/* Durante a reconexão a mensagem é um aviso, não um erro: o sistema
            está resolvendo sozinho. Vermelho aqui só assustaria o pastor no
            meio do culto — o âmbar diz "aguenta aí" em vez de "deu ruim". */}
        {erroBroadcast && (
          <p
            className={`mt-4 rounded-xl p-3 text-xs font-semibold ${
              reconectando ? 'bg-[#f7efdd] text-[#8a6d3b]' : 'bg-[#fbeaea] text-[#b3261e]'
            }`}
          >
            {erroBroadcast}
          </p>
        )}

        {broadcast?.guest_live && (
          <p className="mt-4 rounded-xl bg-[#eaf3ec] p-2.5 text-xs font-bold text-[#2f6b4f]">
            🎙️ Convidado conectado ao vivo com você!
          </p>
        )}
      </section>

      {/* Cartucheira de Vinhetas (6 Botões de Disparo Imediato) */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52] flex items-center gap-1.5">
              <span>⚡</span> Cartucheira de Vinhetas (6 Botões de Disparo)
            </h2>
            <p className="text-[11px] text-[#a0937a]">
              Toque para disparar vinhetas e efeitos sonoros instantâneos no ar.
            </p>
          </div>

          {slotTocando !== null && (
            <button
              onClick={pararVinhetas}
              className="rounded-xl bg-[#b3261e] px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-[#8f1e17] transition active:scale-95 animate-pulse flex items-center gap-1"
            >
              <span>⏹</span>
              <span>Parar Vinheta</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {jingleSlots.map((slot, i) => {
            const cor = CORES_SLOTS[i % CORES_SLOTS.length];
            const estaTocandoEste = slotTocando === slot.id;
            const temAudio = Boolean(slot.audio_url);

            return (
              <div
                key={slot.id}
                className={`relative rounded-2xl p-3 text-white transition overflow-hidden shadow-md flex flex-col justify-between min-h-[90px] border-2 bg-gradient-to-br ${
                  estaTocandoEste
                    ? 'ring-4 ring-white animate-pulse ' + cor.bg + ' ' + cor.glow
                    : temAudio
                    ? cor.bg
                    : 'from-gray-700 to-gray-800 border-dashed border-gray-500'
                }`}
              >
                {/* Botão de Disparo / Tocar */}
                <button
                  type="button"
                  onClick={() => dispararVinheta(slot)}
                  className="w-full flex-1 text-left flex flex-col justify-between active:scale-95 transition"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-base">{cor.icone}</span>
                    <span className="text-[10px] font-black uppercase tracking-wider rounded-md bg-black/30 px-1.5 py-0.5">
                      {estaTocandoEste ? '🔊 NO AR' : `#${slot.id}`}
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="font-extrabold text-xs leading-tight line-clamp-2">
                      {slot.name}
                    </p>
                    <p className="text-[10px] text-white/75 mt-0.5">
                      {estaTocandoEste
                        ? 'Tocando agora...'
                        : temAudio
                        ? '▶ Disparo rápido'
                        : '+ Carregar áudio'}
                    </p>
                  </div>
                </button>

                {/* Botão de Configuração do Slot */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSlotEditando(slot);
                    setNomeEditando(slot.name);
                  }}
                  className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg bg-black/30 text-[11px] text-white hover:bg-black/50 transition active:scale-90"
                  title="Configurar áudio / trocar nome"
                >
                  ⚙️
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mesa de Controle de Áudio (Mixer) */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          🎛️ Mesa de Som (Mixer)
        </h2>

        <div className="flex flex-col gap-3">
          {/* Fader Microfone */}
          <div className="rounded-2xl bg-[#f0e6d2]/70 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#2b2118]">
              <span className="flex items-center gap-1.5">
                <span>🎤</span> Microfone Pastor
              </span>
              <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px]">
                {Math.round(volumeMic * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={volumeMic}
              onChange={(e) => handleVolumeMic(parseFloat(e.target.value))}
              className="mt-2.5 h-2 w-full cursor-pointer accent-[#2b2118]"
            />
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => handleVolumeMic(0)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMic === 0 ? 'bg-[#b3261e] text-white' : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Mudo
              </button>
              <button
                onClick={() => handleVolumeMic(1.0)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMic >= 0.95 && volumeMic <= 1.05
                    ? 'bg-[#2b2118] text-white'
                    : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Normal (100%)
              </button>
              <button
                onClick={() => handleVolumeMic(1.4)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMic > 1.1 ? 'bg-[#2b2118] text-white' : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Boost (140%)
              </button>
            </div>
          </div>

          {/* Fader Música / Soundboard */}
          <div className="rounded-2xl bg-[#f0e6d2]/70 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#2b2118]">
              <span className="flex items-center gap-1.5">
                <span>🎵</span> Louvor / Playlist / Fundo
              </span>
              <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px]">
                {Math.round(volumeMusica * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volumeMusica}
              onChange={(e) => handleVolumeMusica(parseFloat(e.target.value))}
              className="mt-2.5 h-2 w-full cursor-pointer accent-[#2b2118]"
            />
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => handleVolumeMusica(0)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMusica === 0 ? 'bg-[#b3261e] text-white' : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Mudo
              </button>
              <button
                onClick={() => handleVolumeMusica(0.25)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMusica >= 0.2 && volumeMusica <= 0.3
                    ? 'bg-[#2b2118] text-white'
                    : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Fundo (25%)
              </button>
              <button
                onClick={() => handleVolumeMusica(0.85)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition active:scale-95 ${
                  volumeMusica >= 0.8 ? 'bg-[#2b2118] text-white' : 'bg-white/80 text-[#5c4a35]'
                }`}
              >
                Louvor (85%)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Cartão de Monitoramento / O que está tocando agora */}
      {musicaTocando && (
        <section className="rounded-3xl border border-[#2f6b4f] bg-[#eaf3ec] p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className={`text-2xl ${estaTocando ? 'animate-spin' : ''}`}>💿</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#2f6b4f]">
                  {playlistAtiva
                    ? `📋 Playlist "${playlistAtiva.name}" · Faixa ${indiceFila + 1} de ${filaPlaylist.length}`
                    : '🎵 Tocando no Ar para os Ouvintes:'}
                </p>
                <p className="truncate text-sm font-extrabold text-[#2b2118]">{musicaTocando.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {playlistAtiva && filaPlaylist.length > 1 && (
                <button
                  onClick={anterior}
                  disabled={indiceFila <= 0}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-xs font-bold text-[#2b2118] shadow-xs disabled:opacity-30 active:scale-95"
                  title="Anterior"
                >
                  ⏮
                </button>
              )}

              <button
                onClick={estaTocando ? pausar : retomar}
                className="rounded-xl bg-[#2f6b4f] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition active:scale-95"
              >
                {estaTocando ? '⏸ Pausar' : '▶ Retomar'}
              </button>

              {playlistAtiva && filaPlaylist.length > 1 && (
                <button
                  onClick={proxima}
                  disabled={indiceFila >= filaPlaylist.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 text-xs font-bold text-[#2b2118] shadow-xs disabled:opacity-30 active:scale-95"
                  title="Próxima"
                >
                  ⏭
                </button>
              )}

              <button
                onClick={pararPlaylist}
                className="rounded-xl bg-[#b3261e]/10 px-2 py-1.5 text-xs font-bold text-[#b3261e] hover:bg-[#b3261e]/20 active:scale-95 transition"
                title="Parar áudio"
              >
                ⏹ Parar
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Playlists Personalizadas Cadastradas */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              📋 Playlists da Rádio ({playlists.length})
            </h2>
            <p className="text-[11px] text-[#a0937a]">
              Toque uma playlist completa em sequência durante a transmissão.
            </p>
          </div>
        </div>

        {playlists.length === 0 ? (
          <p className="py-4 text-center text-xs text-[#a0937a]">
            Nenhuma playlist criada. Vá na aba <b>Músicas</b> para montar suas playlists personalizadas!
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {playlists.map((pl) => {
              const estaTocandoEstaPlaylist = playlistAtiva?.id === pl.id && estaTocando;
              const listaTracks = pl.itens
                .map((it) => it.track)
                .filter((t): t is Track => t !== undefined);

              return (
                <li
                  key={pl.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl p-3.5 border transition ${
                    estaTocandoEstaPlaylist
                      ? 'border-[#2f6b4f] bg-[#eaf3ec]'
                      : 'border-[#d9c9a8]/40 bg-[#f0e6d2]/60 hover:bg-[#f0e6d2]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      onClick={() =>
                        dispararAudioNaTransmissao(() => {
                          if (estaTocandoEstaPlaylist) {
                            pausar();
                          } else {
                            tocarPlaylist(pl, listaTracks);
                          }
                        })
                      }
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm transition active:scale-95 ${
                        estaTocandoEstaPlaylist ? 'bg-[#b3261e]' : 'bg-[#2f6b4f]'
                      }`}
                    >
                      {estaTocandoEstaPlaylist ? '⏸' : '▶'}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#2b2118] flex items-center gap-1.5">
                        <span>{pl.name}</span>
                        {estaTocandoEstaPlaylist && (
                          <span className="rounded-md bg-[#2f6b4f] px-1.5 py-0.5 text-[9px] font-extrabold text-white animate-pulse">
                            No Ar
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[#7a6a52]">
                        🎵 {pl.itens.length} {pl.itens.length === 1 ? 'música' : 'músicas'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      dispararAudioNaTransmissao(() => {
                        if (estaTocandoEstaPlaylist) {
                          pausar();
                        } else {
                          tocarPlaylist(pl, listaTracks);
                        }
                      })
                    }
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 shadow-xs shrink-0 ${
                      estaTocandoEstaPlaylist
                        ? 'bg-[#b3261e] text-white'
                        : 'bg-white text-[#2b2118] hover:bg-[#f7f1e6]'
                    }`}
                  >
                    {estaTocandoEstaPlaylist ? 'Pausar' : '▶ Tocar Playlist'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Palavra do Pastor / Mensagem do Dia */}
      <MensagemDoDiaEditor />

      {/* Soundboard / Músicas Avulsas no Ar */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              📻 Músicas Individuais ({tracks.length})
            </h2>
            <p className="text-[11px] text-[#a0937a]">
              Solte um louvor ou fundo de oração diretamente na transmissão.
            </p>
          </div>
        </div>

        {erroMusica && (
          <p className="mb-3 rounded-xl bg-[#fbeaea] p-2.5 text-center text-xs font-semibold text-[#b3261e]">
            {erroMusica}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {tracks.map((track) => {
            const estaTocandoEsta = musicaTocando?.id === track.id && estaTocando;
            const isYt = isYouTubeUrl(track.source_url);
            const ytThumb = isYt && track.source_url ? getYouTubeThumbnail(track.source_url) : null;

            return (
              <li
                key={track.id}
                className={`flex items-center justify-between gap-2 rounded-2xl p-3 transition ${
                  estaTocandoEsta ? 'bg-[#e8dac0] shadow-xs' : 'bg-[#f0e6d2]/80 hover:bg-[#f0e6d2]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {ytThumb ? (
                    <div className="relative h-10 w-14 rounded-xl overflow-hidden shadow-xs border border-black/10 shrink-0">
                      <img src={ytThumb} alt="Capa" className="h-full w-full object-cover" />
                      <button
                        onClick={() =>
                          dispararAudioNaTransmissao(() => {
                            tocar(track);
                          })
                        }
                        className={`absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white font-bold transition active:scale-90 ${
                          estaTocandoEsta ? 'bg-red-600/80 text-white' : ''
                        }`}
                        title={estaTocandoEsta ? 'Pausar louvor' : 'Tocar louvor'}
                      >
                        {estaTocandoEsta ? '⏸' : '▶'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        dispararAudioNaTransmissao(() => {
                          tocar(track);
                        })
                      }
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm transition active:scale-90 ${
                        estaTocandoEsta ? 'bg-[#b3261e]' : 'bg-[#2b2118]'
                      }`}
                      title={estaTocandoEsta ? 'Pausar louvor' : 'Tocar louvor'}
                    >
                      {estaTocandoEsta ? '⏸' : '▶'}
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#2b2118] flex items-center gap-1.5">
                      <span className="truncate">{track.title}</span>
                      {isYt && (
                        <span className="shrink-0 rounded-md bg-red-600 px-1 py-0.2 text-[8px] font-black text-white">
                          YouTube
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[#7a6a52]">
                      {isYt ? '🔴 YouTube' : track.source === 'link' ? '🌐 Link' : '📁 Arquivo'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    dispararAudioNaTransmissao(() => {
                      tocar(track);
                    })
                  }
                  className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 shadow-xs ${
                    estaTocandoEsta
                      ? 'bg-[#b3261e] text-white'
                      : 'bg-white text-[#2b2118] hover:bg-[#f7f1e6]'
                  }`}
                >
                  {estaTocandoEsta ? 'Pausar' : '▶ Tocar'}
                </button>
              </li>
            );
          })}

          {tracks.length === 0 && (
            <p className="py-6 text-center text-xs text-[#a0937a]">
              Nenhuma música na biblioteca. Acesse a aba <b>Músicas</b> para adicionar.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
