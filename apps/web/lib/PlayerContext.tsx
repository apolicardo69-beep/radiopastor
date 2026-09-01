'use client';

// Player compartilhado entre o Estúdio e as telas da locução.
//
// ---------------------------------------------------------------------------
// POR QUE NÃO HÁ MAIS YOUTUBE AQUI
// ---------------------------------------------------------------------------
// Faixa do YouTube tocava num iframe do próprio YouTube. O pastor ouvia, mas
// os ouvintes NUNCA ouviam — e não era bug: nenhum navegador deixa uma página
// capturar o áudio de dentro de um iframe de outro domínio, e o mixer da
// transmissão só alcança elementos <audio> desta página.
//
// Tentamos então extrair o áudio do vídeo pelo servidor. Também não deu: o
// YouTube não entrega as faixas de áudio quando a consulta vem de um servidor
// de nuvem — testamos como site, como app Android e como app do iPhone, e os
// três voltaram vazios.
//
// Por isso o YouTube saiu. Toca aqui só o que realmente vai ao ar: arquivo
// enviado ou link direto de áudio. Faixas antigas do YouTube continuam na
// lista, marcadas, e avisam ao serem tocadas em vez de falharem em silêncio.

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
  // Mensagem de erro quando uma faixa não consegue tocar — útil sobretudo no
  // YouTube, onde a extração pode falhar por motivos fora do nosso controle.
  erroFaixa: string | null;
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
  const proximaRef = useRef<() => void>(() => {});

  const [musicaTocando, setMusicaTocando] = useState<Track | null>(null);
  const [estaTocando, setEstaTocando] = useState(false);
  const [playlistAtiva, setPlaylistAtiva] = useState<Playlist | null>(null);
  const [filaPlaylist, setFilaPlaylist] = useState<Track[]>([]);
  const [indiceFila, setIndiceFila] = useState(0);
  const [volumeMusica, setVolumeMusica] = useState(0.8);
  const [ouvintesOnline, setOuvintesOnline] = useState<OuvinteOnline[]>([]);
  const [modalOuvintesAberto, setModalOuvintesAberto] = useState(false);
  const [erroFaixa, setErroFaixa] = useState<string | null>(null);

  const youtubeVideoId = musicaTocando
    ? extractYouTubeVideoId(musicaTocando.source_url || '')
    : null;
  const isYouTube = Boolean(musicaTocando?.source === 'link' && youtubeVideoId);

  // Endereço de onde o áudio da faixa vai tocar. Link do YouTube devolve vazio
  // de propósito — quem chama trata isso como faixa que não dá pra tocar.
  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) {
      if (extractYouTubeVideoId(track.source_url)) return '';
      return track.source_url;
    }
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  const tocarTrackInterno = useCallback(
    (track: Track) => {
      setErroFaixa(null);

      const audioEl = audioRef.current;
      if (!audioEl) return;

      // Faixa antiga do YouTube: avisa em vez de falhar calada.
      if (track.source === 'link' && extractYouTubeVideoId(track.source_url || '')) {
        setMusicaTocando(track);
        setEstaTocando(false);
        setErroFaixa(
          'Esta faixa é um link do YouTube e não vai ao ar. Envie o arquivo da música para tocá-la na rádio.'
        );
        return;
      }

      const url = getTrackUrl(track);
      if (!url) {
        setMusicaTocando(track);
        setEstaTocando(false);
        setErroFaixa('Esta faixa não tem um áudio válido cadastrado.');
        return;
      }

      // crossOrigin só é necessário pro Storage do Supabase, que é outro
      // domínio e manda CORS — sem isso o mixer receberia silêncio. Pra link
      // direto, tiramos (e o atributo não pode ficar sobrando da faixa anterior).
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
          setMusicaTocando(track);
          setErroFaixa('Não consegui tocar esta faixa.');
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumeMusica]
  );

  const pausar = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setEstaTocando(false);
  }, []);

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
    [musicaTocando, estaTocando, pausar, tocarTrackInterno]
  );

  const retomar = useCallback(() => {
    if (audioRef.current && musicaTocando) {
      audioRef.current
        .play()
        .then(() => setEstaTocando(true))
        .catch(() => {});
    }
  }, [musicaTocando]);

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
    if (audioRef.current) audioRef.current.removeAttribute('src');
    setPlaylistAtiva(null);
    setFilaPlaylist([]);
    setIndiceFila(0);
    setMusicaTocando(null);
    setErroFaixa(null);
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

  // Mantém a ref de proxima atualizada para os callbacks do elemento de áudio
  useEffect(() => {
    proximaRef.current = proxima;
  }, [proxima]);

  // Quando a música termina, toca a próxima da playlist.
  //
  // O 'error' aqui é o que avisa quando a extração do YouTube falhou (link
  // expirado, vídeo restrito, YouTube mudou alguma coisa). Sem ele, a playlist
  // travaria numa faixa quebrada em silêncio, sem ninguém entender por quê.
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleEnded = () => {
      setEstaTocando(false);
      if (filaPlaylist.length > 0) {
        proximaRef.current?.();
      }
    };

    const handleError = () => {
      if (!audioEl.src) return; // limpamos o src de propósito ao parar
      setEstaTocando(false);
      setErroFaixa('Não consegui carregar o áudio desta faixa.');
      // Numa playlist, não deixa parada: segue pra próxima sozinho.
      if (filaPlaylist.length > 0) {
        setTimeout(() => proximaRef.current?.(), 1200);
      }
    };

    audioEl.addEventListener('ended', handleEnded);
    audioEl.addEventListener('error', handleError);
    return () => {
      audioEl.removeEventListener('ended', handleEnded);
      audioEl.removeEventListener('error', handleError);
    };
  }, [filaPlaylist]);

  // Atualizar volume quando muda
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, volumeMusica));
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

  // Reprodução em segundo plano e controles na tela de bloqueio do celular
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (musicaTocando) {
      const isYt = Boolean(
        musicaTocando.source === 'link' && extractYouTubeVideoId(musicaTocando.source_url || '')
      );
      const thumb =
        isYt && musicaTocando.source_url
          ? getYouTubeThumbnail(musicaTocando.source_url)
          : '/icons/icon-192x192.png';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: musicaTocando.title || 'Louvor ao Vivo',
          artist: isYt
            ? 'YouTube · Rádio Graça & Paz'
            : playlistAtiva
              ? playlistAtiva.name
              : 'Rádio Graça & Paz',
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
        erroFaixa,
      }}
    >
      {children}

      {/* Elemento de áudio único — vive no layout, persiste entre navegações e
          em segundo plano. Toda faixa passa por aqui, e é daqui que o mixer da
          transmissão puxa o som que vai pros ouvintes. */}
      <audio ref={audioRef} playsInline preload="auto" />
    </PlayerContext.Provider>
  );
}
