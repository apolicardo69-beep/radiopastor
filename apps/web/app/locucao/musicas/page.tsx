'use client';

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
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [tocandoId, setTocandoId] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const audioPreviaRef = useRef<HTMLAudioElement | null>(null);

  async function carregar() {
    const { data } = await supabase.from('tracks').select('*').order('position', { ascending: true });
    if (data) setTracks(data);
  }

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel('locucao-musicas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks' }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (audioPreviaRef.current) audioPreviaRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) return track.source_url;
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  function alternarPrevia(track: Track) {
    const url = getTrackUrl(track);
    if (!url) { setErro('Áudio não encontrado.'); return; }
    if (tocandoId === track.id) {
      audioPreviaRef.current?.pause();
      setTocandoId(null);
      return;
    }
    if (!audioPreviaRef.current) {
      audioPreviaRef.current = new Audio();
      audioPreviaRef.current.onended = () => setTocandoId(null);
      audioPreviaRef.current.onerror = () => { setErro('Erro ao reproduzir.'); setTocandoId(null); };
    }
    audioPreviaRef.current.src = url;
    audioPreviaRef.current.play()
      .then(() => { setTocandoId(track.id); setErro(null); })
      .catch(() => { setErro('O navegador bloqueou o áudio ou o link é inacessível.'); setTocandoId(null); });
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
        // Sanitizar nome: remover acentos, espaços e caracteres especiais
        const nomeLimpo = file.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
          .replace(/[^a-zA-Z0-9._-]/g, '_');                 // troca especiais por _
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
    await carregar();
  }

  async function adicionarLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const posicao = await proximaPosicao();
      const { error } = await supabase.from('tracks').insert({
        title: tituloLink.trim() || 'Música sem nome',
        source_url: link.trim(),
        source: 'link',
        position: posicao,
      });
      if (error) throw new Error(error.message);
      setLink('');
      setTituloLink('');
      setSucesso('✅ Música adicionada à playlist!');
    } catch (e) {
      setErro(`Não consegui adicionar: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(track: Track) {
    if (tocandoId === track.id) { audioPreviaRef.current?.pause(); setTocandoId(null); }
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
    <div className="flex flex-col gap-4 pb-8">
      {/* Upload de Músicas do Celular */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
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
      </section>

      {/* Adicionar Link Web */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          🔗 Adicionar por Link de Áudio
        </h2>
        <p className="mb-3 text-[11px] text-[#7a6a52]">Cole o link direto (.mp3 / .wav) de um louvor na internet.</p>
        <form onSubmit={adicionarLink} className="flex flex-col gap-2.5">
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
            className="rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm disabled:opacity-50 transition active:scale-95"
          >
            Adicionar à Playlist
          </button>
        </form>
      </section>

      {sucesso && (
        <p className="rounded-2xl bg-[#eaf3ec] p-3 text-center text-xs font-bold text-[#2f6b4f]">
          {sucesso}
        </p>
      )}
      {erro && (
        <p className="rounded-2xl bg-[#fbeaea] p-3 text-center text-xs font-semibold text-[#b3261e]">
          {erro}
        </p>
      )}

      {/* Playlist Atual */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              🎵 Playlist da Rádio ({tracks.length})
            </h2>
            <span className="text-[10px] text-[#a0937a]">Toca 24h quando não há locutor</span>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {tracks.map((track, i) => {
            const estaTocando = tocandoId === track.id;
            return (
              <li
                key={track.id}
                className={`flex items-center gap-2 rounded-2xl p-2.5 transition ${
                  estaTocando ? 'bg-[#e8dac0] shadow-xs' : 'bg-[#f0e6d2]/70 hover:bg-[#f0e6d2]'
                }`}
              >
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

                {/* Botão Play Prévia */}
                <button
                  type="button"
                  onClick={() => alternarPrevia(track)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-xs transition active:scale-90 ${
                    estaTocando ? 'bg-[#b3261e]' : 'bg-[#2b2118]'
                  }`}
                  title={estaTocando ? 'Pausar prévia' : 'Ouvir prévia'}
                >
                  {estaTocando ? '⏸' : '▶'}
                </button>

                {/* Título e Duração */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[#2b2118]">{track.title}</p>
                  <p className="text-[10px] text-[#7a6a52]">
                    {track.source === 'link' ? '🌐 Link' : '📁 Arquivo'} · {formatarDuracao(track.duration_seconds)}
                  </p>
                </div>

                {/* Remover */}
                <button
                  onClick={() => remover(track)}
                  className="rounded-xl px-2 py-1.5 text-[11px] font-bold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-90 transition"
                  title="Remover da rádio"
                >
                  ✕
                </button>
              </li>
            );
          })}

          {tracks.length === 0 && (
            <p className="py-8 text-center text-xs text-[#a0937a]">
              Nenhuma música na playlist ainda. Adicione músicas acima!
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
