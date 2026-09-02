'use client';

// Os botões de moderação de uma mensagem. Usados nos dois lugares: no painel
// de bate-papo da tela do Estúdio e na aba Mensagens.
//
// Não tem janela de confirmação em lugar nenhum, de propósito. Ocultar é
// reversível — o botão de desfazer aparece na mesma hora, no mesmo lugar —
// então uma confirmação só atrasaria o pastor no meio do culto, que é
// justamente quando ele precisa ser rápido. Silenciar também sai com um
// clique, e o "Liberar" fica ali do lado.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ocultarMensagem,
  mostrarMensagem,
  silenciarOuvinte,
  liberarOuvinte,
  DURACOES_SILENCIO,
  textoRestante,
} from '@/lib/moderacao';
import type { Message } from '@/lib/types';

export default function ModeracaoMensagem({
  mensagem,
  silenciadoAte,
  onMudou,
  compacto = false,
}: {
  mensagem: Message;
  silenciadoAte?: string;
  onMudou: () => void;
  compacto?: boolean;
}) {
  const supabase = createClient();
  const [ocupado, setOcupado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: () => Promise<{ erro?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await acao();
    setOcupado(false);
    setMenuAberto(false);
    if (r.erro) setErro(r.erro);
    else onMudou();
  }

  const alturaBotao = compacto ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]';

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {mensagem.hidden ? (
        <>
          <span className="rounded-md bg-[#b3261e]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#b3261e]">
            OCULTA
          </span>
          <button
            disabled={ocupado}
            onClick={() => executar(() => mostrarMensagem(supabase, mensagem.id))}
            className={`rounded-lg bg-[#f0e6d2] font-bold text-[#5c4a35] transition hover:bg-[#e4d6be] active:scale-95 disabled:opacity-50 ${alturaBotao}`}
          >
            ↩ Desfazer
          </button>
        </>
      ) : (
        <button
          disabled={ocupado}
          onClick={() => executar(() => ocultarMensagem(supabase, mensagem.id))}
          className={`rounded-lg bg-[#fbeaea] font-bold text-[#b3261e] transition hover:bg-[#f5d9d9] active:scale-95 disabled:opacity-50 ${alturaBotao}`}
        >
          🚫 Ocultar
        </button>
      )}

      {silenciadoAte ? (
        <button
          disabled={ocupado}
          onClick={() => executar(() => liberarOuvinte(supabase, mensagem.client_id))}
          className={`rounded-lg bg-[#f7efdd] font-bold text-[#8a6d3b] transition hover:bg-[#f0e4c8] active:scale-95 disabled:opacity-50 ${alturaBotao}`}
          title={`Silenciado — ${textoRestante(silenciadoAte)}`}
        >
          🔇 Liberar ({textoRestante(silenciadoAte)})
        </button>
      ) : (
        <button
          disabled={ocupado}
          onClick={() => setMenuAberto((a) => !a)}
          className={`rounded-lg bg-[#f0e6d2] font-bold text-[#5c4a35] transition hover:bg-[#e4d6be] active:scale-95 disabled:opacity-50 ${alturaBotao}`}
        >
          🔇 Silenciar
        </button>
      )}

      {menuAberto && (
        <>
          {/* Clicar fora fecha. Sem isto o menu fica preso aberto no celular. */}
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Fechar"
            onClick={() => setMenuAberto(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-[#d9c9a8] bg-white shadow-lg">
            <p className="border-b border-[#d9c9a8]/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#a0937a]">
              Silenciar por
            </p>
            {DURACOES_SILENCIO.map((d) => (
              <button
                key={d.horas}
                disabled={ocupado}
                onClick={() =>
                  executar(() => silenciarOuvinte(supabase, mensagem.client_id, d.horas))
                }
                className="block w-full px-3 py-2 text-left text-[11px] font-semibold text-[#2b2118] transition hover:bg-[#f7f1e6] disabled:opacity-50"
              >
                {d.rotulo}
              </button>
            ))}
          </div>
        </>
      )}

      {erro && <span className="text-[10px] font-semibold text-[#b3261e]">{erro}</span>}
    </div>
  );
}
