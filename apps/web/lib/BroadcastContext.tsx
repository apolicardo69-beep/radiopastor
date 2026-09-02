'use client';

// Mantém a transmissão viva enquanto o locutor navega pelo Estúdio.
//
// ---------------------------------------------------------------------------
// O PROBLEMA QUE ISTO RESOLVE
// ---------------------------------------------------------------------------
// O useAudioBroadcast morava dentro da página inicial do Estúdio. Como o
// Next desmonta a página ao trocar de aba (Músicas, Patrocinadores...), a
// limpeza do hook rodava e derrubava tudo: microfone, transmissão e — pior —
// o AudioContext por onde a música passa. Resultado: bastava o locutor abrir
// a aba de Músicas pra a música parar e ele sair do ar, sem nenhum aviso.
//
// Agora o hook vive aqui, e este provider fica no LAYOUT da área protegida.
// O layout não desmonta ao trocar de aba, então a transmissão e a música
// atravessam a navegação inteiras.
//
// O elemento <audio> das vinhetas também mora aqui pelo mesmo motivo: ele
// entra na mixagem por createMediaElementSource, que só pode ser chamado uma
// vez por elemento. Se ele fosse recriado a cada troca de aba, a cartucheira
// ficaria muda a partir da segunda visita à tela.

import { createContext, useContext, useRef } from 'react';
import { useAudioBroadcast } from './useAudioBroadcast';

type ValorBroadcast = ReturnType<typeof useAudioBroadcast> & {
  audioVinhetaRef: React.RefObject<HTMLAudioElement | null>;
};

const BroadcastContext = createContext<ValorBroadcast | null>(null);

export function useBroadcast() {
  const ctx = useContext(BroadcastContext);
  if (!ctx) throw new Error('useBroadcast precisa estar dentro de <BroadcastProvider>');
  return ctx;
}

export function BroadcastProvider({ children }: { children: React.ReactNode }) {
  const broadcast = useAudioBroadcast('pastor');
  const audioVinhetaRef = useRef<HTMLAudioElement | null>(null);

  return (
    <BroadcastContext.Provider value={{ ...broadcast, audioVinhetaRef }}>
      {/* Elemento das vinheta: fica aqui pra sobreviver à troca de abas.
          Quem controla o que toca é a tela do Estúdio, pelo ref. */}
      <audio ref={audioVinhetaRef} className="hidden" />
      {children}
    </BroadcastContext.Provider>
  );
}
