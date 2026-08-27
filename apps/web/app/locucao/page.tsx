'use client';

// Tela principal da locução: o único botão que realmente importa no dia a
// dia do pastor. Foi pensada pra caber tudo que ele precisa ver sem trocar
// de tela: se está no ar, se o convidado está conectado, e o botão gigante
// de ir/sair do ar.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';
import type { BroadcastState } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  parado: 'Fora do ar',
  pedindo_microfone: 'Pedindo acesso ao microfone...',
  conectando: 'Conectando...',
  ao_vivo: 'Você está AO VIVO',
  erro: 'Não foi possível ir ao ar',
};

export default function LocucaoHome() {
  const supabase = createClient();
  const { status, erro, iniciar, parar } = useAudioBroadcast('pastor');
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);

  useEffect(() => {
    supabase
      .from('broadcast_state')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setBroadcast(data));

    const channel = supabase
      .channel('locucao-home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcast_state' },
        (payload) => setBroadcast(payload.new as BroadcastState)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarAoVivo() {
    if (status === 'ao_vivo') {
      parar();
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    iniciar(session.access_token);
  }

  const noAr = status === 'ao_vivo';
  const ocupado = status === 'pedindo_microfone' || status === 'conectando';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="mb-4 text-sm font-medium uppercase tracking-wide text-[#7a6a52]">
          {TEXTO_STATUS[status]}
        </p>

        <button
          onClick={alternarAoVivo}
          disabled={ocupado}
          className={`mx-auto flex h-40 w-40 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg transition disabled:opacity-60 ${
            noAr ? 'bg-[#b3261e]' : 'bg-[#2f6b4f]'
          }`}
        >
          {noAr ? 'Sair do ar' : 'Ir ao ar'}
        </button>

        {erro && (
          <p className="mt-4 rounded-lg bg-[#fbeaea] px-3 py-2 text-sm text-[#b3261e]">{erro}</p>
        )}

        {broadcast?.guest_live && (
          <p className="mt-4 rounded-lg bg-[#eaf3ec] px-3 py-2 text-sm text-[#2f6b4f]">
            Convidado conectado ao vivo com você.
          </p>
        )}
      </section>

      <p className="text-center text-sm text-[#7a6a52]">
        Quando você não está ao vivo, os ouvintes escutam a playlist de músicas
        automaticamente — não precisa fazer nada pra isso acontecer.
      </p>
    </div>
  );
}
