'use client';

// Cadastro de patrocinadores e apoios culturais.
//
// Novidades em relação à versão anterior:
//  1. Campo de WhatsApp — o card no app do ouvinte vira um link que abre a
//     conversa direto com o anunciante.
//  2. Botão "Gerar com IA" — a partir do nome e do ramo do negócio, sugere
//     chamadas curtas e cria uma arte de fundo pro card.
//
// Sobre a arte: a IA gera SÓ o fundo, sem texto e sem logo. O nome e a logo
// do anunciante entram por cima, no app, com fonte de verdade e o arquivo
// que ele mesmo enviou — modelos de imagem erram letra e deformam marca, e
// um anúncio com o nome torto envergonha justamente quem está pagando.
//
// A geração acontece em /api/anuncios/gerar (nunca no navegador: a chave da
// IA não pode sair do servidor). A imagem é gerada uma vez e salva no
// Storage; o app do ouvinte só exibe o arquivo pronto.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Sponsor } from '@/lib/types';

// ---------------------------------------------------------------------------
// Painel de geração com IA — usado no cadastro e na edição
// ---------------------------------------------------------------------------
function GeradorIA({
  nome,
  onEscolherTexto,
  onArteGerada,
  artePathAtual,
}: {
  nome: string;
  onEscolherTexto: (texto: string) => void;
  onArteGerada: (caminho: string | null) => void;
  artePathAtual: string | null;
}) {
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const [ramo, setRamo] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [gerarImagem, setGerarImagem] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [chamadas, setChamadas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function urlDaArte(path: string | null) {
    if (!path) return '';
    const { data } = supabase.storage.from('patrocinadores').getPublicUrl(path);
    return data.publicUrl;
  }

  async function gerar() {
    if (!nome.trim() || !ramo.trim()) return;
    setGerando(true);
    setErro(null);
    setAviso(null);

    try {
      const resposta = await fetch('/api/anuncios/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          ramo: ramo.trim(),
          detalhes: detalhes.trim(),
          gerarImagem,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados?.erro || 'Não consegui gerar agora. Tente de novo.');
        return;
      }

      setChamadas(Array.isArray(dados.chamadas) ? dados.chamadas : []);
      if (dados.background_storage_path) {
        onArteGerada(dados.background_storage_path);
      }
      if (dados.aviso) setAviso(dados.aviso);
    } catch {
      setErro('Falha de conexão ao falar com a IA.');
    } finally {
      setGerando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-xl border border-[#e0c98a] bg-[#fdf4e3] py-2.5 text-xs font-bold text-[#8a6d3b] transition hover:bg-[#f9ebd0] active:scale-95"
      >
        ✨ Criar anúncio com IA
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e0c98a] bg-[#fdf4e3] p-3.5">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-[#8a6d3b]">✨ Criar anúncio com IA</p>
          <p className="text-[10px] text-[#a08a5b]">
            Sugere a chamada e cria uma arte de fundo. A logo e o nome entram por cima.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 rounded-full bg-[#8a6d3b]/10 px-2 py-0.5 text-[11px] font-bold text-[#8a6d3b] hover:bg-[#8a6d3b]/20"
        >
          ✕
        </button>
      </div>

      <input
        value={ramo}
        onChange={(e) => setRamo(e.target.value)}
        placeholder="Ramo do negócio * (ex: móveis planejados)"
        className="mb-2 w-full rounded-xl border border-[#e0c98a] bg-white px-3 py-2 text-xs focus:border-[#8a6d3b] focus:outline-none"
      />
      <input
        value={detalhes}
        onChange={(e) => setDetalhes(e.target.value)}
        placeholder="Detalhes (opcional): cidade que atende, diferencial..."
        className="mb-2 w-full rounded-xl border border-[#e0c98a] bg-white px-3 py-2 text-xs focus:border-[#8a6d3b] focus:outline-none"
      />

      <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-[#8a6d3b]">
        <input
          type="checkbox"
          checked={gerarImagem}
          onChange={(e) => setGerarImagem(e.target.checked)}
          className="h-4 w-4 accent-[#8a6d3b]"
        />
        Gerar também a arte de fundo (custa alguns centavos por anúncio)
      </label>

      <button
        type="button"
        onClick={gerar}
        disabled={gerando || !nome.trim() || !ramo.trim()}
        className="w-full rounded-xl bg-[#8a6d3b] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#755c31] active:scale-95 disabled:bg-[#c9b58a]"
      >
        {gerando ? '⏳ Gerando...' : chamadas.length > 0 ? '🔄 Gerar de novo' : '✨ Gerar'}
      </button>

      {!nome.trim() && (
        <p className="mt-1.5 text-center text-[10px] text-[#a08a5b]">
          Preencha o nome do patrocinador acima primeiro.
        </p>
      )}

      {erro && (
        <p className="mt-2 rounded-xl bg-[#fbeaea] p-2 text-[11px] font-semibold text-[#b3261e]">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mt-2 rounded-xl bg-white p-2 text-[11px] font-semibold text-[#8a6d3b]">
          {aviso}
        </p>
      )}

      {chamadas.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold text-[#8a6d3b]">
            Toque na chamada que preferir:
          </p>
          <div className="flex flex-col gap-1.5">
            {chamadas.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onEscolherTexto(c)}
                className="rounded-xl border border-[#e0c98a] bg-white px-3 py-2 text-left text-xs font-semibold text-[#2b2118] transition hover:bg-[#fdf4e3] active:scale-95"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {artePathAtual && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold text-[#8a6d3b]">Arte de fundo gerada:</p>
          <img
            src={urlDaArte(artePathAtual)}
            alt="Arte de fundo gerada por IA"
            className="w-full rounded-xl border border-[#e0c98a] object-cover shadow-xs"
          />
          <button
            type="button"
            onClick={() => onArteGerada(null)}
            className="mt-1.5 text-[10px] font-bold text-[#b3261e] hover:underline"
          >
            Remover arte
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function PatrocinadoresPage() {
  const supabase = createClient();
  const [patrocinadores, setPatrocinadores] = useState<Sponsor[]>([]);
  const [nome, setNome] = useState('');
  const [frase, setFrase] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [artePath, setArtePath] = useState<string | null>(null);
  const [intervalo, setIntervalo] = useState(9);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Estado de edição
  const [editando, setEditando] = useState<Sponsor | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editFrase, setEditFrase] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editArtePath, setEditArtePath] = useState<string | null>(null);
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

  // Guarda só os dígitos e garante o DDI 55 — assim o link wa.me sai pronto
  // no app do ouvinte, independente de como o pastor digitou.
  function normalizarWhatsapp(valor: string): string | null {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return null;
    return digitos.startsWith('55') ? digitos : `55${digitos}`;
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
        background_storage_path: artePath,
        whatsapp: normalizarWhatsapp(whatsapp),
        display_every_n_tracks: intervalo,
      });
      if (error) throw error;
      setNome('');
      setFrase('');
      setWhatsapp('');
      setArtePath(null);
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
    setEditWhatsapp(s.whatsapp || '');
    setEditArtePath(s.background_storage_path || null);
    setEditIntervalo(s.display_every_n_tracks);
    setEditArquivo(null);
    setEditPreviewUrl(s.logo_storage_path ? getLogoUrl(s.logo_storage_path) : null);
    setEditErro(null);
  }

  function fecharEdicao() {
    setEditando(null);
    setEditNome('');
    setEditFrase('');
    setEditWhatsapp('');
    setEditArtePath(null);
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
        background_storage_path: editArtePath,
        whatsapp: normalizarWhatsapp(editWhatsapp),
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
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-[#f7f1e6] p-5 shadow-2xl border border-[#d9c9a8]">
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
              <input
                value={editWhatsapp}
                onChange={(e) => setEditWhatsapp(e.target.value)}
                inputMode="tel"
                placeholder="WhatsApp do anunciante (ex: 77 98872-0718)"
                className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none bg-white"
              />

              <GeradorIA
                nome={editNome}
                onEscolherTexto={setEditFrase}
                onArteGerada={setEditArtePath}
                artePathAtual={editArtePath}
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
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            inputMode="tel"
            placeholder="WhatsApp do anunciante (ex: 77 98872-0718)"
            className="rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />
          <p className="-mt-1.5 text-[10px] text-[#a0937a]">
            Com o WhatsApp preenchido, o ouvinte toca no anúncio e cai direto na conversa
            com o anunciante.
          </p>

          <GeradorIA
            nome={nome}
            onEscolherTexto={setFrase}
            onArteGerada={setArtePath}
            artePathAtual={artePath}
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
                      {logoUrl ? '🖼️ Com Logotipo' : '⚠️ Sem Logo'}
                      {s.background_storage_path ? ' · ✨ Com arte' : ''}
                      {s.whatsapp ? ' · 💬 Com WhatsApp' : ''}
                      {' · '}A cada {s.display_every_n_tracks} louvores
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
