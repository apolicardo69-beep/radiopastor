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
        const caminho = `${crypto.randomUUID()}-${file.name}`;
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
          duration_seconds: duracao,
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
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-semibold">📁 Adicionar músicas do celular/computador</h2>
        <p className="mb-3 text-xs text-[#7a6a52]">
          Selecione <strong>um ou vários</strong> arquivos de áudio (.mp3, .wav, .m4a) de uma só vez.
        </p>
        <input
          ref={inputArquivoRef}
          type="file"
          accept="audio/*"
          multiple
          disabled={enviando}
          onChange={(e) => e.target.files && e.target.files.length > 0 && enviarVariosArquivos(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#2b2118] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#f7f1e6] hover:file:bg-[#43362a]"
        />
        {progresso && (
          <p className="mt-2 text-xs font-medium text-[#2f6b4f]">{progresso}</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-semibold">🔗 Adicionar por link direto de áudio</h2>
        <p className="mb-3 text-xs text-[#7a6a52]">Cole o link de um arquivo de áudio na internet (.mp3 ou .wav).</p>
        <form onSubmit={adicionarLink} className="flex flex-col gap-3">
          <input
            value={tituloLink}
            onChange={(e) => setTituloLink(e.target.value)}
            placeholder="Nome da música (ex: Louvor da Harpa 15)"
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
            disabled={enviando || !link.trim()}
            className="rounded-lg bg-[#2b2118] py-2 text-sm font-semibold text-[#f7f1e6] disabled:opacity-60"
          >
            Adicionar à playlist
          </button>
        </form>
      </section>

      {sucesso && <p className="rounded-lg bg-[#eaf3ec] px-3 py-2 text-sm font-medium text-[#2f6b4f]">{sucesso}</p>}
      {erro && <p className="rounded-lg bg-[#fbeaea] px-3 py-2 text-sm text-[#b3261e]">{erro}</p>}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">🎵 Playlist Atual ({tracks.length})</h2>
          <span className="text-xs text-[#7a6a52]">Toca na rádio 24h</span>
        </div>

        <ul className="flex flex-col gap-3">
          {tracks.map((track, i) => {
            const estaTocando = tocandoId === track.id;
            return (
              <li
                key={track.id}
                className={`flex items-center gap-3 rounded-xl p-3 transition ${
                  estaTocando ? 'border border-[#2b2118] bg-[#e8dac0]' : 'bg-[#f0e6d2]'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => mover(i, -1)} disabled={i === 0}
                    className="rounded bg-white/50 px-1 text-xs disabled:opacity-30" title="Mover para cima">▲</button>
                  <button onClick={() => mover(i, 1)} disabled={i === tracks.length - 1}
                    className="rounded bg-white/50 px-1 text-xs disabled:opacity-30" title="Mover para baixo">▼</button>
                </div>

                <button type="button" onClick={() => alternarPrevia(track)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg shadow-sm transition ${
                    estaTocando ? 'bg-[#b3261e] text-white' : 'bg-[#2b2118] text-white'
                  }`}
                  title={estaTocando ? 'Pausar prévia' : 'Ouvir prévia'}>
                  {estaTocando ? '⏸' : '▶'}
                </button>

                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#2b2118]">{track.title}</p>
                  <p className="text-xs text-[#7a6a52]">
                    {track.source === 'link' ? '🌐 Link' : '📁 Arquivo'} · {formatarDuracao(track.duration_seconds)}
                  </p>
                </div>

                <button onClick={() => remover(track)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b3261e] hover:bg-[#b3261e]/10" title="Remover">
                  Remover
                </button>
              </li>
            );
          })}

          {tracks.length === 0 && (
            <p className="py-4 text-center text-sm text-[#a0937a]">
              Nenhuma música na playlist ainda. Adicione acima para tocar na rádio!
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
