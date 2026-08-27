'use client';

// Gerenciar a playlist: subir um arquivo de música do celular, ou colar um
// link direto de áudio (mp3/wav em algum servidor — não links de YouTube,
// que não são áudio direto e têm restrição de uso pra isso). O
// playlist-sync (apps/playlist-sync) espelha esta tabela pro arquivo que o
// Liquidsoap toca de verdade.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Track } from '@/lib/types';

function formatarDuracao(segundos: number | null) {
  if (!segundos) return '--:--';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicasPage() {
  const supabase = createClient();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [link, setLink] = useState('');
  const [tituloLink, setTituloLink] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    const { data } = await supabase.from('tracks').select('*').order('position', { ascending: true });
    if (data) setTracks(data);
  }

  useEffect(() => {
    (async () => {
      await carregar();
    })();
    const channel = supabase
      .channel('locucao-musicas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return tracks.length > 0 ? Math.max(...tracks.map((t) => t.position)) + 1 : 1;
  }

  async function enviarArquivo(file: File) {
    setErro(null);
    setEnviando(true);
    try {
      const duracao = await duracaoDoArquivo(file);
      const caminho = `${crypto.randomUUID()}-${file.name}`;
      const { error: erroUpload } = await supabase.storage.from('musicas').upload(caminho, file);
      if (erroUpload) throw erroUpload;
      const posicao = await proximaPosicao();
      const { error: erroInsert } = await supabase.from('tracks').insert({
        title: file.name.replace(/\.[^.]+$/, ''),
        storage_path: caminho,
        source: 'upload',
        duration_seconds: duracao,
        position: posicao,
      });
      if (erroInsert) throw erroInsert;
    } catch {
      setErro('Não consegui adicionar essa música. Tente de novo.');
    } finally {
      setEnviando(false);
      if (inputArquivoRef.current) inputArquivoRef.current.value = '';
    }
  }

  async function adicionarLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setErro(null);
    setEnviando(true);
    try {
      const posicao = await proximaPosicao();
      const { error } = await supabase.from('tracks').insert({
        title: tituloLink.trim() || 'Música sem nome',
        source_url: link.trim(),
        source: 'link',
        position: posicao,
      });
      if (error) throw error;
      setLink('');
      setTituloLink('');
    } catch {
      setErro('Não consegui adicionar esse link. Confira se é um link direto de áudio.');
    } finally {
      setEnviando(false);
    }
  }

  async function remover(track: Track) {
    if (track.storage_path) {
      await supabase.storage.from('musicas').remove([track.storage_path]);
    }
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
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Adicionar música do celular</h2>
        <input
          ref={inputArquivoRef}
          type="file"
          accept="audio/*"
          disabled={enviando}
          onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0])}
          className="block w-full text-sm"
        />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Adicionar por link direto de áudio</h2>
        <form onSubmit={adicionarLink} className="flex flex-col gap-3">
          <input
            value={tituloLink}
            onChange={(e) => setTituloLink(e.target.value)}
            placeholder="Nome da música"
            className="rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
          />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://exemplo.com/musica.mp3"
            className="rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-[#2b2118] py-2 text-sm font-semibold text-[#f7f1e6] disabled:opacity-60"
          >
            Adicionar à playlist
          </button>
        </form>
        <p className="mt-2 text-xs text-[#a0937a]">
          Precisa ser um link que termina em arquivo de áudio (.mp3, .wav) — links do YouTube não
          funcionam aqui por causa dos termos de uso deles.
        </p>
      </section>

      {erro && <p className="rounded-lg bg-[#fbeaea] px-3 py-2 text-sm text-[#b3261e]">{erro}</p>}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Playlist atual ({tracks.length})</h2>
        <ul className="flex flex-col gap-2">
          {tracks.map((track, i) => (
            <li
              key={track.id}
              className="flex items-center gap-3 rounded-lg bg-[#f0e6d2] px-3 py-2"
            >
              <div className="flex flex-col">
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-xs disabled:opacity-30">
                  ▲
                </button>
                <button
                  onClick={() => mover(i, 1)}
                  disabled={i === tracks.length - 1}
                  className="text-xs disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{track.title}</p>
                <p className="text-xs text-[#7a6a52]">
                  {track.source === 'link' ? 'Link' : 'Arquivo'} · {formatarDuracao(track.duration_seconds)}
                </p>
              </div>
              <button onClick={() => remover(track)} className="text-sm text-[#b3261e]">
                Remover
              </button>
            </li>
          ))}
          {tracks.length === 0 && (
            <p className="text-sm text-[#a0937a]">Nenhuma música na playlist ainda.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
