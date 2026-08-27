'use client';

// Tela principal da locução: controle do Ao Vivo + Mesa de Som / Músicas
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';
import type { BroadcastState, Track } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  parado: 'Fora do ar · Toca playlist 24h',
  pedindo_microfone: 'Solicitando microfone...',
  conectando: 'Conectando ao estúdio...',
  ao_vivo: '🔴 VOCÊ ESTÁ AO VIVO NA RÁDIO',
  erro: 'Não foi possível ir ao ar',
};

export default function LocucaoHome() {
  const supabase = createClient();
  const {
    status,
    erro,
    iniciar,
    parar,
    volumeMic,
    volumeMusica,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
  } = useAudioBroadcast('pastor');

  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicaTocando, setMusicaTocando] = useState<Track | null>(null);
  const [estaTocandoMusica, setEstaTocandoMusica] = useState(false);
  const [erroMusica, setErroMusica] = useState<string | null>(null);

  const audioMusicaRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    supabase
      .from('broadcast_state')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setBroadcast(data));

    supabase
      .from('tracks')
      .select('*')
      .order('position', { ascending: true })
      .then(({ data }) => data && setTracks(data));

    const channel = supabase
      .channel('locucao-home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcast_state' },
        (payload) => setBroadcast(payload.new as BroadcastState)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracks' },
        () => {
          supabase
            .from('tracks')
            .select('*')
            .order('position', { ascending: true })
            .then(({ data }) => data && setTracks(data));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) {
      return track.source_url;
    }
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  async function alternarAoVivo() {
    if (status === 'ao_vivo') {
      parar();
      if (audioMusicaRef.current) {
        audioMusicaRef.current.pause();
        setEstaTocandoMusica(false);
      }
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setErroMusica('Você precisa estar logado como pastor para ir ao ar.');
      return;
    }
    iniciar(session.access_token, audioMusicaRef.current);
  }

  async function tocarMusicaNaTransmissao(track: Track) {
    const url = getTrackUrl(track);
    if (!url || !audioMusicaRef.current) {
      setErroMusica('Link ou arquivo de áudio não encontrado para esta música.');
      return;
    }

    if (musicaTocando?.id === track.id && estaTocandoMusica) {
      audioMusicaRef.current.pause();
      setEstaTocandoMusica(false);
      return;
    }

    setErroMusica(null);
    const audioEl = audioMusicaRef.current;
    if (url.includes('supabase.co')) {
      audioEl.crossOrigin = 'anonymous';
    } else {
      audioEl.removeAttribute('crossOrigin');
    }
    audioEl.src = url;
    audioEl.volume = Math.min(1, Math.max(0, volumeMusica));
    audioEl.load();

    audioEl
      .play()
      .then(async () => {
        setMusicaTocando(track);
        setEstaTocandoMusica(true);
        conectarElementoAudio(audioEl);

        // Se ainda não estiver ao vivo, conecta automaticamente à transmissão para que os ouvintes escutem esta música
        if (status === 'parado') {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            iniciar(session.access_token, audioEl);
          }
        }
      })
      .catch((err) => {
        console.error('Erro ao tocar áudio:', err);
        setErroMusica('Não foi possível carregar este áudio no navegador.');
        setEstaTocandoMusica(false);
      });
  }

  function pausarMusica() {
    if (audioMusicaRef.current) {
      audioMusicaRef.current.pause();
      setEstaTocandoMusica(false);
    }
  }

  function handleVolumeMusica(novoVolume: number) {
    alterarVolumeMusica(novoVolume);
    if (audioMusicaRef.current) {
      audioMusicaRef.current.volume = Math.min(1, Math.max(0, novoVolume));
    }
  }

  function handleVolumeMic(novoVolume: number) {
    alterarVolumeMic(novoVolume);
  }

  const noAr = status === 'ao_vivo';
  const ocupado = status === 'pedindo_microfone' || status === 'conectando';

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Audio element oculto usado para mixagem */}
      <audio
        ref={audioMusicaRef}
        onEnded={() => setEstaTocandoMusica(false)}
        onPause={() => setEstaTocandoMusica(false)}
        onPlay={() => setEstaTocandoMusica(true)}
      />

      {/* Cartão Principal do Microfone / Ao Vivo */}
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#f0e6d2]">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              noAr ? 'animate-ping bg-[#b3261e]' : 'bg-[#7a6a52]'
            }`}
          />
          <span className={noAr ? 'text-[#b3261e]' : 'text-[#7a6a52]'}>
            {TEXTO_STATUS[status]}
          </span>
        </div>

        {/* Botão Gigante de Transmissão */}
        <div className="my-2 flex justify-center">
          <button
            onClick={alternarAoVivo}
            disabled={ocupado}
            className={`relative flex h-36 w-36 flex-col items-center justify-center rounded-full text-base font-extrabold text-white shadow-xl transition active:scale-95 disabled:opacity-60 ${
              noAr
                ? 'bg-[#b3261e] ring-8 ring-[#b3261e]/20 hover:bg-[#8f1e17]'
                : 'bg-[#2f6b4f] ring-8 ring-[#2f6b4f]/15 hover:bg-[#255740]'
            }`}
          >
            <span className="text-3xl">{noAr ? '🛑' : '🎙️'}</span>
            <span className="mt-1 text-sm">{noAr ? 'Encerrar' : 'Ir ao Ar'}</span>
          </button>
        </div>

        {erro && (
          <p className="mt-4 rounded-xl bg-[#fbeaea] p-3 text-xs font-semibold text-[#b3261e]">
            {erro}
          </p>
        )}

        {broadcast?.guest_live && (
          <p className="mt-4 rounded-xl bg-[#eaf3ec] p-2.5 text-xs font-bold text-[#2f6b4f]">
            🎙️ Convidado conectado ao vivo com você!
          </p>
        )}
      </section>

      {/* Mesa de Controle de Áudio (Mixer) */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
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
                <span>🎵</span> Louvor / Fundo
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

      {/* Soundboard / Músicas ao Vivo */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              📻 Tocar Músicas no Ar
            </h2>
            <p className="text-[11px] text-[#a0937a]">
              Solte um louvor ou fundo de oração diretamente na transmissão.
            </p>
          </div>
          {estaTocandoMusica && (
            <button
              onClick={pausarMusica}
              className="rounded-xl bg-[#b3261e] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
            >
              ⏸ Pausar
            </button>
          )}
        </div>

        {musicaTocando && estaTocandoMusica && (
          <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#2f6b4f] bg-[#eaf3ec] p-3 text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="animate-spin text-lg">💿</span>
              <div className="truncate">
                <p className="font-bold text-[#2f6b4f]">Tocando Agora para os Ouvintes:</p>
                <p className="truncate font-semibold text-[#2b2118]">{musicaTocando.title}</p>
              </div>
            </div>
            <button
              onClick={pausarMusica}
              className="ml-2 shrink-0 rounded-lg bg-[#2f6b4f] px-2.5 py-1 text-xs font-bold text-white shadow-xs"
            >
              Pausar
            </button>
          </div>
        )}

        {erroMusica && (
          <p className="mb-3 rounded-xl bg-[#fbeaea] p-2.5 text-center text-xs font-semibold text-[#b3261e]">
            {erroMusica}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {tracks.map((track) => {
            const estaTocandoEsta = musicaTocando?.id === track.id && estaTocandoMusica;
            return (
              <li
                key={track.id}
                className={`flex items-center justify-between gap-2 rounded-2xl p-3 transition ${
                  estaTocandoEsta ? 'bg-[#e8dac0] shadow-xs' : 'bg-[#f0e6d2]/80 hover:bg-[#f0e6d2]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <button
                    onClick={() => tocarMusicaNaTransmissao(track)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm transition active:scale-90 ${
                      estaTocandoEsta ? 'bg-[#b3261e]' : 'bg-[#2b2118]'
                    }`}
                    title={estaTocandoEsta ? 'Pausar louvor' : 'Tocar louvor'}
                  >
                    {estaTocandoEsta ? '⏸' : '▶'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#2b2118]">{track.title}</p>
                    <p className="text-[10px] text-[#7a6a52]">
                      {track.source === 'link' ? '🌐 Link' : '📁 Arquivo'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => tocarMusicaNaTransmissao(track)}
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
              Nenhuma música na playlist. Acesse a aba <b>Músicas</b> para adicionar.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}


