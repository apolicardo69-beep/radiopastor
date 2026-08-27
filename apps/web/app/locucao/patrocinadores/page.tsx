'use client';

// Cadastro de patrocinadores e apoios culturais
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
        const caminho = `${crypto.randomUUID()}-${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
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
    <div className="flex flex-col gap-4 pb-8">
      {/* Formulário Novo Patrocinador */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          🏷️ Novo Patrocinador / Apoio
        </h2>
        <p className="mb-3 text-[11px] text-[#7a6a52]">
          Aparece na tela do celular dos ouvintes a cada N músicas tocadas.
        </p>

        <form onSubmit={adicionar} className="flex flex-col gap-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da empresa ou patrocinador"
            className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder="Frase ou slogan curto (opcional)"
            className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />

          <div className="flex items-center justify-between rounded-xl bg-[#f0e6d2]/50 p-2.5">
            <span className="text-xs font-semibold text-[#2b2118]">
              Exibir a cada quantas músicas:
            </span>
            <input
              type="number"
              min={1}
              value={intervalo}
              onChange={(e) => setIntervalo(Number(e.target.value))}
              className="w-16 rounded-lg border border-[#d9c9a8] bg-white px-2 py-1 text-center text-xs font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={enviando || !nome.trim()}
            className="rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm disabled:opacity-50 transition active:scale-95"
          >
            {enviando ? 'Salvando...' : 'Salvar Patrocinador'}
          </button>
        </form>
        {erro && <p className="mt-2 text-xs font-semibold text-[#b3261e]">{erro}</p>}
      </section>

      {/* Lista de Patrocinadores Cadastrados */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          Patrocinadores ({patrocinadores.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {patrocinadores.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-[#f0e6d2]/70 p-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#2b2118]">{s.name}</p>
                {s.tagline && <p className="truncate text-[11px] text-[#7a6a52]">{s.tagline}</p>}
                <p className="text-[10px] text-[#a0937a]">A cada {s.display_every_n_tracks} louvores</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => alternarAtivo(s)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
                    s.active ? 'bg-[#eaf3ec] text-[#2f6b4f]' : 'bg-[#e8e8e8] text-[#7a7a7a]'
                  }`}
                >
                  {s.active ? 'Ativo' : 'Pausado'}
                </button>
                <button
                  onClick={() => remover(s)}
                  className="rounded-xl px-2 py-1 text-xs font-bold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-95"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
          {patrocinadores.length === 0 && (
            <p className="py-6 text-center text-xs text-[#a0937a]">
              Nenhum patrocinador cadastrado ainda.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}

