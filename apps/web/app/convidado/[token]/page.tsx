'use client';

// Página que o convidado abre a partir do link que o pastor manda (sem
// precisar de conta). Aqui ele confirma quem é, ouve a rádio enquanto
// espera, e quando o pastor chama, aperta um botão pra entrar ao vivo com o
// próprio microfone do celular.
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
  const { status, erro, iniciar, parar } = useAudioBroadcast('guest');

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f7f1e6] px-4 text-center text-[#2b2118]">
      <audio ref={audioRef} src={STREAM_URL} preload="none" />

      <div>
        <p className="text-sm text-[#7a6a52]">Bem-vindo(a) à Rádio Graça &amp; Paz</p>
        <h1 className="text-2xl font-bold">{guest.name}</h1>
      </div>

      <button
        onClick={alternarOuvir}
        className="rounded-lg border border-[#d9c9a8] bg-white px-4 py-2 text-sm font-medium"
      >
        {ouvindo ? '⏸ Parar de ouvir' : '▶ Ouvir a rádio enquanto espera'}
      </button>

      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-sm">
        <p className="mb-4 text-sm font-medium text-[#7a6a52]">
          {aoVivo
            ? 'Você está AO VIVO com o pastor'
            : 'Quando o pastor chamar, aperte para entrar ao vivo'}
        </p>
        <button
          onClick={aoVivo ? parar : entrarAoVivo}
          disabled={status === 'pedindo_microfone' || status === 'conectando'}
          className={`mx-auto flex h-32 w-32 items-center justify-center rounded-full text-base font-bold text-white shadow-lg disabled:opacity-60 ${
            aoVivo ? 'bg-[#b3261e]' : 'bg-[#2f6b4f]'
          }`}
        >
          {aoVivo ? 'Sair' : 'Entrar ao vivo'}
        </button>
        {erro && <p className="mt-3 text-sm text-[#b3261e]">{erro}</p>}
      </div>
    </div>
  );
}

function TelaCentralizada({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f1e6] px-6 text-center text-[#2b2118]">
      <p>{children}</p>
    </div>
  );
}
