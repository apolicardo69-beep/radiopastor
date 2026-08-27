'use client';

// Histórico de mensagens dos ouvintes com filtros e moderação
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

export default function MensagensPage() {
  const supabase = createClient();
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [urlsAudio, setUrlsAudio] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<'todas' | 'pedidos'>('todas');

  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => data && setMensagens(data));

    const channel = supabase
      .channel('locucao-mensagens')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => setMensagens((atual) => [payload.new as Message, ...atual])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) =>
          setMensagens((atual) =>
            atual.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
          )
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function obterUrlAudio(m: Message) {
    if (!m.audio_storage_path || urlsAudio[m.id]) return;
    const { data } = supabase.storage.from('mensagens-audio').getPublicUrl(m.audio_storage_path);
    setUrlsAudio((atual) => ({ ...atual, [m.id]: data.publicUrl }));
  }

  async function marcarAtendido(m: Message) {
    await supabase.from('messages').update({ fulfilled: !m.fulfilled }).eq('id', m.id);
  }

  const visiveis = filtro === 'pedidos' ? mensagens.filter((m) => m.type === 'pedido') : mensagens;

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Filtros em abas tipo pílula */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltro('todas')}
          className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition active:scale-95 shadow-xs ${
            filtro === 'todas'
              ? 'bg-[#2b2118] text-[#f7f1e6]'
              : 'bg-white text-[#5c4a35] hover:bg-[#f0e6d2]'
          }`}
        >
          💬 Todas ({mensagens.length})
        </button>
        <button
          onClick={() => setFiltro('pedidos')}
          className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition active:scale-95 shadow-xs ${
            filtro === 'pedidos'
              ? 'bg-[#2b2118] text-[#f7f1e6]'
              : 'bg-white text-[#5c4a35] hover:bg-[#f0e6d2]'
          }`}
        >
          🎵 Pedidos de Louvor
        </button>
      </div>

      <ul className="flex flex-col gap-2.5">
        {visiveis.map((m) => (
          <li key={m.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#2b2118]">{m.author_name}</span>
                {m.is_guest && (
                  <span className="rounded-md bg-[#8a6d3b] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    CONVIDADO
                  </span>
                )}
                {m.type === 'pedido' && (
                  <span className="rounded-md bg-[#c98a2c] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    PEDIDO
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#a0937a]">
                {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {m.kind === 'audio' ? (
              <audio
                controls
                onPlay={() => obterUrlAudio(m)}
                src={urlsAudio[m.id]}
                onCanPlay={() => !urlsAudio[m.id] && obterUrlAudio(m)}
                className="mt-1 h-8 w-full"
              />
            ) : (
              <p className="text-xs leading-relaxed text-[#2b2118]">{m.content}</p>
            )}

            {m.type === 'pedido' && (
              <button
                onClick={() => marcarAtendido(m)}
                className={`mt-2.5 flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                  m.fulfilled
                    ? 'bg-[#eaf3ec] text-[#2f6b4f]'
                    : 'bg-[#f0e6d2] text-[#5c4a35] hover:bg-[#e4d6be]'
                }`}
              >
                {m.fulfilled ? '✓ Pedido Atendido' : 'Marcar como Atendido'}
              </button>
            )}
          </li>
        ))}
        {visiveis.length === 0 && (
          <p className="py-12 text-center text-xs text-[#a0937a]">
            Nenhuma mensagem recebida ainda.
          </p>
        )}
      </ul>
    </div>
  );
}

