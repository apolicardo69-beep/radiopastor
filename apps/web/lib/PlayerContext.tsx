'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Track, Playlist, OuvinteOnline } from '@/lib/types';
import { extractYouTubeVideoId, getYouTubeThumbnail } from '@/lib/youtube';

interface PlayerState {
  musicaTocando: Track | null;
  estaTocando: boolean;
  playlistAtiva: Playlist | null;
  filaPlaylist: Track[];
  indiceFila: number;
  tocar: (track: Track) => void;
  pausar: () => void;
  retomar: () => void;
  tocarPlaylist: (playlist: Playlist, tracks: Track[]) => void;
  pararPlaylist: () => void;
  proxima: () => void;
  anterior: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  volumeMusica: number;
  setVolumeMusica: (v: number) => void;
  ouvintesOnline: OuvinteOnline[];
  modalOuvintesAberto: boolean;
  setModalOuvintesAberto: (aberto: boolean) => void;
  isYouTube: boolean;
  youtubeVideoId: string | null;
  mostrarVideoYoutube: boolean;
  setMostrarVideoYoutube: (mostrar: boolean | ((ant: boolean) => boolean)) => void;
}

function parsePresenceState(state: Record<string, any[]>): OuvinteOnline[] {
  const lista: OuvinteOnline[] = [];
  const idsVistos = new Set<string>();

  for (const key in state) {
    const presences = state[key] as any[];
    if (presences && presences.length > 0) {
      for (const p of presences) {
        const clientId = p.client_id || key;
        if (!idsVistos.has(clientId)) {
          idsVistos.add(clientId);
          lista.push({
            client_id: clientId,
            name: p.name || 'Ouvinte',
            whatsapp: p.whatsapp || undefined,
            online_at: p.online_at || undefined,
            is_playing: Boolean(p.is_playing),
          });
        }
      }
    }
  }
  return lista;
}

const PlayerContext = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer precisa estar dentro de <PlayerProvider>');
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const proximaRef = useRef<() => void>(() => {});

  const [musicaTocando, setMusicaTocando] = useState<Track | null>(null);
  const [estaTocando, setEstaTocando] = useState(false);
  const [playlistAtiva, setPlaylistAtiva] = useState<Playlist | null>(null);
  const [filaPlaylist, setFilaPlaylist] = useState<Track[]>([]);
  const [indiceFila, setIndiceFila] = useState(0);
  const [volumeMusica, setVolumeMusica] = useState(0.8);
  const [ouvintesOnline, setOuvintesOnline] = useState<OuvinteOnline[]>([]);
  const [modalOuvintesAberto, setModalOuvintesAberto] = useState(false);
  const [mostrarVideoYoutube, setMostrarVideoYoutube] = useState(false);

  const youtubeVideoId = musicaTocando ? extractYouTubeVideoId(musicaTocando.source_url || '') : null;
  const isYouTube = Boolean(musicaTocando?.source === 'link' && youtubeVideoId);

  // Enviar comando para o iframe do YouTube via postMessage seguro
  const sendYtCommand = useCallback((func: string, args: any[] = []) => {
    try {
      if (ytIframeRef.current?.contentWindow) {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args,
          }),
          '*'
        );
      }
    } catch (err) {
      console.warn('Erro ao enviar comando postMessage para YouTube:', err);
    }
  }, []);

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) return track.source_url;
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  const tocarTrackInterno = useCallback(
    (track: Track) => {
      const ytId = track.source === 'link' ? extractYouTubeVideoId(track.source_url || '') : null;

      if (ytId) {
        // Pausar áudio convencional
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
        }

        setMusicaTocando(track);
        setEstaTocando(true);

        // Disparar play no iframe após montagem
        setTimeout(() => {
          sendYtCommand('playVideo');
          sendYtCommand('setVolume', [Math.round(volumeMusica * 100)]);
          sendYtCommand('unMute');
        }, 300);
      } else {
        // Pausar YouTube se estava tocando
        sendYtCommand('pauseVideo');

        const url = getTrackUrl(track);
        if (!url || !audioRef.current) return;

        const audioEl = audioRef.current;
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
          .then(() => {
            setMusicaTocando(track);
            setEstaTocando(true);
          })
          .catch((err) => {
            console.error('Erro ao tocar áudio:', err);
            setEstaTocando(false);
          });
      }
    },
    [sendYtCommand, volumeMusica]
  );

  const tocar = useCallback(
    (track: Track) => {
      // Se clicar na mesma música que está tocando, alterna pausa/play
      if (musicaTocando?.id === track.id && estaTocando) {
        pausar();
        return;
      }
      // Limpa playlist ativa se tocar avulso
      setPlaylistAtiva(null);
      setFilaPlaylist([]);
      setIndiceFila(0);
      tocarTrackInterno(track);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [musicaTocando, estaTocando, tocarTrackInterno]
  );

  const pausar = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    sendYtCommand('pauseVideo');
    setEstaTocando(false);
  }, [sendYtCommand]);

  const retomar = useCallback(() => {
    if (isYouTube) {
      sendYtCommand('playVideo');
      setEstaTocando(true);
    } else if (audioRef.current && musicaTocando) {
      audioRef.current
        .play()
        .then(() => setEstaTocando(true))
        .catch(() => {});
    }
  }, [isYouTube, musicaTocando, sendYtCommand]);

  const tocarPlaylist = useCallback(
    (playlist: Playlist, tracks: Track[]) => {
      if (tracks.length === 0) return;
      setPlaylistAtiva(playlist);
      setFilaPlaylist(tracks);
      setIndiceFila(0);
      tocarTrackInterno(tracks[0]);
    },
    [tocarTrackInterno]
  );

  const pararPlaylist = useCallback(() => {
    pausar();
    sendYtCommand('stopVideo');
    setPlaylistAtiva(null);
    setFilaPlaylist([]);
    setIndiceFila(0);
    setMusicaTocando(null);
    setMostrarVideoYoutube(false);
  }, [pausar, sendYtCommand]);

  const proxima = useCallback(() => {
    if (filaPlaylist.length === 0) return;
    const novoIndice = indiceFila + 1;
    if (novoIndice < filaPlaylist.length) {
      setIndiceFila(novoIndice);
      tocarTrackInterno(filaPlaylist[novoIndice]);
    } else {
      // Fim da playlist — para
      pararPlaylist();
    }
  }, [filaPlaylist, indiceFila, tocarTrackInterno, pararPlaylist]);

  const anterior = useCallback(() => {
    if (filaPlaylist.length === 0 || indiceFila <= 0) return;
    const novoIndice = indiceFila - 1;
    setIndiceFila(novoIndice);
    tocarTrackInterno(filaPlaylist[novoIndice]);
  }, [filaPlaylist, indiceFila, tocarTrackInterno]);

  // Mantém a ref de proxima atualizada para o callback do player YouTube
  useEffect(() => {
    proximaRef.current = proxima;
  }, [proxima]);

  // Escutar eventos do iframe do YouTube via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        // Estado do YouTube mudou
        if (data.event === 'onStateChange' || data.info !== undefined) {
          const state = typeof data.info === 'number' ? data.info : data.info?.playerState;
          if (state === 1) {
            // PLAYING
            setEstaTocando(true);
          } else if (state === 2) {
            // PAUSED
            setEstaTocando(false);
          } else if (state === 0) {
            // ENDED
            setEstaTocando(false);
            proximaRef.current?.();
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Quando a música termina no elemento HTML audio, toca a próxima da playlist
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleEnded = () => {
      setEstaTocando(false);
      if (filaPlaylist.length > 0) {
        proximaRef.current?.();
      }
    };

    audioEl.addEventListener('ended', handleEnded);
    return () => audioEl.removeEventListener('ended', handleEnded);
  }, [filaPlaylist]);

  // Atualizar volume quando muda
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volumeMusica));
    }
    sendYtCommand('setVolume', [Math.round(volumeMusica * 100)]);
  }, [volumeMusica, sendYtCommand]);

  // Monitorar ouvintes online em tempo real de forma contínua em todo o painel
  useEffect(() => {
    const presenceChannel = supabase.channel('radio-presence-ouvintes');

    const atualizarPresenca = () => {
      try {
        const state = presenceChannel.presenceState();
        setOuvintesOnline(parsePresenceState(state));
      } catch (err) {
        console.warn('Erro ao ler estado de presença:', err);
      }
    };

    presenceChannel
      .on('presence', { event: 'sync' }, atualizarPresenca)
      .on('presence', { event: 'join' }, atualizarPresenca)
      .on('presence', { event: 'leave' }, atualizarPresenca)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          atualizarPresenca();
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suporte a reprodução em segundo plano (Background Audio) e controles na tela de bloqueio do celular
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (musicaTocando) {
      const isYt = Boolean(musicaTocando.source === 'link' && extractYouTubeVideoId(musicaTocando.source_url || ''));
      const thumb = isYt && musicaTocando.source_url ? getYouTubeThumbnail(musicaTocando.source_url) : '/icons/icon-192x192.png';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: musicaTocando.title || 'Louvor ao Vivo',
          artist: isYt ? 'YouTube · Rádio Graça & Paz' : (playlistAtiva ? playlistAtiva.name : 'Rádio Graça & Paz'),
          album: 'Estúdio de Transmissão',
          artwork: [
            { src: thumb, sizes: '96x96', type: 'image/png' },
            { src: thumb, sizes: '128x128', type: 'image/png' },
            { src: thumb, sizes: '192x192', type: 'image/png' },
            { src: thumb, sizes: '512x512', type: 'image/png' },
          ],
        });
        navigator.mediaSession.playbackState = estaTocando ? 'playing' : 'paused';
      } catch {}
    } else {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }
  }, [musicaTocando, estaTocando, playlistAtiva]);

  // Ações de controle da tela de bloqueio e fone de ouvido
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => retomar());
      navigator.mediaSession.setActionHandler('pause', () => pausar());
      navigator.mediaSession.setActionHandler('previoustrack', () => anterior());
      navigator.mediaSession.setActionHandler('nexttrack', () => proxima());
      navigator.mediaSession.setActionHandler('stop', () => pararPlaylist());
    } catch {}

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('stop', null);
      } catch {}
    };
  }, [retomar, pausar, anterior, proxima, pararPlaylist]);

  return (
    <PlayerContext.Provider
      value={{
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
        modalOuvintesAberto,
        setModalOuvintesAberto,
        isYouTube,
        youtubeVideoId,
        mostrarVideoYoutube,
        setMostrarVideoYoutube,
      }}
    >
      {children}
      {/* Audio element global — vive no layout, persiste entre navegações e em segundo plano */}
      <audio ref={audioRef} playsInline preload="auto" />

      {/* Player YouTube Seguro embutido */}
      {isYouTube && youtubeVideoId && (
        <div
          id="youtube-player-container"
          className={
            mostrarVideoYoutube
              ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in'
              : 'fixed -bottom-[999px] -right-[999px] w-1 h-1 opacity-0 pointer-events-none overflow-hidden'
          }
          onClick={mostrarVideoYoutube ? () => setMostrarVideoYoutube(false) : undefined}
        >
          {mostrarVideoYoutube ? (
            <div
              className="relative w-full max-w-lg rounded-3xl bg-[#2b2118] p-4 shadow-2xl border border-[#d9c9a8] flex flex-col gap-3 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#d9c9a8]/30 pb-2">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                    <span>🔴</span> YouTube no Ar
                  </p>
                  <p className="truncate text-xs font-bold text-white">
                    {musicaTocando?.title || 'Vídeo do YouTube'}
                  </p>
                </div>
                <button
                  onClick={() => setMostrarVideoYoutube(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white hover:bg-white/20 active:scale-95 cursor-pointer"
                  title="Minimizar (o áudio continua tocando)"
                >
                  ✕
                </button>
              </div>

              {/* Iframe seguro com sandbox anti-redirecionamento */}
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-inner">
                <iframe
                  ref={ytIframeRef}
                  src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1`}
                  title="YouTube Player"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  className="w-full h-full border-0"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#d9c9a8] px-1">
                <span>🎵 O áudio continua tocando mesmo se fechar a janela</span>
                <button
                  onClick={() => setMostrarVideoYoutube(false)}
                  className="rounded-xl bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20 active:scale-95 cursor-pointer"
                >
                  Ocultar Tela
                </button>
              </div>
            </div>
          ) : (
            <iframe
              ref={ytIframeRef}
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=0`}
              title="YouTube Audio Player"
              allow="autoplay; encrypted-media; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              className="w-1 h-1 border-0"
            />
          )}
        </div>
      )}
    </PlayerContext.Provider>
  );
}
