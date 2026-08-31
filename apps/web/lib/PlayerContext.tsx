'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Track, Playlist, OuvinteOnline } from '@/lib/types';
import { extractYouTubeVideoId, isYouTubeUrl } from '@/lib/youtube';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

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
  const ytPlayerRef = useRef<any>(null);
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

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) return track.source_url;
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  const criarOuAtualizarPlayerYoutube = useCallback(
    (initialVideoId: string) => {
      if (typeof window === 'undefined' || !window.YT || !window.YT.Player) return;

      if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        try {
          ytPlayerRef.current.loadVideoById(initialVideoId);
          ytPlayerRef.current.setVolume(Math.round(volumeMusica * 100));
          ytPlayerRef.current.playVideo();
          return;
        } catch (e) {
          console.warn('Erro ao atualizar vídeo no player existente:', e);
        }
      }

      try {
        ytPlayerRef.current = new window.YT.Player('youtube-player-iframe', {
          height: '100%',
          width: '100%',
          videoId: initialVideoId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              event.target.setVolume(Math.round(volumeMusica * 100));
              event.target.playVideo();
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setEstaTocando(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setEstaTocando(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setEstaTocando(false);
                proximaRef.current?.();
              }
            },
            onError: (err: any) => {
              console.warn('Erro no YouTube Player:', err);
              setEstaTocando(false);
            },
          },
        });
      } catch (err) {
        console.error('Erro ao inicializar YouTube Player:', err);
      }
    },
    [volumeMusica]
  );

  const tocarTrackInterno = useCallback(
    (track: Track) => {
      const ytId = track.source === 'link' ? extractYouTubeVideoId(track.source_url || '') : null;

      if (ytId) {
        // Pausar áudio normal se estava tocando
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
        }

        setMusicaTocando(track);
        setEstaTocando(true);

        if (typeof window !== 'undefined') {
          if (!window.YT || !window.YT.Player) {
            if (!document.getElementById('youtube-iframe-api')) {
              const tag = document.createElement('script');
              tag.id = 'youtube-iframe-api';
              tag.src = 'https://www.youtube.com/iframe_api';
              document.head.appendChild(tag);
            }

            const prevOnReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
              if (prevOnReady) prevOnReady();
              criarOuAtualizarPlayerYoutube(ytId);
            };
          } else {
            criarOuAtualizarPlayerYoutube(ytId);
          }
        }
      } else {
        // Faixa de áudio convencional (.mp3 / storage)
        if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch {}
        }

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
    [criarOuAtualizarPlayerYoutube, volumeMusica]
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
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    setEstaTocando(false);
  }, []);

  const retomar = useCallback(() => {
    if (isYouTube && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
      try {
        ytPlayerRef.current.playVideo();
        setEstaTocando(true);
      } catch {}
    } else if (audioRef.current && musicaTocando) {
      audioRef.current
        .play()
        .then(() => setEstaTocando(true))
        .catch(() => {});
    }
  }, [isYouTube, musicaTocando]);

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
    if (ytPlayerRef.current && typeof ytPlayerRef.current.stopVideo === 'function') {
      try {
        ytPlayerRef.current.stopVideo();
      } catch {}
    }
    setPlaylistAtiva(null);
    setFilaPlaylist([]);
    setIndiceFila(0);
    setMusicaTocando(null);
    setMostrarVideoYoutube(false);
  }, [pausar]);

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

  // Atualizar volume quando muda (áudio HTML e player YouTube)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volumeMusica));
    }
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try {
        ytPlayerRef.current.setVolume(Math.round(volumeMusica * 100));
      } catch {}
    }
  }, [volumeMusica]);

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
      {/* Audio element global — vive no layout, persiste entre navegações */}
      <audio ref={audioRef} />

      {/* Container do player YouTube embutido (suporta áudio em segundo plano e vídeo flutuante) */}
      <div
        id="youtube-player-wrapper"
        aria-label="Player YouTube"
        className={`fixed z-50 transition-all duration-300 rounded-3xl overflow-hidden shadow-2xl border-2 border-[#d9c9a8] bg-black ${
          isYouTube && mostrarVideoYoutube
            ? 'bottom-20 right-4 w-72 h-44 sm:w-80 sm:h-48 opacity-100 scale-100 pointer-events-auto'
            : 'bottom-0 right-0 w-1 h-1 opacity-0 pointer-events-none'
        }`}
      >
        {isYouTube && mostrarVideoYoutube && (
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => setMostrarVideoYoutube(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white text-xs font-bold hover:bg-black active:scale-95"
              title="Minimizar vídeo (o som continua tocando)"
            >
              ✕
            </button>
          </div>
        )}
        <div id="youtube-player-iframe" className="w-full h-full" />
      </div>
    </PlayerContext.Provider>
  );
}

