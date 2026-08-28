'use client';

// Criar e acompanhar convites de entrevista ao vivo
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Guest } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  pendente: 'Aguardando convidado abrir link',
  conectado: 'Conectado (pronto)',
  ao_vivo: '🔴 Ao vivo agora',
  encerrado: 'Encerrado',
};

const COR_STATUS: Record<string, string> = {
  pendente: 'bg-[#f0e6d2] text-[#7a6a52]',
  conectado: 'bg-[#eaf3ec] text-[#2f6b4f]',
  ao_vivo: 'bg-[#fbeaea] text-[#b3261e]',
  encerrado: 'bg-[#e8e8e8] text-[#7a7a7a]',
};

export default function ConvidadosPage() {
  const supabase = createClient();
  const [convidados, setConvidados] = useState<Guest[]>([]);
  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  async function carregar() {
    const { data } = await supabase.from('guests').select('*').order('created_at', { ascending: false });
    if (data) setConvidados(data);
  }

  useEffect(() => {
    (async () => {
      await carregar();
    })();
    const channel = supabase
      .channel('locucao-convidados')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criarConvite(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setCriando(true);
    await supabase.from('guests').insert({ name: nome.trim() });
    setNome('');
    setCriando(false);
  }

  function linkDoConvite(g: Guest) {
    return `${window.location.origin}/convidado/${g.invite_token}`;
  }

  async function copiarLink(g: Guest) {
    await navigator.clipboard.writeText(linkDoConvite(g));
    setLinkCopiado(g.id);
    setTimeout(() => setLinkCopiado(null), 2500);
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Gerar Link do Convidado */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          👤 Convidar para Entrevista
        </h2>
        <p className="mb-3 text-[11px] text-[#7a6a52]">
          Gera um link exclusivo para o convidado entrar ao vivo com o microfone do celular.
        </p>
        <form onSubmit={criarConvite} className="flex gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do convidado (ex: Pastor Lucas)"
            className="flex-1 rounded-xl border border-[#d9c9a8] px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
          />
          <button
            type="submit"
            disabled={criando || !nome.trim()}
            className="rounded-xl bg-[#2b2118] px-4 py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm disabled:opacity-50 transition active:scale-95"
          >
            {criando ? 'Gerando...' : 'Criar Link'}
          </button>
        </form>
      </section>

      {/* Lista de Convites */}
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          Convites Gerados ({convidados.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {convidados.map((g) => (
            <li key={g.id} className="rounded-2xl bg-[#f0e6d2]/70 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[#2b2118]">{g.name}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${COR_STATUS[g.status]}`}>
                  {TEXTO_STATUS[g.status]}
                </span>
              </div>
              <button
                onClick={() => copiarLink(g)}
                className={`w-full rounded-xl py-2 text-center text-xs font-bold transition active:scale-95 shadow-xs ${
                  linkCopiado === g.id
                    ? 'bg-[#2f6b4f] text-white'
                    : 'bg-white text-[#2b2118] hover:bg-[#f7f1e6]'
                }`}
              >
                {linkCopiado === g.id ? '✓ Link Copiado para o WhatsApp!' : '📋 Copiar Link do Convidado'}
              </button>
            </li>
          ))}
          {convidados.length === 0 && (
            <p className="py-6 text-center text-xs text-[#a0937a]">
              Nenhum convite criado ainda. Digite o nome acima para gerar o primeiro!
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}

