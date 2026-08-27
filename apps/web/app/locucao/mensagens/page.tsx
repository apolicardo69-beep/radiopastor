'use client';

// Histórico de mensagens dos ouvintes — texto e áudio — com destaque pros
// pedidos de música (que o pastor pode marcar como atendido).
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

  // resolve a URL pública de cada mensagem de áudio sob demanda
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
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          onClick={() => setFiltro('todas')}
          className={`rounded-lg px-3 py-1.5 text-sm ${filtro === 'todas' ? 'bg-[#2b2118] text-[#f7f1e6]' : 'bg-white'}`}
        >
          Todas
        </button>
        <button
          onClick={() => setFiltro('pedidos')}
          className={`rounded-lg px-3 py-1.5 text-sm ${filtro === 'pedidos' ? 'bg-[#2b2118] text-[#f7f1e6]' : 'bg-white'}`}
        >
          Pedidos de música
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {visiveis.map((m) => (
          <li key={m.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold">
                {m.author_name}
                {m.is_guest && (
                  <span className="ml-2 rounded bg-[#8a6d3b] px-1.5 py-0.5 text-[10px] text-white">
                    CONVIDADO
                  </span>
                )}
                {m.type === 'pedido' && (
                  <span className="ml-2 rounded bg-[#c98a2c] px-1.5 py-0.5 text-[10px] text-white">
                    PEDIDO
                  </span>
                )}
              </span>
              <span className="text-xs text-[#a0937a]">
                {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {m.kind === 'audio' ? (
              <audio
                controls
                onPlay={() => obterUrlAudio(m)}
                src={urlsAudio[m.id]}
                onCanPlay={() => !urlsAudio[m.id] && obterUrlAudio(m)}
                className="w-full"
              />
            ) : (
              <p className="text-sm">{m.content}</p>
            )}

            {m.type === 'pedido' && (
              <button
                onClick={() => marcarAtendido(m)}
                className={`mt-2 rounded-lg px-3 py-1 text-xs font-medium ${
                  m.fulfilled ? 'bg-[#eaf3ec] text-[#2f6b4f]' : 'bg-[#f0e6d2] text-[#7a6a52]'
                }`}
              >
                {m.fulfilled ? '✓ Atendido' : 'Marcar como atendido'}
              </button>
            )}
          </li>
        ))}
        {visiveis.length === 0 && <p className="text-sm text-[#a0937a]">Nenhuma mensagem por aqui ainda.</p>}
      </ul>
    </div>
  );
}
