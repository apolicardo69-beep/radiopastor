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

  // Estado de edição
  const [editando, setEditando] = useState<Sponsor | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editFrase, setEditFrase] = useState('');
  const [editIntervalo, setEditIntervalo] = useState(9);
  const [editArquivo, setEditArquivo] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editEnviando, setEditEnviando] = useState(false);
  const [editErro, setEditErro] = useState<string | null>(null);

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

  // Bloquear/Desbloquear (tipo falta de pagamento)
  async function alternarBloqueio(s: Sponsor) {
    await supabase.from('sponsors').update({ active: !s.active }).eq('id', s.id);
  }

  // Abrir modal de edição
  function abrirEdicao(s: Sponsor) {
    setEditando(s);
    setEditNome(s.name);
    setEditFrase(s.tagline || '');
    setEditIntervalo(s.display_every_n_tracks);
    setEditArquivo(null);
    setEditPreviewUrl(s.logo_storage_path ? getLogoUrl(s.logo_storage_path) : null);
    setEditErro(null);
  }

  function fecharEdicao() {
    setEditando(null);
    setEditNome('');
    setEditFrase('');
    setEditIntervalo(9);
    setEditArquivo(null);
    setEditPreviewUrl(null);
    setEditErro(null);
  }

  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setEditArquivo(file);
      setEditPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || !editNome.trim()) return;
    setEditErro(null);
    setEditEnviando(true);
    try {
      let logoPath = editando.logo_storage_path;

      if (editArquivo) {
        // Remove o logo antigo se existir
        if (editando.logo_storage_path) {
          await supabase.storage.from('patrocinadores').remove([editando.logo_storage_path]);
        }
        const caminho = `${crypto.randomUUID()}-${editArquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabase.storage.from('patrocinadores').upload(caminho, editArquivo, {
          contentType: editArquivo.type,
          upsert: true,
        });
        if (error) throw error;
        logoPath = caminho;
      }

      const { error } = await supabase.from('sponsors').update({
        name: editNome.trim(),
        tagline: editFrase.trim() || null,
        logo_storage_path: logoPath,
        display_every_n_tracks: editIntervalo,
      }).eq('id', editando.id);

      if (error) throw error;
      fecharEdicao();
    } catch (err: any) {
      console.error(err);
      setEditErro('Não consegui salvar as alterações. Tente de novo.');
    } finally {
      setEditEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Modal de Edição */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl bg-[#f7f1e6] p-5 shadow-2xl border border-[#d9c9a8]">
            <button
              onClick={fecharEdicao}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#2b2118]/10 text-xs font-bold text-[#2b2118] hover:bg-[#2b2118]/20"
            >
              ✕
            </button>

            <h3 className="text-sm font-extrabold text-[#2b2118] mb-4">
              ✏️ Editar Patrocinador
            </h3>

            <form onSubmit={salvarEdicao} className="flex flex-col gap-3">
              <input
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                placeholder="Nome da empresa ou patrocinador *"
                required
                className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none bg-white"
              />
              <input
                value={editFrase}
                onChange={(e) => setEditFrase(e.target.value)}
                placeholder="Frase ou slogan curto"
                className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none bg-white"
              />

              {/* Upload do Logotipo */}
              <div className="rounded-2xl border-2 border-dashed border-[#d9c9a8] bg-[#f7f1e6]/50 p-3 text-center transition hover:bg-[#f7f1e6]">
                <label className="flex flex-col items-center justify-center cursor-pointer gap-2">
                  {editPreviewUrl ? (
                    <div className="relative group">
                      <img
                        src={editPreviewUrl}
                        alt="Prévia do logo"
                        className="max-h-20 max-w-[180px] rounded-xl object-contain bg-white p-1 border border-[#d9c9a8] shadow-xs"
                      />
                      <span className="mt-1 block text-[11px] font-bold text-[#2f6b4f]">
                        Toque para trocar o logo
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm shadow-xs border border-[#d9c9a8]">
                        🖼️
                      </div>
                      <span className="text-xs font-bold text-[#2b2118]">
                        Enviar Logotipo
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white/80 p-2.5">
                <span className="text-xs font-semibold text-[#2b2118]">
                  Exibir a cada quantas músicas:
                </span>
                <input
                  type="number"
                  min={1}
                  value={editIntervalo}
                  onChange={(e) => setEditIntervalo(Number(e.target.value))}
                  className="w-16 rounded-lg border border-[#d9c9a8] bg-white px-2 py-1 text-center text-xs font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={editEnviando || !editNome.trim()}
                className="rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm disabled:opacity-50 transition active:scale-95"
              >
                {editEnviando ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </form>
            {editErro && <p className="mt-2 text-xs font-semibold text-[#b3261e]">{editErro}</p>}
          </div>
        </div>
      )}

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
                className={`flex items-center justify-between gap-3 rounded-2xl p-3.5 border transition ${
                  s.active
                    ? 'bg-[#f0e6d2]/60 border-[#d9c9a8]/40'
                    : 'bg-[#fef2f2]/80 border-[#e8b4b4]/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={s.name}
                      className={`h-12 w-12 shrink-0 rounded-xl object-contain bg-white p-1 border shadow-xs ${
                        s.active ? 'border-[#d9c9a8]' : 'border-[#e8b4b4] opacity-60 grayscale'
                      }`}
                    />
                  ) : (
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base text-white shadow-xs ${
                      s.active ? 'bg-[#8a6d3b]' : 'bg-[#b0b0b0]'
                    }`}>
                      ⭐
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs font-bold ${s.active ? 'text-[#2b2118]' : 'text-[#999] line-through'}`}>
                      {s.name}
                    </p>
                    {s.tagline && (
                      <p className={`truncate text-[11px] ${s.active ? 'text-[#7a6a52]' : 'text-[#aaa]'}`}>
                        {s.tagline}
                      </p>
                    )}
                    <p className="text-[10px] text-[#a0937a]">
                      {logoUrl ? '🖼️ Com Logotipo' : '⚠️ Sem Logo'} · A cada {s.display_every_n_tracks} louvores
                    </p>
                    {!s.active && (
                      <p className="text-[10px] font-bold text-[#b3261e] mt-0.5">
                        🚫 Bloqueado
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Botão Editar */}
                  <button
                    onClick={() => abrirEdicao(s)}
                    className="rounded-xl px-2 py-1 text-xs font-bold text-[#2b6cb0] bg-[#ebf4ff] hover:bg-[#d3e8ff] active:scale-95 transition"
                    title="Editar patrocinador"
                  >
                    ✏️
                  </button>
                  {/* Botão Bloquear / Desbloquear */}
                  <button
                    onClick={() => alternarBloqueio(s)}
                    className={`rounded-xl px-2 py-1 text-xs font-bold transition active:scale-95 ${
                      s.active
                        ? 'bg-[#fef2f2] text-[#b3261e] hover:bg-[#fde8e8]'
                        : 'bg-[#eaf3ec] text-[#2f6b4f] hover:bg-[#d4eadc]'
                    }`}
                    title={s.active ? 'Bloquear (ex: falta de pagamento)' : 'Desbloquear patrocinador'}
                  >
                    {s.active ? '🔒' : '🔓'}
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
