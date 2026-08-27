'use client';

// Tela do ouvinte: player ao vivo, chat em tempo real e arte do patrocinador
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
  const [carregandoAudio, setCarregandoAudio] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('Ouvinte');
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [urlsAudio, setUrlsAudio] = useState<Record<string, string>>({});

  const sponsorsRef = useRef<Sponsor[]>([]);
  const trackCountRef = useRef(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const timerGravacaoRef = useRef<NodeJS.Timeout | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Carregar nome salvo no localStorage
    const savedName = localStorage.getItem('graca_paz_user_name');
    if (savedName) setName(savedName);

    (async () => {
      const { data: bs } = await supabase.from('broadcast_state').select('*').eq('id', 1).single();
      if (bs) setBroadcast(bs);
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
      if (msgs) {
        setMessages(msgs);
        setTimeout(scrollChatToEnd, 100);
      }
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
            if (antigo?.now_playing_track_id !== novo.now_playing_track_id) {
              trackCountRef.current += 1;
              const candidatos = sponsorsRef.current;
              if (candidatos.length > 0) {
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
        (payload) => {
          setMessages((atual) => [...atual, payload.new as Message]);
          setTimeout(scrollChatToEnd, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollChatToEnd() {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }

  function handleNameChange(novoNome: string) {
    setName(novoNome);
    localStorage.setItem('graca_paz_user_name', novoNome);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      setCarregandoAudio(false);
    } else {
      setCarregandoAudio(true);
      // Forçar recarga para pegar a ponta do stream ao vivo
      audio.src = `${STREAM_URL}?_t=${Date.now()}`;
      audio
        .play()
        .then(() => {
          setPlaying(true);
          setCarregandoAudio(false);
        })
        .catch(() => {
          setPlaying(false);
          setCarregandoAudio(false);
        });
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
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
      gravadorRef.current?.stop();
      setGravando(false);
      return;
    }
    setErroAudio(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErroAudio('Permita o microfone no navegador para gravar áudio.');
      return;
    }
    pedacosRef.current = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(pedacosRef.current, { type: mime });
      setEnviandoAudio(true);
      try {
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const caminho = `${getClientId()}-${Date.now()}.${ext}`;
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
        setErroAudio('Não consegui enviar o áudio. Tente novamente.');
      } finally {
        setEnviandoAudio(false);
      }
    };
    recorder.start();
    gravadorRef.current = recorder;
    setGravando(true);
    setTempoGravacao(0);
    timerGravacaoRef.current = setInterval(() => {
      setTempoGravacao((t) => t + 1);
    }, 1000);
  }

  function urlAudio(m: Message) {
    if (!m.audio_storage_path) return undefined;
    if (urlsAudio[m.id]) return urlsAudio[m.id];
    const { data } = supabase.storage.from('mensagens-audio').getPublicUrl(m.audio_storage_path);
    setUrlsAudio((atual) => ({ ...atual, [m.id]: data.publicUrl }));
    return data.publicUrl;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f1e6] text-[#2b2118]">
      <audio
        ref={audioRef}
        onWaiting={() => setCarregandoAudio(true)}
        onPlaying={() => setCarregandoAudio(false)}
        onError={() => {
          setPlaying(false);
          setCarregandoAudio(false);
        }}
        preload="none"
      />

      {/* Pop-up do Patrocinador */}
      {sponsor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-3xl bg-[#f7f1e6] p-6 text-center shadow-2xl">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a6d3b]">
              Momento Patrocinado
            </p>
            <h2 className="mb-1 text-2xl font-bold text-[#2b2118]">{sponsor.name}</h2>
            {sponsor.tagline && <p className="text-sm text-[#5c4a35]">{sponsor.tagline}</p>}
          </div>
        </div>
      )}

      {/* Topo da Rádio (Mobile Header) */}
      <header className="sticky top-0 z-30 border-b border-[#d9c9a8] bg-[#f7f1e6]/90 backdrop-blur-md px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#2b2118] text-lg shadow-sm">
              🕊️
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-[#2b2118]">
                Rádio Graça &amp; Paz
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-[#7a6a52]">
                {broadcast?.is_live ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#b3261e]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b3261e] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b3261e]" />
                    </span>
                    AO VIVO {broadcast.pastor_name ? `(${broadcast.pastor_name})` : ''}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[#2f6b4f]">
                    <span className="h-2 w-2 rounded-full bg-[#2f6b4f]" />
                    Música 24 Horas
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        {/* Card do Player Principal */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#2b2118] to-[#1a140e] p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide backdrop-blur-md">
              {broadcast?.is_live ? '🎙️ TRANSMISSÃO AO VIVO' : '📻 PROGRAMAÇÃO MUSICAL'}
            </span>
            {playing && (
              <div className="flex items-end gap-0.5 h-4">
                <span className="w-1 bg-[#e8dac0] animate-[bounce_1s_infinite_100ms] rounded-full h-full" />
                <span className="w-1 bg-[#e8dac0] animate-[bounce_1s_infinite_300ms] rounded-full h-2/3" />
                <span className="w-1 bg-[#e8dac0] animate-[bounce_1s_infinite_200ms] rounded-full h-4/5" />
                <span className="w-1 bg-[#e8dac0] animate-[bounce_1s_infinite_400ms] rounded-full h-1/2" />
              </div>
            )}
          </div>

          <div className="my-6 text-center">
            <h2 className="text-xl font-bold tracking-tight text-[#f7f1e6]">
              {broadcast?.is_live ? 'Culto / Palavra Pastoral' : 'Louvores & Adoração'}
            </h2>
            <p className="mt-1 text-xs text-[#a0937a]">
              {broadcast?.is_live ? 'Acompanhe a palavra ao vivo' : 'Tocando os melhores hinos e mensagens'}
            </p>
          </div>

          {/* Botão Gigante Play/Pause */}
          <button
            onClick={togglePlay}
            disabled={carregandoAudio}
            className={`mx-auto flex h-20 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold transition active:scale-98 shadow-md ${
              playing
                ? 'bg-[#b3261e] text-white hover:bg-[#8f1e17]'
                : 'bg-[#f7f1e6] text-[#2b2118] hover:bg-[#eae0ce]'
            }`}
          >
            {carregandoAudio ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Conectando...
              </span>
            ) : playing ? (
              <>
                <span className="text-2xl">⏸</span> Pausar Rádio
              </>
            ) : (
              <>
                <span className="text-2xl">▶</span> Ouvir Agora
              </>
            )}
          </button>
        </section>

        {/* Bate-papo dos Ouvintes */}
        <section className="flex flex-1 flex-col rounded-3xl border border-[#d9c9a8] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              💬 Bate-Papo &amp; Pedidos
            </h2>
            <span className="text-[11px] text-[#a0937a]">{messages.length} mensagens</span>
          </div>

          {/* Lista de Mensagens com rolagem suave */}
          <div
            ref={chatScrollRef}
            className="flex h-56 flex-col gap-2 overflow-y-auto pr-1 text-sm scroll-smooth"
          >
            {messages.map((m) => {
              const eMeu = m.client_id === getClientId();
              return (
                <div
                  key={m.id}
                  className={`flex flex-col rounded-2xl px-3.5 py-2 transition ${
                    eMeu
                      ? 'ml-auto max-w-[85%] bg-[#2b2118] text-[#f7f1e6]'
                      : 'mr-auto max-w-[85%] bg-[#f0e6d2] text-[#2b2118]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-80">
                    <span>{m.author_name}</span>
                    {m.is_guest && (
                      <span className="rounded bg-[#8a6d3b] px-1 py-0.2 text-[9px] text-white font-bold">
                        CONVIDADO
                      </span>
                    )}
                    {m.type === 'pedido' && (
                      <span className="rounded bg-[#c98a2c] px-1 py-0.2 text-[9px] text-white font-bold">
                        PEDIDO
                      </span>
                    )}
                  </div>
                  {m.kind === 'audio' ? (
                    <audio
                      controls
                      src={urlAudio(m)}
                      className="mt-1.5 h-8 w-full max-w-[220px]"
                    />
                  ) : (
                    <p className="mt-0.5 text-xs leading-relaxed break-words">{m.content}</p>
                  )}
                </div>
              );
            })}
            {messages.length === 0 && (
              <div className="my-auto text-center text-xs text-[#a0937a]">
                🙏 Envie sua saudação ou peça um louvor!
              </div>
            )}
          </div>

          {erroAudio && (
            <p className="my-1 rounded-lg bg-[#fbeaea] px-2 py-1 text-center text-xs text-[#b3261e]">
              {erroAudio}
            </p>
          )}

          {/* Formulário de Envio Mobile-first */}
          <div className="mt-3 flex flex-col gap-2 border-t border-[#f0e6d2] pt-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#7a6a52]">Seu nome:</span>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Seu nome"
                className="flex-1 rounded-xl border border-[#d9c9a8] bg-[#f7f1e6]/40 px-2.5 py-1 text-xs font-semibold focus:bg-white focus:outline-none"
              />
            </div>

            <form onSubmit={enviarMensagem} className="flex items-center gap-1.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escreva uma mensagem..."
                className="flex-1 rounded-2xl border border-[#d9c9a8] bg-white px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
              />

              {/* Botão Gravar Áudio */}
              <button
                type="button"
                onClick={alternarGravacao}
                disabled={enviandoAudio}
                title={gravando ? 'Parar gravação' : 'Gravar áudio'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base transition active:scale-90 ${
                  gravando
                    ? 'animate-pulse bg-[#b3261e] text-white shadow-md'
                    : 'bg-[#f0e6d2] text-[#5c4a35] hover:bg-[#e4d6be]'
                }`}
              >
                {enviandoAudio ? '⏳' : gravando ? `${tempoGravacao}s` : '🎤'}
              </button>

              {/* Botão Enviar Texto */}
              <button
                type="submit"
                disabled={!text.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2b2118] text-sm text-[#f7f1e6] shadow-sm disabled:opacity-40 transition active:scale-90"
              >
                ➤
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

