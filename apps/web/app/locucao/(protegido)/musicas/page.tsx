'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Track, Playlist, PlaylistItem } from '@/lib/types';
import { usePlayer } from '@/lib/PlayerContext';
import { extractYouTubeVideoId, isYouTubeUrl, getYouTubeThumbnail, fetchYouTubeInfo } from '@/lib/youtube';

function formatarDuracao(segundos: number | null) {
  if (!segundos) return '--:--';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlaylistComTracks extends Playlist {
  itens: (PlaylistItem & { track?: Track })[];
}

export default function MusicasPage() {
  const supabase = createClient();
  const { tocar, musicaTocando, estaTocando, tocarPlaylist, playlistAtiva, setMostrarVideoYoutube } = usePlayer();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistComTracks[]>([]);

  // Abas para adicionar músicas
  const [abaAdicionar, setAbaAdicionar] = useState<'arquivos' | 'youtube' | 'link'>('youtube');

  // Formulário YouTube
  const [linkYoutube, setLinkYoutube] = useState('');
  const [tituloYoutube, setTituloYoutube] = useState('');
  const [ytPreview, setYtPreview] = useState<{
    title: string | null;
    author: string | null;
    thumbnail: string | null;
    videoId: string | null;
  } | null>(null);
  const [buscandoYt, setBuscandoYt] = useState(false);

  // Formulário Link Direto
  const [link, setLink] = useState('');
  const [tituloLink, setTituloLink] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Seleção de músicas para criar playlist
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [nomePlaylist, setNomePlaylist] = useState('');
  const [salvandoPlaylist, setSalvandoPlaylist] = useState(false);
  const [playlistAbertaId, setPlaylistAbertaId] = useState<string | null>(null);

  const inputArquivoRef = useRef<HTMLInputElement>(null);

  async function carregarTracks() {
    const { data } = await supabase.from('tracks').select('*').order('position', { ascending: true });
    if (data) setTracks(data);
  }

  async function carregarPlaylists() {
    const { data: playlistsData } = await supabase.from('playlists').select('*').order('created_at', { ascending: false });
    if (!playlistsData) return;

    const { data: itemsData } = await supabase.from('playlist_items').select('*').order('position', { ascending: true });

    // Juntar tracks com playlist items
    const { data: allTracks } = await supabase.from('tracks').select('*');
    const tracksMap = new Map<string, Track>((allTracks || []).map((t) => [t.id, t]));

    const formatadas: PlaylistComTracks[] = playlistsData.map((pl) => {
      const itens = (itemsData || [])
        .filter((it) => it.playlist_id === pl.id)
        .map((it) => ({ ...it, track: tracksMap.get(it.track_id) }));
      return { ...pl, itens };
    });

    setPlaylists(formatadas);
  }

  useEffect(() => {
    carregarTracks();
    carregarPlaylists();

    const channel = supabase
      .channel('locucao-musicas-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, () => {
        carregarTracks();
        carregarPlaylists();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, () => carregarPlaylists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_items' }, () => carregarPlaylists())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelecionarTrack(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) {
        novo.delete(id);
      } else {
        novo.add(id);
      }
      return novo;
    });
  }

  function selecionarTodas() {
    if (selecionados.size === tracks.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(tracks.map((t) => t.id)));
    }
  }

  async function criarPlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!nomePlaylist.trim()) {
      setErro('Digite um nome para a playlist.');
      return;
    }
    if (selecionados.size === 0) {
      setErro('Selecione pelo menos uma música para a playlist.');
      return;
    }

    setSalvandoPlaylist(true);
    setErro(null);
    setSucesso(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // 1. Inserir playlist
      const { data: novaPlaylist, error: erroPl } = await supabase
        .from('playlists')
        .insert({
          name: nomePlaylist.trim(),
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (erroPl || !novaPlaylist) {
        throw new Error(erroPl?.message || 'Erro ao criar playlist.');
      }

      // 2. Inserir itens ordenados
      const idsArray = Array.from(selecionados);
      const itensParaInserir = idsArray.map((trackId, idx) => ({
        playlist_id: novaPlaylist.id,
        track_id: trackId,
        position: idx + 1,
      }));

      const { error: erroItens } = await supabase.from('playlist_items').insert(itensParaInserir);
      if (erroItens) {
        throw new Error(erroItens.message);
      }

      setNomePlaylist('');
      setSelecionados(new Set());
      setSucesso(`✅ Playlist "${novaPlaylist.name}" criada com ${itensParaInserir.length} músicas! Ela já aparece no Estúdio.`);
      await carregarPlaylists();
    } catch (e: any) {
      setErro(`Erro ao salvar playlist: ${e.message || 'tente novamente'}`);
    } finally {
      setSalvandoPlaylist(false);
    }
  }

  async function excluirPlaylist(id: string, nome: string) {
    if (!confirm(`Tem certeza que deseja excluir a playlist "${nome}"?`)) return;
    try {
      const { error } = await supabase.from('playlists').delete().eq('id', id);
      if (error) throw error;
      setSucesso(`Playlist "${nome}" removida.`);
      await carregarPlaylists();
    } catch (e: any) {
      setErro(`Erro ao excluir: ${e.message}`);
    }
  }

  function tocarPlaylistCompleta(pl: PlaylistComTracks) {
    const listaTracks = pl.itens
      .map((it) => it.track)
      .filter((t): t is Track => t !== undefined);

    if (listaTracks.length === 0) {
      setErro('Esta playlist não possui músicas válidas.');
      return;
    }

    tocarPlaylist(pl, listaTracks);
    setSucesso(`▶ Tocando playlist "${pl.name}" (${listaTracks.length} músicas)`);
  }

  function duracaoDoArquivo(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => resolve(null);
      audio.src = URL.createObjectURL(file);
    });
  }

  async function proximaPosicao() {
    const { data } = await supabase.from('tracks').select('position').order('position', { ascending: false }).limit(1);
    if (data && data.length > 0) return data[0].position + 1;
    return 1;
  }

  async function enviarVariosArquivos(files: FileList) {
    setErro(null);
    setSucesso(null);
    setEnviando(true);

    const total = files.length;
    let enviados = 0;
    let erros = 0;
    const detalhesErro: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgresso(`Enviando ${i + 1} de ${total}: ${file.name}...`);

      try {
        const duracao = await duracaoDoArquivo(file);
        const nomeLimpo = file.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const caminho = `${crypto.randomUUID()}-${nomeLimpo}`;
        const { error: erroUpload } = await supabase.storage.from('musicas').upload(caminho, file);
        if (erroUpload) {
          detalhesErro.push(`${file.name}: ${erroUpload.message}`);
          erros++;
          continue;
        }
        const posicao = await proximaPosicao();
        const { error: erroInsert } = await supabase.from('tracks').insert({
          title: file.name.replace(/\.[^.]+$/, ''),
          storage_path: caminho,
          source: 'upload',
          duration_seconds: duracao ? Math.round(duracao) : null,
          position: posicao,
        });
        if (erroInsert) {
          detalhesErro.push(`${file.name}: ${erroInsert.message}`);
          erros++;
          continue;
        }
        enviados++;
      } catch (e) {
        detalhesErro.push(`${file.name}: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
        erros++;
      }
    }

    setProgresso('');
    if (enviados > 0) {
      setSucesso(`✅ ${enviados} música${enviados > 1 ? 's adicionadas' : ' adicionada'} com sucesso!`);
    }
    if (erros > 0) {
      setErro(`❌ ${erros} arquivo${erros > 1 ? 's falharam' : ' falhou'}: ${detalhesErro.join('; ')}`);
    }

    setEnviando(false);
    if (inputArquivoRef.current) inputArquivoRef.current.value = '';
    await carregarTracks();
  }

  // Manipulação de URL do YouTube com busca automática de título e thumbnail
  async function handleLinkYoutubeChange(valor: string) {
    setLinkYoutube(valor);
    const videoId = extractYouTubeVideoId(valor);

    if (videoId) {
      const thumb = getYouTubeThumbnail(videoId);
      setYtPreview({
        title: null,
        author: null,
        thumbnail: thumb,
        videoId,
      });
      setBuscandoYt(true);

      const info = await fetchYouTubeInfo(valor);
      setYtPreview({
        title: info.title,
        author: info.author,
        thumbnail: info.thumbnail || thumb,
        videoId,
      });
      if (info.title && !tituloYoutube.trim()) {
        setTituloYoutube(info.title);
      }
      setBuscandoYt(false);
    } else {
      setYtPreview(null);
    }
  }

  async function adicionarYoutube(e: React.FormEvent) {
    e.preventDefault();
    const videoId = extractYouTubeVideoId(linkYoutube);
    if (!videoId) {
      setErro('Por favor, insira um link válido do YouTube (ex: https://www.youtube.com/watch?v=...)');
      return;
    }

    setErro(null);
    setSucesso(null);
    setEnviando(true);

    try {
      const posicao = await proximaPosicao();
      const tituloFinal =
        tituloYoutube.trim() || ytPreview?.title || (ytPreview?.author ? `Louvor - ${ytPreview.author}` : 'Vídeo do YouTube');

      const urlPadrao = `https://www.youtube.com/watch?v=${videoId}`;

      const { data: novaTrack, error } = await supabase
        .from('tracks')
        .insert({
          title: tituloFinal,
          source_url: urlPadrao,
          source: 'link',
          position: posicao,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      setLinkYoutube('');
      setTituloYoutube('');
      setYtPreview(null);
      setSucesso(`✅ "${tituloFinal}" adicionado com sucesso!`);
      await carregarTracks();
    } catch (e: any) {
      setErro(`Não consegui adicionar vídeo: ${e.message || 'erro desconhecido'}`);
    } finally {
      setEnviando(false);
    }
  }

  async function adicionarLinkDireto(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const posicao = await proximaPosicao();
      const { error } = await supabase.from('tracks').insert({
        title: tituloLink.trim() || 'Música por Link',
        source_url: link.trim(),
        source: 'link',
        position: posicao,
      });
      if (error) throw new Error(error.message);
      setLink('');
      setTituloLink('');
      setSucesso('✅ Música adicionada com sucesso!');
      await carregarTracks();
    } catch (e: any) {
      setErro(`Não consegui adicionar: ${e.message || 'erro desconhecido'}`);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(track: Track) {
    if (track.storage_path) await supabase.storage.from('musicas').remove([track.storage_path]);
    await supabase.from('tracks').delete().eq('id', track.id);
  }

  async function mover(index: number, direcao: -1 | 1) {
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= tracks.length) return;
    const a = tracks[index];
    const b = tracks[alvo];
    await Promise.all([
      supabase.from('tracks').update({ position: b.position }).eq('id', a.id),
      supabase.from('tracks').update({ position: a.position }).eq('id', b.id),
    ]);
  }

  return (
    <div className="flex flex-col gap-5 pb-16">
      {/* Playlists Personalizadas Cadastradas */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-3 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              📋 Playlists Personalizadas ({playlists.length})
            </h2>
            <p className="text-[11px] text-[#a0937a]">
              Playlists criadas para tocar direto no Estúdio durante a locução.
            </p>
          </div>
        </div>

        {playlists.length === 0 ? (
          <div className="rounded-2xl bg-[#f7f1e6]/60 p-4 text-center text-xs text-[#7a6a52]">
            <span className="text-2xl block mb-1">✨</span>
            <p className="font-bold">Nenhuma playlist criada ainda.</p>
            <p className="text-[11px] text-[#a0937a] mt-0.5">
              Selecione as músicas na lista abaixo com o checkbox e dê um nome para criar sua primeira playlist!
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {playlists.map((pl) => {
              const estaTocandoEstaPlaylist = playlistAtiva?.id === pl.id && estaTocando;
              const isAberta = playlistAbertaId === pl.id;

              return (
                <li
                  key={pl.id}
                  className={`rounded-2xl border transition overflow-hidden ${
                    estaTocandoEstaPlaylist
                      ? 'border-[#2f6b4f] bg-[#eaf3ec]/70'
                      : 'border-[#d9c9a8]/50 bg-[#f0e6d2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between p-3.5 gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => tocarPlaylistCompleta(pl)}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm transition active:scale-95 ${
                          estaTocandoEstaPlaylist ? 'bg-[#b3261e]' : 'bg-[#2f6b4f]'
                        }`}
                        title={estaTocandoEstaPlaylist ? 'Tocando playlist' : 'Tocar esta playlist'}
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setPlaylistAbertaId(isAberta ? null : pl.id)}
                        className="rounded-xl bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-[#5c4a35] hover:bg-white active:scale-95 shadow-xs"
                      >
                        {isAberta ? 'Ocultar' : 'Ver faixas'}
                      </button>
                      <button
                        onClick={() => excluirPlaylist(pl.id, pl.name)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-95"
                        title="Excluir playlist"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Lista de faixas da playlist expandida */}
                  {isAberta && (
                    <div className="border-t border-[#d9c9a8]/30 bg-white/60 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a6a52] mb-2">
                        Faixas da Playlist ({pl.itens.length}):
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {pl.itens.map((it, idx) => {
                          const isYt = isYouTubeUrl(it.track?.source_url);
                          return (
                            <li
                              key={it.id}
                              className="flex items-center justify-between gap-2 rounded-xl bg-white/90 px-2.5 py-1.5 text-xs"
                            >
                              <span className="text-[11px] font-bold text-[#7a6a52] w-5 shrink-0">
                                {idx + 1}.
                              </span>
                              <div className="truncate flex-1 font-semibold text-[#2b2118] flex items-center gap-1.5">
                                {isYt && <span className="text-[10px]">🔴</span>}
                                <span className="truncate">{it.track?.title || 'Música indisponível'}</span>
                              </div>
                              <span className="text-[10px] text-[#a0937a]">
                                {formatarDuracao(it.track?.duration_seconds ?? null)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Caixa de Criação de Playlist a partir da seleção */}
      {selecionados.size > 0 && (
        <section className="sticky top-16 z-30 rounded-3xl bg-[#2b2118] p-4 text-white shadow-2xl border border-[#d9c9a8]/40 animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#f7f1e6]">
              ✨ Criar Playlist com {selecionados.size} {selecionados.size === 1 ? 'música selecionada' : 'músicas selecionadas'}
            </span>
            <button
              onClick={() => setSelecionados(new Set())}
              className="text-[11px] text-[#d9c9a8] hover:text-white underline cursor-pointer"
            >
              Desmarcar todas
            </button>
          </div>

          <form onSubmit={criarPlaylist} className="flex gap-2">
            <input
              value={nomePlaylist}
              onChange={(e) => setNomePlaylist(e.target.value)}
              placeholder="Nome da Playlist (ex: Culto de Domingo, Manhã de Louvor)"
              required
              className="flex-1 rounded-xl bg-white px-3.5 py-2 text-xs font-medium text-[#2b2118] focus:outline-none focus:ring-2 focus:ring-[#d9c9a8]"
            />
            <button
              type="submit"
              disabled={salvandoPlaylist || !nomePlaylist.trim()}
              className="rounded-xl bg-[#2f6b4f] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-[#255740] disabled:opacity-50 transition active:scale-95 shrink-0 cursor-pointer"
            >
              {salvandoPlaylist ? 'Salvando...' : 'Salvar Playlist'}
            </button>
          </form>
        </section>
      )}

      {/* Central de Adição de Músicas com Abas */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#f0e6d2]/60 mb-4">
          <button
            type="button"
            onClick={() => setAbaAdicionar('youtube')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
              abaAdicionar === 'youtube'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[#5c4a35] hover:bg-[#f0e6d2]'
            }`}
          >
            <span>🔴</span>
            <span>Link YouTube</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAdicionar('arquivos')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
              abaAdicionar === 'arquivos'
                ? 'bg-[#2b2118] text-[#f7f1e6] shadow-sm'
                : 'text-[#5c4a35] hover:bg-[#f0e6d2]'
            }`}
          >
            <span>📁</span>
            <span>Upload de Arquivo</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAdicionar('link')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
              abaAdicionar === 'link'
                ? 'bg-[#2b2118] text-[#f7f1e6] shadow-sm'
                : 'text-[#5c4a35] hover:bg-[#f0e6d2]'
            }`}
          >
            <span>🔗</span>
            <span>Link Áudio (.mp3)</span>
          </button>
        </div>

        {/* Aba 1: YouTube */}
        {abaAdicionar === 'youtube' && (
          <div className="animate-in fade-in duration-200">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52] flex items-center gap-1.5">
              <span>🔴</span> Tocar ou Adicionar Louvor do YouTube
            </h2>
            <p className="mb-3 text-[11px] text-[#7a6a52]">
              Cole o link de qualquer vídeo ou música do YouTube (ex: <code className="bg-[#f0e6d2] px-1 rounded">https://youtube.com/watch?v=...</code> ou <code className="bg-[#f0e6d2] px-1 rounded">https://youtu.be/...</code>). O título e a capa são carregados automaticamente!
            </p>

            <form onSubmit={adicionarYoutube} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  value={linkYoutube}
                  onChange={(e) => handleLinkYoutubeChange(e.target.value)}
                  placeholder="Cole aqui o link do YouTube (ex: https://youtu.be/abc...)"
                  className="w-full rounded-2xl border border-[#d9c9a8] bg-[#f7f1e6]/30 px-3.5 py-2.5 text-xs font-medium focus:border-red-600 focus:ring-1 focus:ring-red-600 focus:outline-none"
                />
                {buscandoYt && (
                  <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-red-600 font-bold">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                    <span>Buscando...</span>
                  </div>
                )}
              </div>

              {/* Card de Pré-visualização do YouTube */}
              {ytPreview && (
                <div className="flex items-center gap-3 rounded-2xl bg-[#f0e6d2]/70 p-3 border border-[#d9c9a8] animate-in fade-in duration-300">
                  {ytPreview.thumbnail ? (
                    <img
                      src={ytPreview.thumbnail}
                      alt="Thumbnail YouTube"
                      className="h-14 w-20 rounded-xl object-cover shadow-xs shrink-0 border border-black/10"
                    />
                  ) : (
                    <div className="h-14 w-20 rounded-xl bg-red-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
                      ▶
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-wider">
                      Vídeo Detectado
                    </p>
                    <p className="truncate text-xs font-bold text-[#2b2118]">
                      {ytPreview.title || 'Carregando título do vídeo...'}
                    </p>
                    {ytPreview.author && (
                      <p className="truncate text-[11px] text-[#7a6a52]">
                        Canal: {ytPreview.author}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <input
                value={tituloYoutube}
                onChange={(e) => setTituloYoutube(e.target.value)}
                placeholder="Título da Música (opcional, detectado automaticamente)"
                className="rounded-2xl border border-[#d9c9a8] bg-[#f7f1e6]/30 px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
              />

              <button
                type="submit"
                disabled={enviando || !extractYouTubeVideoId(linkYoutube)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 py-3 text-xs font-bold text-white shadow-md hover:bg-red-700 disabled:opacity-40 transition active:scale-95 cursor-pointer"
              >
                <span>➕</span>
                <span>{enviando ? 'Adicionando...' : 'Adicionar Louvor do YouTube à Rádio'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Aba 2: Upload de Músicas do Celular */}
        {abaAdicionar === 'arquivos' && (
          <div className="animate-in fade-in duration-200">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              📁 Enviar Músicas do Celular / Computador
            </h2>
            <p className="mb-3 text-[11px] text-[#7a6a52]">
              Toque no botão abaixo e selecione <strong>uma ou várias músicas</strong> (.mp3, .wav, .m4a) de uma só vez.
            </p>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d9c9a8] bg-[#f7f1e6]/50 p-5 text-center transition active:bg-[#f0e6d2] hover:bg-[#f7f1e6]">
              <span className="text-3xl">🎵</span>
              <span className="mt-2 text-xs font-bold text-[#2b2118]">
                {enviando ? 'Enviando arquivos...' : 'Toque aqui para escolher músicas'}
              </span>
              <span className="text-[10px] text-[#7a6a52]">Aceita vários arquivos de uma vez</span>
              <input
                ref={inputArquivoRef}
                type="file"
                accept="audio/*"
                multiple
                disabled={enviando}
                onChange={(e) => e.target.files && e.target.files.length > 0 && enviarVariosArquivos(e.target.files)}
                className="hidden"
              />
            </label>

            {progresso && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#eaf3ec] p-2.5 text-xs font-bold text-[#2f6b4f]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>{progresso}</span>
              </div>
            )}
          </div>
        )}

        {/* Aba 3: Adicionar Link Direto */}
        {abaAdicionar === 'link' && (
          <div className="animate-in fade-in duration-200">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              🔗 Adicionar por Link Direto de Áudio
            </h2>
            <p className="mb-3 text-[11px] text-[#7a6a52]">Cole o link direto (.mp3 / .wav) de um louvor na internet.</p>
            <form onSubmit={adicionarLinkDireto} className="flex flex-col gap-2.5">
              <input
                value={tituloLink}
                onChange={(e) => setTituloLink(e.target.value)}
                placeholder="Nome da música (ex: Porque Ele Vive)"
                className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
              />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://exemplo.com/musica.mp3"
                className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
              />
              <button
                type="submit"
                disabled={enviando || !link.trim()}
                className="rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm disabled:opacity-50 transition active:scale-95 cursor-pointer"
              >
                Adicionar à Lista de Músicas
              </button>
            </form>
          </div>
        )}
      </section>

      {sucesso && (
        <p className="rounded-2xl bg-[#eaf3ec] p-3 text-center text-xs font-bold text-[#2f6b4f] border border-[#2f6b4f]/20">
          {sucesso}
        </p>
      )}
      {erro && (
        <p className="rounded-2xl bg-[#fbeaea] p-3 text-center text-xs font-semibold text-[#b3261e] border border-[#b3261e]/20">
          {erro}
        </p>
      )}

      {/* Lista Todas as Músicas com Checkboxes para montagem de Playlists */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <div className="mb-3 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              🎵 Todas as Músicas ({tracks.length})
            </h2>
            <span className="text-[10px] text-[#a0937a]">
              Marque as músicas desejadas para criar uma playlist
            </span>
          </div>

          {tracks.length > 0 && (
            <button
              onClick={selecionarTodas}
              className="rounded-xl bg-[#f0e6d2]/80 px-2.5 py-1 text-[11px] font-bold text-[#5c4a35] hover:bg-[#f0e6d2] transition active:scale-95 cursor-pointer"
            >
              {selecionados.size === tracks.length ? 'Desmarcar Todas' : 'Marcar Todas'}
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {tracks.map((track, i) => {
            const estaTocandoEsta = musicaTocando?.id === track.id && estaTocando;
            const isSelecionada = selecionados.has(track.id);
            const isYt = isYouTubeUrl(track.source_url);
            const ytThumb = isYt && track.source_url ? getYouTubeThumbnail(track.source_url) : null;

            return (
              <li
                key={track.id}
                className={`flex items-center gap-2 rounded-2xl p-2.5 transition border ${
                  isSelecionada
                    ? 'border-[#2b2118] bg-[#f0e6d2]'
                    : estaTocandoEsta
                    ? 'border-[#2f6b4f] bg-[#eaf3ec]'
                    : 'border-transparent bg-[#f0e6d2]/60 hover:bg-[#f0e6d2]'
                }`}
              >
                {/* Checkbox para selecionar para Playlist */}
                <input
                  type="checkbox"
                  checked={isSelecionada}
                  onChange={() => toggleSelecionarTrack(track.id)}
                  className="h-4 w-4 cursor-pointer accent-[#2b2118] rounded"
                  title="Selecionar para playlist"
                />

                {/* Botões Reordenar (Touch-friendly) */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    className="flex h-5 w-6 items-center justify-center rounded-md bg-white/90 text-[10px] font-bold shadow-xs disabled:opacity-20 active:scale-90"
                    title="Mover para cima"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => mover(i, 1)}
                    disabled={i === tracks.length - 1}
                    className="flex h-5 w-6 items-center justify-center rounded-md bg-white/90 text-[10px] font-bold shadow-xs disabled:opacity-20 active:scale-90"
                    title="Mover para baixo"
                  >
                    ▼
                  </button>
                </div>

                {/* Thumbnail do YouTube ou Botão Play */}
                <div className="relative shrink-0">
                  {ytThumb ? (
                    <div className="relative h-10 w-14 rounded-xl overflow-hidden shadow-xs border border-black/10">
                      <img src={ytThumb} alt="Capa" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => tocar(track)}
                        className={`absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white font-bold transition active:scale-90 ${
                          estaTocandoEsta ? 'bg-red-600/80 text-white' : ''
                        }`}
                        title={estaTocandoEsta ? 'Pausar áudio' : 'Tocar áudio'}
                      >
                        {estaTocandoEsta ? '⏸' : '▶'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => tocar(track)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-xs transition active:scale-90 ${
                        estaTocandoEsta ? 'bg-[#b3261e]' : 'bg-[#2b2118]'
                      }`}
                      title={estaTocandoEsta ? 'Pausar áudio' : 'Tocar áudio'}
                    >
                      {estaTocandoEsta ? '⏸' : '▶'}
                    </button>
                  )}
                </div>

                {/* Título e Duração */}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => toggleSelecionarTrack(track.id)}
                >
                  <p className="truncate text-xs font-bold text-[#2b2118] flex items-center gap-1.5">
                    <span className="truncate">{track.title}</span>
                    {isYt && (
                      <span className="shrink-0 rounded-md bg-red-600 px-1 py-0.2 text-[8px] font-black text-white">
                        YouTube
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-[#7a6a52]">
                    {isYt ? '🔴 YouTube' : track.source === 'link' ? '🌐 Link' : '📁 Arquivo'} · {formatarDuracao(track.duration_seconds)}
                  </p>
                </div>

                {/* Remover */}
                <button
                  onClick={() => remover(track)}
                  className="rounded-xl px-2 py-1.5 text-[11px] font-bold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-90 transition cursor-pointer"
                  title="Remover música"
                >
                  ✕
                </button>
              </li>
            );
          })}

          {tracks.length === 0 && (
            <p className="py-8 text-center text-xs text-[#a0937a]">
              Nenhuma música na biblioteca ainda. Adicione músicas acima!
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
