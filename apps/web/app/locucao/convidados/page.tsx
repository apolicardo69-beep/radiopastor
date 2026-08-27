'use client';

// Criar e acompanhar convites de entrevista ao vivo. Cada convidado recebe
// um link único (com um token) — é só mandar por WhatsApp e a pessoa entra
// direto na hora combinada, sem precisar criar conta nem instalar nada.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Guest } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  pendente: 'Aguardando o convidado abrir o link',
  conectado: 'Convidado abriu o link',
  ao_vivo: 'Ao vivo agora',
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
    setTimeout(() => setLinkCopiado(null), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Convidar alguém para uma entrevista ao vivo</h2>
        <form onSubmit={criarConvite} className="flex gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do convidado"
            className="flex-1 rounded-lg border border-[#d9c9a8] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={criando}
            className="rounded-lg bg-[#2b2118] px-4 py-2 text-sm font-semibold text-[#f7f1e6] disabled:opacity-60"
          >
            Criar link
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Convites</h2>
        <ul className="flex flex-col gap-3">
          {convidados.map((g) => (
            <li key={g.id} className="rounded-lg bg-[#f0e6d2] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{g.name}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR_STATUS[g.status]}`}>
                  {TEXTO_STATUS[g.status]}
                </span>
              </div>
              <button
                onClick={() => copiarLink(g)}
                className="text-xs font-medium text-[#5c4a35] underline"
              >
                {linkCopiado === g.id ? 'Link copiado!' : 'Copiar link do convite'}
              </button>
            </li>
          ))}
          {convidados.length === 0 && (
            <p className="text-sm text-[#a0937a]">Nenhum convidado ainda.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
