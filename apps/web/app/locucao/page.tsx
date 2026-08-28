'use client';

// Tela principal da locução: controle do Ao Vivo + Mesa de Som / Músicas e Playlists
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';
import { usePlayer } from '@/lib/PlayerContext';
import type { BroadcastState, Track, Playlist, PlaylistItem } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  parado: 'Fora do ar · Toca playlist 24h',
  pedindo_microfone: 'Solicitando microfone...',
  conectando: 'Conectando ao estúdio...',
  ao_vivo: '🔴 VOCÊ ESTÁ AO VIVO NA RÁDIO',
  erro: 'Não foi possível ir ao ar',
};

interface PlaylistComTracks extends Playlist {
  itens: (PlaylistItem & { track?: Track })[];
}

export default function LocucaoHome() {
  const supabase = createClient();
  const {
    status,
    erro: erroBroadcast,
    iniciar,
    parar,
    volumeMic,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
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
  } = usePlayer();

  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistComTracks[]>([]);
  const [erroMusica, setErroMusica] = useState<string | null>(null);

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

  useEffect(() => {
    carregarDados();

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarAoVivo() {
    if (status === 'ao_vivo') {
      parar();
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setErroMusica('Você precisa estar logado como pastor para ir ao ar.');
      return;
    }
    iniciar(session.access_token, audioRef.current);
  }

  async function dispararAudioNaTransmissao(acao: () => void) {
    setErroMusica(null);
    acao();

    if (audioRef.current) {
      conectarElementoAudio(audioRef.current);
    }

    // Se ainda não estiver ao vivo, inicia a transmissão para os ouvintes escutarem
    if (status === 'parado') {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        iniciar(session.access_token, audioRef.current);
      }
    }
  }

  function handleVolumeMusica(novoVolume: number) {
    alterarVolumeMusica(novoVolume);
    setVolumeMusica(novoVolume);
  }

  function handleVolumeMic(novoVolume: number) {
    alterarVolumeMic(novoVolume);
  }

  const noAr = status === 'ao_vivo';
  const ocupado = status === 'pedindo_microfone' || status === 'conectando';

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* Cartão Principal do Microfone / Ao Vivo */}
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm border border-[#d9c9a8]/40">
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

        {erroBroadcast && (
          <p className="mt-4 rounded-xl bg-[#fbeaea] p-3 text-xs font-semibold text-[#b3261e]">
            {erroBroadcast}
          </p>
        )}

        {broadcast?.guest_live && (
          <p className="mt-4 rounded-xl bg-[#eaf3ec] p-2.5 text-xs font-bold text-[#2f6b4f]">
            🎙️ Convidado conectado ao vivo com você!
          </p>
        )}
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
            return (
              <li
                key={track.id}
                className={`flex items-center justify-between gap-2 rounded-2xl p-3 transition ${
                  estaTocandoEsta ? 'bg-[#e8dac0] shadow-xs' : 'bg-[#f0e6d2]/80 hover:bg-[#f0e6d2]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#2b2118]">{track.title}</p>
                    <p className="text-[10px] text-[#7a6a52]">
                      {track.source === 'link' ? '🌐 Link' : '📁 Arquivo'}
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
