'use client';

// Página que o convidado abre a partir do link no celular
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';

type GuestInfo = { id: string; name: string; status: string };

const STREAM_URL = process.env.NEXT_PUBLIC_ICECAST_STREAM_URL || 'http://localhost:8000/radio';

export default function ConvidadoPage() {
  const { token } = useParams<{ token: string }>();
  const supabase = createClient();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [guest, setGuest] = useState<GuestInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ouvindo, setOuvindo] = useState(false);
  const { status, erro, iniciar, parar, nivelMic, tentativaReconexao } =
    useAudioBroadcast('guest');

  useEffect(() => {
    supabase
      .rpc('get_guest_by_token', { p_token: token })
      .then(({ data }) => {
        const info = Array.isArray(data) ? data[0] : data;
        setGuest(info ?? null);
        setCarregando(false);
      });
  }, [token, supabase]);

  function alternarOuvir() {
    const audio = audioRef.current;
    if (!audio) return;
    if (ouvindo) {
      audio.pause();
    } else {
      audio.play();
    }
    setOuvindo(!ouvindo);
  }

  function entrarAoVivo() {
    iniciar(token);
  }

  if (carregando) {
    return <TelaCentralizada>Carregando seu convite...</TelaCentralizada>;
  }

  if (!guest || guest.status === 'encerrado') {
    return (
      <TelaCentralizada>
        Este link de convite não está mais ativo. Peça um novo link ao pastor.
      </TelaCentralizada>
    );
  }

  const aoVivo = status === 'ao_vivo';
  const reconectando = status === 'reconectando';
  // Reconectando ainda é estar em transmissão: o convidado precisa poder
  // desistir e sair sem esperar a reconexão terminar.
  const emTransmissao = aoVivo || reconectando;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f7f1e6] px-4 py-8 text-center text-[#2b2118]">
      <audio ref={audioRef} src={STREAM_URL} preload="none" />

      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[#2b2118] text-xl text-white shadow-md">
          🎙️
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
          Entrevista ao Vivo · Rádio Graça &amp; Paz
        </p>
        <h1 className="text-2xl font-black text-[#2b2118]">{guest.name}</h1>
      </div>

      {/* Ouvir a Rádio Antes */}
      <button
        onClick={alternarOuvir}
        className="rounded-2xl border border-[#d9c9a8] bg-white px-4 py-2.5 text-xs font-bold text-[#2b2118] shadow-xs transition active:scale-95"
      >
        {ouvindo ? '⏸ Pausar Áudio da Rádio' : '▶ Ouvir a Rádio Enquanto Aguarda'}
      </button>

      {/* Card do Microfone do Convidado */}
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-md">
        <p
          className={`mb-4 text-xs font-bold ${
            reconectando ? 'text-[#8a6d3b]' : 'text-[#7a6a52]'
          }`}
        >
          {aoVivo
            ? '🔴 VOCÊ ESTÁ AO VIVO COM O PASTOR!'
            : reconectando
              ? `A conexão oscilou. Reconectando${
                  tentativaReconexao > 1 ? ` (${tentativaReconexao}ª tentativa)` : ''
                }... pode continuar aí, não precisa fazer nada.`
              : 'Quando o pastor chamar, toque no botão para falar:'}
        </p>
        <button
          onClick={emTransmissao ? parar : entrarAoVivo}
          disabled={status === 'pedindo_microfone' || status === 'conectando'}
          className={`mx-auto flex h-36 w-36 flex-col items-center justify-center rounded-full text-sm font-extrabold text-white shadow-xl transition active:scale-95 disabled:opacity-60 ${
            aoVivo
              ? 'animate-pulse bg-[#b3261e] ring-8 ring-[#b3261e]/20'
              : reconectando
                ? 'animate-pulse bg-[#8a6d3b] ring-8 ring-[#8a6d3b]/20'
                : 'bg-[#2f6b4f] ring-8 ring-[#2f6b4f]/15'
          }`}
        >
          <span className="text-3xl">{emTransmissao ? '🛑' : '🎙️'}</span>
          <span className="mt-1">{emTransmissao ? 'Sair do Ar' : 'Entrar ao Vivo'}</span>
        </button>

        {aoVivo && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <div className="flex items-end justify-center gap-1.5" style={{ height: 26 }}>
              {[0.1, 0.24, 0.4, 0.58, 0.78].map((limite, i) => {
                const aceso = nivelMic >= limite;
                const cor = i < 3 ? '#2f6b4f' : i === 3 ? '#8a6d3b' : '#b3261e';
                return (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 10 + i * 4,
                      borderRadius: 3,
                      backgroundColor: aceso ? cor : '#e4d6be',
                      transition: 'background-color 80ms linear',
                    }}
                  />
                );
              })}
            </div>
            <span className="text-[10px] font-semibold text-[#7a6a52]">
              🎤 Captando áudio do microfone
            </span>
          </div>
        )}

        {erro && (
          <p className="mt-4 rounded-xl bg-[#fbeaea] p-2.5 text-xs font-semibold text-[#b3261e]">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}

function TelaCentralizada({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f1e6] px-6 text-center text-[#2b2118]">
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

