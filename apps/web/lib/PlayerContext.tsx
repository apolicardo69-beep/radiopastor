'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Track, Playlist } from '@/lib/types';

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

  const [musicaTocando, setMusicaTocando] = useState<Track | null>(null);
  const [estaTocando, setEstaTocando] = useState(false);
  const [playlistAtiva, setPlaylistAtiva] = useState<Playlist | null>(null);
  const [filaPlaylist, setFilaPlaylist] = useState<Track[]>([]);
  const [indiceFila, setIndiceFila] = useState(0);
  const [volumeMusica, setVolumeMusica] = useState(0.8);

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) return track.source_url;
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  const tocarTrackInterno = useCallback((track: Track) => {
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
    audioEl.play()
      .then(() => {
        setMusicaTocando(track);
        setEstaTocando(true);
      })
      .catch((err) => {
        console.error('Erro ao tocar áudio:', err);
        setEstaTocando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeMusica]);

  const tocar = useCallback((track: Track) => {
    // Se clicar na mesma música que está tocando, alterna pausa/play
    if (musicaTocando?.id === track.id && estaTocando) {
      audioRef.current?.pause();
      setEstaTocando(false);
      return;
    }
    // Limpa playlist ativa se tocar avulso
    setPlaylistAtiva(null);
    setFilaPlaylist([]);
    setIndiceFila(0);
    tocarTrackInterno(track);
  }, [musicaTocando, estaTocando, tocarTrackInterno]);

  const pausar = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setEstaTocando(false);
    }
  }, []);

  const retomar = useCallback(() => {
    if (audioRef.current && musicaTocando) {
      audioRef.current.play()
        .then(() => setEstaTocando(true))
        .catch(() => {});
    }
  }, [musicaTocando]);

  const tocarPlaylist = useCallback((playlist: Playlist, tracks: Track[]) => {
    if (tracks.length === 0) return;
    setPlaylistAtiva(playlist);
    setFilaPlaylist(tracks);
    setIndiceFila(0);
    tocarTrackInterno(tracks[0]);
  }, [tocarTrackInterno]);

  const pararPlaylist = useCallback(() => {
    pausar();
    setPlaylistAtiva(null);
    setFilaPlaylist([]);
    setIndiceFila(0);
    setMusicaTocando(null);
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

  // Quando a música termina, toca a próxima da playlist
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleEnded = () => {
      setEstaTocando(false);
      if (filaPlaylist.length > 0) {
        const novoIndice = indiceFila + 1;
        if (novoIndice < filaPlaylist.length) {
          setIndiceFila(novoIndice);
          tocarTrackInterno(filaPlaylist[novoIndice]);
        } else {
          // Fim da playlist
          setPlaylistAtiva(null);
          setFilaPlaylist([]);
          setIndiceFila(0);
          setMusicaTocando(null);
        }
      }
    };

    audioEl.addEventListener('ended', handleEnded);
    return () => audioEl.removeEventListener('ended', handleEnded);
  }, [filaPlaylist, indiceFila, tocarTrackInterno]);

  // Atualizar volume quando muda
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volumeMusica));
    }
  }, [volumeMusica]);

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
      }}
    >
      {children}
      {/* Audio element global — vive no layout, persiste entre navegações */}
      <audio ref={audioRef} />
    </PlayerContext.Provider>
  );
}
