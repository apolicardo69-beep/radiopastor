'use client';

// Cadastro de patrocinadores: nome, uma frase curta e a logo que aparece na
// tela do ouvinte a cada N músicas tocadas.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Sponsor } from '@/lib/types';

export default function PatrocinadoresPage() {
  const supabase = createClient();
  const [patrocinadores, setPatrocinadores] = useState<Sponsor[]>([]);
  const [nome, setNome] = useState('');
  const [frase, setFrase] = useState('');
  const [intervalo, setIntervalo] = useState(9);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const { data } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
    if (data) setPatrocinadores(data);
  }

  useEffect(() => {
    (async () => {
      await carregar();
    })();
    const channel = supabase
      .channel('locucao-patrocinadores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsors' }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErro(null);
    setEnviando(true);
    try {
      let logoPath: string | null = null;
      if (arquivo) {
        const caminho = `${crypto.randomUUID()}-${arquivo.name}`;
        const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo);
        if (error) throw error;
        logoPath = caminho;
      }
      const { error } = await supabase.from('sponsors').insert({
        name: nome.trim(),
        tagline: frase.trim() || null,
        logo_storage_path: logoPath,
        display_every_n_tracks: intervalo,
      });
      if (error) throw error;
      setNome('');
      setFrase('');
      setArquivo(null);
      setIntervalo(9);
    } catch {
      setErro('Não consegui salvar esse patrocinador. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(s: Sponsor) {
    await supabase.from('sponsors').update({ active: !s.active }).eq('id', s.id);
  }

  async function remover(s: Sponsor) {
    if (s.logo_storage_path) {
      await supabase.storage.from('patrocinadores').remove([s.logo_storage_path]);
    }
    await supabase.from('sponsors').delete().eq('id', s.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Novo patrocinador</h2>
        <form onSubmit={adicionar} className="flex flex-col gap-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do patrocinador"
            className="rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
          />
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder="Frase curta (opcional)"
            className="rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
          />
          <label className="text-sm text-[#7a6a52]">
            Logo (opcional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </label>
          <label className="text-sm text-[#7a6a52]">
            Aparece a cada quantas músicas
            <input
              type="number"
              min={1}
              value={intervalo}
              onChange={(e) => setIntervalo(Number(e.target.value))}
              className="mt-1 block w-24 rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={enviando}
            className="rounded-lg bg-[#2b2118] py-2 text-sm font-semibold text-[#f7f1e6] disabled:opacity-60"
          >
            Salvar patrocinador
          </button>
        </form>
        {erro && <p className="mt-2 text-sm text-[#b3261e]">{erro}</p>}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Patrocinadores cadastrados</h2>
        <ul className="flex flex-col gap-2">
          {patrocinadores.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-[#f0e6d2] px-3 py-2">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                {s.tagline && <p className="text-xs text-[#7a6a52]">{s.tagline}</p>}
                <p className="text-xs text-[#a0937a]">a cada {s.display_every_n_tracks} músicas</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => alternarAtivo(s)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    s.active ? 'bg-[#eaf3ec] text-[#2f6b4f]' : 'bg-[#e8e8e8] text-[#7a7a7a]'
                  }`}
                >
                  {s.active ? 'Ativo' : 'Pausado'}
                </button>
                <button onClick={() => remover(s)} className="text-sm text-[#b3261e]">
                  Remover
                </button>
              </div>
            </li>
          ))}
          {patrocinadores.length === 0 && (
            <p className="text-sm text-[#a0937a]">Nenhum patrocinador cadastrado ainda.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
