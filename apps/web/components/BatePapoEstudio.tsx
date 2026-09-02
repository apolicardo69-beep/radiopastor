'use client';

// Painel de bate-papo ao vivo dentro da tela do Estúdio.
//
// Por que ele existe: durante o culto o pastor está nesta tela, com o dedo no
// botão de transmitir. Se uma mensagem ofensiva aparecer, ele precisa
// removê-la sem sair daqui. Mandá-lo trocar de aba pra moderar é justamente o
// que ele não vai fazer no meio de uma pregação.
//
// A lista mostra TUDO, inclusive o que já foi ocultado — a equipe precisa
// enxergar o que removeu, e é isso que a RLS permite: `hidden = false OR
// is_staff()`. O ouvinte só recebe as visíveis.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { carregarSilenciados } from '@/lib/moderacao';
import ModeracaoMensagem from './ModeracaoMensagem';
import type { Message } from '@/lib/types';

const QUANTIDADE = 30;

export default function BatePapoEstudio() {
  const supabase = createClient();
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [silenciados, setSilenciados] = useState<Record<string, string>>({});
  const [recolhido, setRecolhido] = useState(false);

  async function recarregarSilenciados() {
    setSilenciados(await carregarSilenciados(supabase));
  }

  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(QUANTIDADE)
      .then(({ data }) => data && setMensagens(data.reverse()));

    // Carrega a lista de silenciados. O aviso do lint aqui é o mesmo padrão já
    // usado nas outras telas: a função é assíncrona, então o estado só muda
    // depois da resposta do banco, não durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregarSilenciados();

    const canal = supabase
      .channel('estudio-bate-papo')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const nova = payload.new as Message;
          setMensagens((atual) => {
            if (atual.some((m) => m.id === nova.id)) return atual;
            return [...atual, nova].slice(-QUANTIDADE);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const att = payload.new as Message;
          setMensagens((atual) => atual.map((m) => (m.id === att.id ? att : m)));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'muted_listeners' },
        () => recarregarSilenciados()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocultas = mensagens.filter((m) => m.hidden).length;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-extrabold text-[#2b2118]">💬 Bate-papo ao vivo</h2>
          {ocultas > 0 && (
            <span className="rounded-md bg-[#b3261e]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#b3261e]">
              {ocultas} oculta{ocultas > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => setRecolhido((r) => !r)}
          className="rounded-xl bg-[#f0e6d2] px-3 py-1.5 text-[11px] font-bold text-[#5c4a35] transition hover:bg-[#e4d6be] active:scale-95"
        >
          {recolhido ? 'Mostrar' : 'Recolher'}
        </button>
      </div>

      {!recolhido && (
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {mensagens.map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl border p-2.5 transition ${
                m.hidden
                  ? 'border-[#b3261e]/25 bg-[#fbeaea]/50'
                  : 'border-[#d9c9a8]/50 bg-[#f7f1e6]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#2b2118]">{m.author_name}</span>
                <span className="shrink-0 text-[10px] text-[#a0937a]">
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {m.kind === 'audio' ? (
                <p className="text-[11px] italic text-[#7a6a52]">🎙️ Áudio do ouvinte</p>
              ) : (
                <p
                  className={`text-[11px] leading-relaxed ${
                    m.hidden ? 'text-[#a0937a] line-through' : 'text-[#2b2118]'
                  }`}
                >
                  {m.content}
                </p>
              )}

              <div className="mt-1.5">
                <ModeracaoMensagem
                  mensagem={m}
                  silenciadoAte={silenciados[m.client_id]}
                  onMudou={recarregarSilenciados}
                  compacto
                />
              </div>
            </li>
          ))}

          {mensagens.length === 0 && (
            <p className="py-6 text-center text-[11px] text-[#a0937a]">
              Nenhuma mensagem ainda.
            </p>
          )}
        </ul>
      )}
    </section>
  );
}
