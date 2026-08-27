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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setArquivo(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setArquivo(null);
      setPreviewUrl(null);
    }
  }

  function getLogoUrl(path?: string | null) {
    if (!path) return '';
    const { data } = supabase.storage.from('patrocinadores').getPublicUrl(path);
    return data.publicUrl;
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErro(null);
    setEnviando(true);
    try {
      let logoPath: string | null = null;
      if (arquivo) {
        const caminho = `${crypto.randomUUID()}-${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo, {
          contentType: arquivo.type,
          upsert: true,
        });
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
      setPreviewUrl(null);
      setIntervalo(9);
    } catch (err: any) {
      console.error(err);
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
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          🏷️ Novo Patrocinador / Apoio Cultural
        </h2>
        <p className="mb-3 text-[11px] text-[#7a6a52]">
          Aparece na tela do celular dos ouvintes e no card fixo de patrocinadores.
        </p>

        <form onSubmit={adicionar} className="flex flex-col gap-3">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da empresa ou patrocinador *"
            required
            className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder="Frase ou slogan curto (ex: Se cabe na sua casa cabe no seu bolso)"
            className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />

          {/* Espaço para Upload do Logotipo / Imagem */}
          <div className="rounded-2xl border-2 border-dashed border-[#d9c9a8] bg-[#f7f1e6]/50 p-3.5 text-center transition hover:bg-[#f7f1e6]">
            <label className="flex flex-col items-center justify-center cursor-pointer gap-2">
              {previewUrl ? (
                <div className="relative group">
                  <img
                    src={previewUrl}
                    alt="Prévia do logo"
                    className="max-h-24 max-w-[200px] rounded-xl object-contain bg-white p-1 border border-[#d9c9a8] shadow-xs"
                  />
                  <span className="mt-1 block text-[11px] font-bold text-[#2f6b4f]">
                    ✓ Logotipo selecionado (toque para trocar)
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-lg shadow-xs border border-[#d9c9a8]">
                    🖼️
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#2b2118]">
                      Toque para enviar o Logotipo / Imagem
                    </p>
                    <p className="text-[10px] text-[#7a6a52]">
                      PNG, JPG ou WebP (fundo transparente ou claro recomendado)
                    </p>
                  </div>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {previewUrl && (
              <button
                type="button"
                onClick={() => {
                  setArquivo(null);
                  setPreviewUrl(null);
                }}
                className="mt-2 text-[10px] font-bold text-[#b3261e] hover:underline"
              >
                Remover imagem
              </button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-[#f0e6d2]/50 p-2.5">
            <span className="text-xs font-semibold text-[#2b2118]">
              Exibir destaque a cada quantas músicas:
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
            {enviando ? 'Enviando e Salvando...' : 'Salvar Patrocinador com Logo'}
          </button>
        </form>
        {erro && <p className="mt-2 text-xs font-semibold text-[#b3261e]">{erro}</p>}
      </section>

      {/* Lista de Patrocinadores Cadastrados */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          Patrocinadores Cadastrados ({patrocinadores.length})
        </h2>
        <ul className="flex flex-col gap-2.5">
          {patrocinadores.map((s) => {
            const logoUrl = getLogoUrl(s.logo_storage_path);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#f0e6d2]/60 p-3.5 border border-[#d9c9a8]/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={s.name}
                      className="h-12 w-12 shrink-0 rounded-xl object-contain bg-white p-1 border border-[#d9c9a8] shadow-xs"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#8a6d3b] text-base text-white shadow-xs">
                      ⭐
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#2b2118]">{s.name}</p>
                    {s.tagline && <p className="truncate text-[11px] text-[#7a6a52]">{s.tagline}</p>}
                    <p className="text-[10px] text-[#a0937a]">
                      {logoUrl ? '🖼️ Com Logotipo' : '⚠️ Sem Logo'} · A cada {s.display_every_n_tracks} louvores
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
                    title="Excluir patrocinador"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
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

