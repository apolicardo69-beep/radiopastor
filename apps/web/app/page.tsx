'use client';

// Tela do ouvinte: player ao vivo, chat em tempo real e a "arte do
// patrocinador" que aparece na tela quando uma música toca (pedido do
// pastor). Cliente porque depende de áudio no navegador + Supabase Realtime.

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BroadcastState, Message, Sponsor } from '@/lib/types';

const STREAM_URL = process.env.NEXT_PUBLIC_ICECAST_STREAM_URL || 'http://localhost:8000/radio';

function getClientId() {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('graca_paz_client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('graca_paz_client_id', id);
  }
  return id;
}

export default function ListenerPage() {
  const supabase = createClient();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [playing, setPlaying] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('Ouvinte');
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [gravando, setGravando] = useState(false);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [urlsAudio, setUrlsAudio] = useState<Record<string, string>>({});

  const sponsorsRef = useRef<Sponsor[]>([]);
  const trackCountRef = useRef(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);

  useEffect(() => {
    (async () => {
      const { data: bs } = await supabase.from('broadcast_state').select('*').eq('id', 1).single();
      if (bs) setBroadcast(bs);
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
      if (msgs) setMessages(msgs);
      const { data: sponsors } = await supabase.from('sponsors').select('*').eq('active', true);
      if (sponsors) sponsorsRef.current = sponsors;
    })();

    const channel = supabase
      .channel('publico')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcast_state' },
        (payload) => {
          const novo = payload.new as BroadcastState;
          setBroadcast((antigo) => {
            // troca de música -> conta pra decidir se mostra patrocinador
            if (antigo?.now_playing_track_id !== novo.now_playing_track_id) {
              trackCountRef.current += 1;
              const candidatos = sponsorsRef.current;
              if (candidatos.length > 0) {
                // aproximação simples: usa o intervalo do primeiro patrocinador
                // ativo. Pra rodízio "justo" entre vários patrocinadores vale
                // a pena depois mover essa lógica pro playlist-sync, que já
                // sabe exatamente qual música está tocando.
                const intervalo = candidatos[0].display_every_n_tracks || 3;
                if (trackCountRef.current % intervalo === 0) {
                  const escolhido =
                    candidatos[(trackCountRef.current / intervalo) % candidatos.length];
                  setSponsor(escolhido);
                  setTimeout(() => setSponsor(null), 8000);
                }
              }
            }
            return novo;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => setMessages((atual) => [...atual, payload.new as Message])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  async function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = text.trim();
    if (!conteudo) return;
    setText('');
    await supabase.from('messages').insert({
      author_name: name.trim() || 'Ouvinte',
      kind: 'texto',
      content: conteudo,
      type: 'chat',
      is_guest: false,
      client_id: getClientId(),
    });
  }

  async function alternarGravacao() {
    if (gravando) {
      gravadorRef.current?.stop();
      setGravando(false);
      return;
    }
    setErroAudio(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErroAudio('Não consegui acessar o microfone. Verifique a permissão do navegador.');
      return;
    }
    pedacosRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(pedacosRef.current, { type: 'audio/webm' });
      setEnviandoAudio(true);
      try {
        const caminho = `${getClientId()}-${Date.now()}.webm`;
        const { error: erroUpload } = await supabase.storage
          .from('mensagens-audio')
          .upload(caminho, blob);
        if (erroUpload) throw erroUpload;
        const { error: erroInsert } = await supabase.from('messages').insert({
          author_name: name.trim() || 'Ouvinte',
          kind: 'audio',
          audio_storage_path: caminho,
          type: 'chat',
          is_guest: false,
          client_id: getClientId(),
        });
        if (erroInsert) throw erroInsert;
      } catch {
        setErroAudio('Não consegui enviar sua mensagem de áudio. Tente de novo.');
      } finally {
        setEnviandoAudio(false);
      }
    };
    recorder.start();
    gravadorRef.current = recorder;
    setGravando(true);
  }

  function urlAudio(m: Message) {
    if (!m.audio_storage_path) return undefined;
    if (urlsAudio[m.id]) return urlsAudio[m.id];
    const { data } = supabase.storage.from('mensagens-audio').getPublicUrl(m.audio_storage_path);
    setUrlsAudio((atual) => ({ ...atual, [m.id]: data.publicUrl }));
    return data.publicUrl;
  }

  return (
    <div className="min-h-screen bg-[#f7f1e6] text-[#2b2118]">
      <audio ref={audioRef} src={STREAM_URL} preload="none" />

      {sponsor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-sm rounded-2xl bg-[#f7f1e6] p-8 text-center shadow-2xl">
            <p className="mb-2 text-xs uppercase tracking-widest text-[#8a6d3b]">
              Este momento é patrocinado por
            </p>
            <h2 className="mb-1 text-2xl font-bold">{sponsor.name}</h2>
            {sponsor.tagline && <p className="text-[#5c4a35]">{sponsor.tagline}</p>}
          </div>
        </div>
      )}

      <header className="border-b border-[#d9c9a8] px-6 py-5">
        <h1 className="text-xl font-bold">Rádio Graça &amp; Paz</h1>
        <p className="text-sm text-[#7a6a52]">
          {broadcast?.is_live ? (
            <span className="inline-flex items-center gap-2 text-[#b3261e]">
              <span className="h-2 w-2 rounded-full bg-[#b3261e]" /> AO VIVO
              {broadcast.pastor_name ? ` — ${broadcast.pastor_name}` : ''}
              {broadcast.guest_live ? ' + convidado' : ''}
            </span>
          ) : (
            'Tocando a playlist'
          )}
        </p>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <button
          onClick={togglePlay}
          className="w-full rounded-xl bg-[#2b2118] py-4 text-lg font-semibold text-[#f7f1e6] transition hover:bg-[#43362a]"
        >
          {playing ? '⏸ Pausar' : '▶ Ouvir agora'}
        </button>

        <section className="rounded-xl border border-[#d9c9a8] bg-white/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#7a6a52]">
            Bate-papo
          </h2>
          <div className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg bg-[#f0e6d2] px-3 py-2 text-sm">
                <span className="font-semibold">{m.author_name}</span>
                {m.is_guest && (
                  <span className="ml-1 rounded bg-[#8a6d3b] px-1.5 py-0.5 text-[10px] text-white">
                    CONVIDADO
                  </span>
                )}
                {m.kind === 'audio' ? (
                  <audio controls src={urlAudio(m)} className="mt-1 h-8 w-full" />
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-sm text-[#a0937a]">Seja o primeiro a mandar uma mensagem.</p>
            )}
          </div>
          {erroAudio && <p className="mb-2 text-xs text-[#b3261e]">{erroAudio}</p>}
          <form onSubmit={enviarMensagem} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-24 rounded-lg border border-[#d9c9a8] bg-white px-2 py-2 text-sm"
            />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva uma mensagem..."
              className="flex-1 rounded-lg border border-[#d9c9a8] bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={alternarGravacao}
              disabled={enviandoAudio}
              title={gravando ? 'Parar gravação' : 'Gravar mensagem de áudio'}
              className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                gravando ? 'bg-[#b3261e] text-white' : 'bg-[#f0e6d2] text-[#5c4a35]'
              }`}
            >
              {gravando ? '⏺' : '🎤'}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#2b2118] px-4 py-2 text-sm font-semibold text-[#f7f1e6]"
            >
              Enviar
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
