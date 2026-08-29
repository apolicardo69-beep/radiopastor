'use client';

// Card da "Palavra do Pastor" — fica fixado no topo do bate-papo, no app do
// OUVINTE. Some sozinho quando o pastor desliga o interruptor no Estúdio.
//
// É de propósito autossuficiente: busca os próprios dados e escuta as
// próprias mudanças, então integrar é só colocar <MensagemDoDia /> como
// primeiro filho do bloco de bate-papo, sem passar nenhuma prop nem mexer
// no estado da página que já existe.
//
// Enquanto não há mensagem ativa (ou o texto está vazio), o componente não
// renderiza NADA — o bate-papo fica exatamente como é hoje.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DailyMessage } from '@/lib/types';

function formatarQuando(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia =
    data.getDate() === hoje.getDate() &&
    data.getMonth() === hoje.getMonth() &&
    data.getFullYear() === hoje.getFullYear();

  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia) return `hoje às ${hora}`;

  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} às ${hora}`;
}

export default function MensagemDoDia() {
  const [mensagem, setMensagem] = useState<DailyMessage | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    async function carregar() {
      const { data } = await supabase
        .from('daily_message')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (ativo) setMensagem((data as DailyMessage) ?? null);
    }
    carregar();

    // Realtime: o pastor salva no Estúdio e o card aparece/atualiza/some
    // aqui na hora, sem o ouvinte recarregar nada.
    const canal = supabase
      .channel('daily_message_ouvinte')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_message' },
        (payload) => {
          if (ativo) setMensagem((payload.new as DailyMessage) ?? null);
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  const texto = mensagem?.content?.trim() ?? '';
  if (!mensagem?.active || !texto) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-[#d4af37]/70 bg-gradient-to-br from-[#2b2118] via-[#241b18] to-[#2b2118] shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-[#d4af37]/25 bg-black/20 px-3.5 py-2">
        <span aria-hidden="true" className="text-[11px]">
          📌
        </span>
        <span className="text-[10px] font-black uppercase tracking-wider text-[#d4af37]">
          Palavra do Pastor
        </span>
      </div>

      <div className="px-3.5 py-3">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#f3e5c8]">
          {texto}
        </p>
        <p className="mt-2 text-[10px] text-[#d9c9a8]/70">
          {mensagem.author_name ? `${mensagem.author_name} · ` : ''}
          {formatarQuando(mensagem.updated_at)}
        </p>
      </div>
    </div>
  );
}
