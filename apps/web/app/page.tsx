'use client';

// Tela do ouvinte: player ao vivo, chat em tempo real e arte do patrocinador
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BroadcastState, Message, Sponsor } from '@/lib/types';
import SwRegisterOuvinte from './sw-register';
import MensagemDoDia from '@/components/MensagemDoDia';

const STREAM_URL = process.env.NEXT_PUBLIC_ICECAST_STREAM_URL || 'http://localhost:8000/radio';

// ---------------------------------------------------------------------------
// Helpers dos anúncios
// ---------------------------------------------------------------------------

// Monta o link que abre a conversa no WhatsApp do anunciante já com uma
// mensagem pronta — assim o ouvinte não precisa pensar no que escrever, e o
// anunciante sabe na hora que o contato veio da rádio.
function getSponsorWhatsappLink(sponsor: Sponsor): string | null {
  const digitos = (sponsor.whatsapp || '').replace(/\D/g, '');
  if (!digitos) return null;
  const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
  const texto = encodeURIComponent(
    `Olá! Vi o anúncio de vocês na Rádio Graça & Paz e gostaria de saber mais.`
  );
  return `https://wa.me/${numero}?text=${texto}`;
}

// ---------------------------------------------------------------------------
// Fundos de reserva, pra quando o anúncio ainda não tem arte gerada
// ---------------------------------------------------------------------------
// O card tem SEMPRE o mesmo formato: fundo escuro ocupando o card inteiro,
// logo e texto por cima. O que muda é só de onde vem esse fundo — a arte
// gerada pela IA, ou um destes degradês.
//
// Isso é de propósito: assim o anúncio já fica bonito no dia em que o pastor
// cadastra, sem depender de gerar imagem nenhuma, e ganha a foto depois sem
// que o layout mude. São tons quentes, da mesma família do resto do app.
const FUNDOS_RESERVA = [
  'radial-gradient(circle at 75% 30%, #c9a06a, transparent 55%), linear-gradient(135deg, #8a6d3b 0%, #5c4a35 45%, #2b2118 100%)',
  'radial-gradient(circle at 78% 32%, #b3705a, transparent 55%), linear-gradient(135deg, #8a4b3b 0%, #4a2e26 45%, #2b2118 100%)',
  'radial-gradient(circle at 72% 28%, #7f9a72, transparent 55%), linear-gradient(135deg, #3f5c46 0%, #2b3a2e 45%, #1a140e 100%)',
  'radial-gradient(circle at 80% 35%, #a88bb0, transparent 55%), linear-gradient(135deg, #5c4566 0%, #33263a 45%, #1a140e 100%)',
];

// Escolhe sempre o mesmo degradê pro mesmo anunciante (some da soma dos
// caracteres do id), pra que o card não fique mudando de cor a cada rodízio.
function fundoDoSponsor(id: string): string {
  let soma = 0;
  for (let i = 0; i < id.length; i++) soma += id.charCodeAt(i);
  return FUNDOS_RESERVA[soma % FUNDOS_RESERVA.length];
}

// ---------------------------------------------------------------------------
// Card fixo do patrocinador
// ---------------------------------------------------------------------------
// Um único formato, com ou sem arte: imagem/degradê ao fundo, véu escuro por
// cima pra garantir leitura, e a logo real + o texto real desenhados em cima.
// A arte gerada nunca contém texto — quem escreve o nome do anunciante é o
// app, com fonte de verdade, pra marca nunca sair deformada.
//
// Se houver WhatsApp cadastrado, o card inteiro vira um link: o alvo de toque
// é o card todo, não um botãozinho, o que importa muito no celular.
function CardPatrocinador({
  sponsor,
  indice,
  total,
  logoUrl,
  arteUrl,
}: {
  sponsor: Sponsor;
  indice: number;
  total: number;
  logoUrl: string;
  arteUrl: string;
}) {
  const waLink = getSponsorWhatsappLink(sponsor);

  const miolo = (
    <div className="relative min-h-[140px] overflow-hidden rounded-2xl border border-[#d9c9a8] shadow-md">
      {/* Fundo: a arte gerada, ou o degradê de reserva */}
      {arteUrl ? (
        <img
          src={arteUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: fundoDoSponsor(sponsor.id) }}
        />
      )}

      {/* Véu escuro: sem ele, texto claro sobre foto clara fica ilegível.
          Mais denso à esquerda, que é onde ficam a logo e o texto. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />

      <div className="relative flex items-center gap-3 p-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={sponsor.name}
            className="h-14 w-14 shrink-0 rounded-2xl border border-[#d4af37]/50 bg-white object-contain p-1 shadow-lg"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#d4af37]/50 bg-[#8a6d3b] text-xl text-white shadow-lg">
            ⭐
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#e8c87a]">
              Apoio Cultural
            </span>
            {total > 1 && (
              <span className="text-[9px] text-white/50">
                ({indice + 1}/{total})
              </span>
            )}
          </div>

          <h3 className="truncate text-[15px] font-extrabold text-white drop-shadow-sm">
            {sponsor.name}
          </h3>

          {sponsor.tagline && (
            <p className="line-clamp-2 text-[11.5px] leading-snug text-white/80">
              {sponsor.tagline}
            </p>
          )}

          {waLink && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-[10.5px] font-extrabold text-white shadow-md">
              <span>💬</span>
              <span>Falar no WhatsApp</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!waLink) return <section>{miolo}</section>;

  return (
    <a
      href={waLink}
      target="_blank"
      rel="noreferrer"
      className="block transition active:scale-98"
      aria-label={`Falar no WhatsApp com ${sponsor.name}`}
    >
      {miolo}
    </a>
  );
}

function getClientId() {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem('graca_paz_client_id');
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = 'cli_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 11);
      }
      localStorage.setItem('graca_paz_client_id', id);
    }
    return id;
  } catch {
    return 'cli_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 11);
  }
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
  // Quando ativo, a próxima mensagem (texto ou áudio) vira um "pedido de
  // louvor" em vez de bate-papo comum — é isso que faz ela aparecer na aba
  // "Pedidos de Louvor" do painel do locutor, com o botão de marcar como
  // atendido. Sem essa marcação não existia nenhum jeito do ouvinte gerar
  // esse tipo de mensagem, mesmo a tela do locutor já esperando por elas.
  const [modoPedido, setModoPedido] = useState(false);
  const [sponsorsList, setSponsorsList] = useState<Sponsor[]>([]);
  const [currentSponsorIndex, setCurrentSponsorIndex] = useState(0);
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [urlsAudio, setUrlsAudio] = useState<Record<string, string>>({});
  
  // Identificação do ouvinte
  const [whatsapp, setWhatsapp] = useState('');
  const presenceChannelRef = useRef<any>(null);

  // Estados para PWA
  const [promptInstalacao, setPromptInstalacao] = useState<any>(null);
  const [jaInstalado, setJaInstalado] = useState(false);
  const [modalAjudaInstalacao, setModalAjudaInstalacao] = useState(false);

  const sponsorsRef = useRef<Sponsor[]>([]);
  const trackCountRef = useRef(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const timerGravacaoRef = useRef<NodeJS.Timeout | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Carregar nome e WhatsApp salvos no localStorage
    const savedName = localStorage.getItem('graca_paz_user_name') || '';
    const savedWhatsapp = localStorage.getItem('graca_paz_user_whatsapp') || '';
    if (savedName) setName(savedName);
    if (savedWhatsapp) setWhatsapp(savedWhatsapp);

    // Canal de Presença de Ouvintes ao Vivo
    const clientId = getClientId();
    const presenceChannel = supabase.channel('radio-presence-ouvintes', {
      config: { presence: { key: clientId } },
    });
    presenceChannelRef.current = presenceChannel;

    const trackPresence = async (playingState?: boolean) => {
      try {
        const isTocando = typeof playingState === 'boolean' ? playingState : playing;
        let cName = 'Ouvinte';
        try {
          cName = localStorage.getItem('graca_paz_user_name') || name || 'Ouvinte';
        } catch {}

        await presenceChannel.track({
          client_id: clientId,
          name: cName.trim() || 'Ouvinte',
          online_at: new Date().toISOString(),
          is_playing: isTocando,
        });
      } catch (err) {
        console.warn('Erro ao atualizar presença do ouvinte:', err);
      }
    };

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await trackPresence();
      }
    });

    // Heartbeat a cada 25 segundos para manter a presença viva mesmo com oscilações de rede
    const heartbeatInterval = setInterval(() => {
      trackPresence();
    }, 25000);

    // Re-track imediato quando o ouvinte volta para a aba da rádio
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        trackPresence();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Verificar se já está rodando como app instalado (standalone)
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');

      if (isStandalone) {
        setJaInstalado(true);
      } else {
        // Evento nativo disparado quando o app é instalado pelo navegador
        const handleAppInstalled = () => {
          try {
            localStorage.setItem('pwa_app_installed', 'true');
          } catch {}
          setJaInstalado(true);
          setPromptInstalacao(null);
        };
        window.addEventListener('appinstalled', handleAppInstalled);

        // Ler prompt já capturado globalmente pelo layout.tsx
        if ((window as any).__pwaInstallPrompt) {
          setPromptInstalacao((window as any).__pwaInstallPrompt);
        }

        // Escutar evento customizado caso o prompt chegue depois
        const handlePwaReady = () => {
          if ((window as any).__pwaInstallPrompt) {
            setPromptInstalacao((window as any).__pwaInstallPrompt);
          }
        };
        window.addEventListener('pwa-install-ready', handlePwaReady);

        // Escutar o evento nativo diretamente também
        const handleBeforeInstallPrompt = (e: Event) => {
          e.preventDefault();
          setPromptInstalacao(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      }
    }

    async function carregarSponsors() {
      try {
        const { data: sponsors } = await supabase
          .from('sponsors')
          .select('*')
          .order('created_at', { ascending: false });

        if (sponsors) {
          const ativos = sponsors.filter((s) => s.active !== false);
          setSponsorsList(ativos);
          sponsorsRef.current = ativos;
        }
      } catch (err) {
        console.error('[SPONSORS] Erro:', err);
      }
    }

    async function carregarMensagens() {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
      if (msgs) {
        setMessages(msgs);
        setTimeout(scrollChatToEnd, 100);
      }
    }

    (async () => {
      const { data: bs } = await supabase.from('broadcast_state').select('*').eq('id', 1).single();
      if (bs) setBroadcast(bs);
      await carregarMensagens();
      await carregarSponsors();
    })();

    // Polling de backup a cada 5 segundos para garantir atualização de mensagens e patrocinadores
    const pollInterval = setInterval(() => {
      carregarMensagens();
      carregarSponsors();
    }, 5000);

    // Rotacionar patrocinadores a cada 6 segundos
    const sponsorInterval = setInterval(() => {
      setSponsorsList((list) => {
        if (list.length > 1) {
          setCurrentSponsorIndex((idx) => (idx + 1) % list.length);
        }
        return list;
      });
    }, 6000);

    const channel = supabase
      .channel('chat-publico-realtime')
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
          const novaMsg = payload.new as Message;
          setMessages((atual) => {
            if (atual.some((m) => m.id === novaMsg.id)) return atual;
            return [...atual, novaMsg];
          });
          setTimeout(scrollChatToEnd, 100);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const atualizada = payload.new as Message;
          setMessages((atual) =>
            atual.map((m) => (m.id === atualizada.id ? atualizada : m))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sponsors' },
        () => carregarSponsors()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollInterval);
      clearInterval(sponsorInterval);
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scrollChatToEnd() {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }

  // Só o nome vai pro author_name: essa coluna é lida por qualquer pessoa que
  // abrir a rádio. O telefone segue por fora, em message_contacts, que só a
  // equipe da locução consegue ler.
  function getAuthorDisplay(): string {
    return name.trim() || 'Ouvinte';
  }

  // Registra o telefone de quem escreveu, ligado à mensagem, na tabela
  // protegida. Falhar aqui não pode atrapalhar o envio da mensagem — o
  // ouvinte não tem nada a ver com isso —, então o erro só vai pro console.
  async function registrarContato(messageId: string) {
    const w = whatsapp.trim();
    if (!w) return;
    try {
      await supabase.from('message_contacts').insert({ message_id: messageId, whatsapp: w });
    } catch (err) {
      console.warn('Não consegui registrar o contato do ouvinte:', err);
    }
  }

  function handleNameChange(novoNome: string) {
    setName(novoNome);
    try {
      localStorage.setItem('graca_paz_user_name', novoNome);
    } catch {}
    if (presenceChannelRef.current) {
      presenceChannelRef.current.track({
        client_id: getClientId(),
        name: novoNome.trim() || 'Ouvinte',
        online_at: new Date().toISOString(),
        is_playing: playing,
      });
    }
  }

  function handleWhatsappChange(novoWhatsapp: string) {
    setWhatsapp(novoWhatsapp);
    try {
      localStorage.setItem('graca_paz_user_whatsapp', novoWhatsapp);
    } catch {}
    if (presenceChannelRef.current) {
      presenceChannelRef.current.track({
        client_id: getClientId(),
        name: name.trim() || 'Ouvinte',
        online_at: new Date().toISOString(),
        is_playing: playing,
      });
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    setErroAudio(null);
    if (playing) {
      audio.pause();
      setPlaying(false);
      setCarregandoAudio(false);
      if (presenceChannelRef.current) {
        presenceChannelRef.current.track({
          client_id: getClientId(),
          name: name.trim() || 'Ouvinte',
            online_at: new Date().toISOString(),
          is_playing: false,
        });
      }
    } else {
      setCarregandoAudio(true);
      // Forçar recarga para pegar a ponta do stream ao vivo
      audio.src = `${STREAM_URL}?_t=${Date.now()}`;
      audio.load();
      audio
        .play()
        .then(() => {
          setPlaying(true);
          setCarregandoAudio(false);
          if (presenceChannelRef.current) {
            presenceChannelRef.current.track({
              client_id: getClientId(),
              name: name.trim() || 'Ouvinte',
                    online_at: new Date().toISOString(),
              is_playing: true,
            });
          }
        })
        .catch((err) => {
          console.error('Erro ao reproduzir stream:', err);
          setPlaying(false);
          setCarregandoAudio(false);
          setErroAudio(
            'Não foi possível conectar ao áudio da rádio. Verifique se o servidor de transmissão está online.'
          );
        });
    }
  }

  async function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = text.trim();
    if (!conteudo) return;
    setText('');
    const eraPedido = modoPedido;
    setModoPedido(false);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          author_name: getAuthorDisplay(),
          kind: 'texto',
          content: conteudo,
          type: eraPedido ? 'pedido' : 'chat',
          is_guest: false,
          client_id: getClientId(),
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao inserir mensagem:', error);
      }
      if (data) {
        await registrarContato(data.id);
        setMessages((atual) => {
          if (atual.some((m) => m.id === data.id)) return atual;
          return [...atual, data as Message];
        });
        setTimeout(scrollChatToEnd, 100);
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  }

  async function alternarGravacao() {
    console.log('[AUDIO] alternarGravacao chamado, gravando=', gravando);
    if (gravando) {
      console.log('[AUDIO] Parando gravação...');
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
      gravadorRef.current?.stop();
      setGravando(false);
      return;
    }
    setErroAudio(null);

    // Verificar se o navegador suporta getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Seu navegador não suporta gravação de áudio. Use Chrome ou Firefox.';
      console.error('[AUDIO]', msg);
      setErroAudio(msg);
      return;
    }

    let stream: MediaStream;
    try {
      console.log('[AUDIO] Solicitando acesso ao microfone...');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[AUDIO] Microfone concedido, tracks:', stream.getAudioTracks().length);
    } catch (err) {
      console.error('[AUDIO] Erro ao acessar microfone:', err);
      setErroAudio('Permita o acesso ao microfone no seu navegador para gravar áudio.');
      return;
    }

    // Guarda se o modo "pedido de louvor" estava ativo no momento em que a
    // gravação começou, pra usar isso lá no onstop (que só roda quando a
    // pessoa aperta parar, possivelmente vários segundos depois). Os botões
    // de alternar ficam desabilitados durante a gravação (veja o JSX), então
    // esse valor não muda no meio do caminho.
    const eraPedidoAudio = modoPedido;

    pedacosRef.current = [];
    let options: MediaRecorderOptions = {};
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        options = { mimeType: 'audio/aac' };
      }
    }
    console.log('[AUDIO] MIME escolhido:', options.mimeType || '(padrão do navegador)');

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      // Fallback sem options se o navegador for estrito
      console.log('[AUDIO] Fallback: criando MediaRecorder sem options');
      recorder = new MediaRecorder(stream);
    }

    recorder.ondataavailable = (e) => {
      console.log('[AUDIO] ondataavailable, tamanho:', e.data.size);
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };

    recorder.onerror = (e) => {
      console.error('[AUDIO] MediaRecorder erro:', e);
      setErroAudio('Erro durante a gravação de áudio.');
    };

    recorder.onstop = async () => {
      console.log('[AUDIO] onstop, pedaços:', pedacosRef.current.length);
      stream.getTracks().forEach((t) => t.stop());
      const mimeUsado = recorder.mimeType || 'audio/webm';
      const blob = new Blob(pedacosRef.current, { type: mimeUsado });
      console.log('[AUDIO] Blob criado, tamanho:', blob.size, 'tipo:', blob.type);

      if (blob.size === 0) {
        setErroAudio('Gravação vazia. Tente segurar o botão por mais tempo.');
        return;
      }

      setEnviandoAudio(true);
      try {
        const ext = mimeUsado.includes('mp4') ? 'mp4' : mimeUsado.includes('aac') ? 'aac' : 'webm';
        const caminho = `${getClientId()}-${Date.now()}.${ext}`;
        console.log('[AUDIO] Fazendo upload para:', caminho);
        const { error: erroUpload } = await supabase.storage
          .from('mensagens-audio')
          .upload(caminho, blob, { contentType: mimeUsado });
        if (erroUpload) {
          console.error('[AUDIO] Erro upload:', erroUpload);
          throw new Error(erroUpload.message);
        }
        console.log('[AUDIO] Upload OK, inserindo mensagem...');
        const { data: insertedMsg, error: erroInsert } = await supabase
          .from('messages')
          .insert({
            author_name: getAuthorDisplay(),
            kind: 'audio',
            audio_storage_path: caminho,
            type: eraPedidoAudio ? 'pedido' : 'chat',
            is_guest: false,
            client_id: getClientId(),
          })
          .select()
          .single();

        if (erroInsert) {
          console.error('[AUDIO] Erro insert:', erroInsert);
          throw new Error(erroInsert.message);
        }
        if (insertedMsg) {
          await registrarContato(insertedMsg.id);
          setMessages((atual) => {
            if (atual.some((m) => m.id === insertedMsg.id)) return atual;
            return [...atual, insertedMsg as Message];
          });
          setTimeout(scrollChatToEnd, 100);
        }
        console.log('[AUDIO] ✅ Mensagem de áudio enviada com sucesso!');
      } catch (err: unknown) {
        console.error('[AUDIO] Erro ao enviar áudio:', err);
        setErroAudio(
          `Falha ao enviar áudio: ${err instanceof Error ? err.message : 'Erro no servidor'}`
        );
      } finally {
        setEnviandoAudio(false);
        setModoPedido(false);
      }
    };

    try {
      recorder.start();
      console.log('[AUDIO] ✅ Gravação iniciada!');
      gravadorRef.current = recorder;
      setGravando(true);
      setTempoGravacao(0);
      timerGravacaoRef.current = setInterval(() => {
        setTempoGravacao((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error('[AUDIO] Erro ao iniciar gravador:', err);
      stream.getTracks().forEach((t) => t.stop());
      setErroAudio('Não foi possível iniciar a gravação de áudio.');
    }
  }

  function getAudioUrl(storagePath?: string | null) {
    if (!storagePath) return '';
    const { data } = supabase.storage.from('mensagens-audio').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  function cancelarGravacao() {
    if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
    if (gravadorRef.current && gravadorRef.current.state !== 'inactive') {
      gravadorRef.current.onstop = null;
      gravadorRef.current.stop();
      gravadorRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    setGravando(false);
    setTempoGravacao(0);
  }

  async function handleInstalarApp() {
    const prompt =
      promptInstalacao ||
      (typeof window !== 'undefined' ? (window as any).__pwaInstallPrompt : null);

    if (prompt) {
      try {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          setJaInstalado(true);
        }
      } catch {
        setModalAjudaInstalacao(true);
      }
      setPromptInstalacao(null);
      if (typeof window !== 'undefined') (window as any).__pwaInstallPrompt = null;
    } else {
      setModalAjudaInstalacao(true);
    }
  }

  function getSponsorLogoUrl(storagePath?: string | null) {
    if (!storagePath) return '';
    const { data } = supabase.storage.from('patrocinadores').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  // A arte de fundo vive no mesmo bucket das logos, sob o prefixo "arte-ia/".
  function getSponsorArteUrl(storagePath?: string | null) {
    if (!storagePath) return '';
    const { data } = supabase.storage.from('patrocinadores').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  const currentSponsor = sponsorsList[currentSponsorIndex] || sponsorsList[0];

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f1e6] text-[#2b2118] pb-24">
      <SwRegisterOuvinte />
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

      {/* Pop-up do Patrocinador (Momento Especial) */}
      {sponsor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-[#f7f1e6] text-center shadow-2xl border border-[#d9c9a8]">
            <button
              onClick={() => setSponsor(null)}
              className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-xs font-bold text-white backdrop-blur-sm hover:bg-black/50"
            >
              ✕
            </button>

            {/* Faixa do topo: a arte gerada, ou o mesmo degradê do card fixo */}
            <div className="relative h-32 w-full">
              {sponsor.background_storage_path ? (
                <img
                  src={getSponsorArteUrl(sponsor.background_storage_path)}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ backgroundImage: fundoDoSponsor(sponsor.id) }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#f7f1e6] via-[#f7f1e6]/30 to-transparent" />
            </div>

            <div className="relative -mt-6 px-6 pb-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a6d3b]">
                ⭐ Momento Patrocinado
              </p>
              {sponsor.logo_storage_path && (
                <img
                  src={getSponsorLogoUrl(sponsor.logo_storage_path)}
                  alt={sponsor.name}
                  className="mx-auto mb-3 max-h-20 max-w-[180px] rounded-xl bg-white/80 object-contain p-1 shadow-sm"
                />
              )}
              <h2 className="mb-1 text-xl font-extrabold text-[#2b2118]">{sponsor.name}</h2>
              {sponsor.tagline && (
                <p className="text-xs font-medium text-[#5c4a35]">{sponsor.tagline}</p>
              )}

              {getSponsorWhatsappLink(sponsor) && (
                <a
                  href={getSponsorWhatsappLink(sponsor) as string}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#25D366] py-3 text-xs font-bold text-white shadow-md transition hover:bg-[#1ebd5a] active:scale-95"
                >
                  <span>💬</span>
                  <span>Falar no WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuda de Instalação do Ouvinte */}
      {modalAjudaInstalacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#2b2118] p-6 text-white shadow-2xl border border-[#d9c9a8]/50">
            <button
              onClick={() => setModalAjudaInstalacao(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/80 hover:bg-white/20"
            >
              ✕
            </button>

            <div className="flex flex-col items-center text-center">
              <img
                src="/icons/icon-192x192.png"
                alt="Ícone da Rádio"
                className="h-16 w-16 rounded-2xl border border-[#d9c9a8] shadow-lg mb-3 object-cover"
              />
              <h3 className="text-base font-black text-[#f7f1e6]">
                Instalar Rádio Graça &amp; Paz
              </h3>
              <p className="mt-1 text-xs text-[#d9c9a8]">
                Instale o aplicativo para ouvir com a tela do celular apagada:
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-white/5 p-4 text-xs space-y-3 border border-white/10 text-left">
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f6b4f] text-[10px] font-bold text-white">1</span>
                <p>
                  No <strong>Android (Chrome)</strong>: Toque nos <strong className="text-[#f7f1e6]">3 pontinhos (⋮)</strong> e escolha <strong className="text-[#f7f1e6]">&apos;Instalar aplicativo&apos;</strong>.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f6b4f] text-[10px] font-bold text-white">2</span>
                <p>
                  No <strong>iPhone (Safari)</strong>: Toque em <strong className="text-[#f7f1e6]">Compartilhar (⎋)</strong> e selecione <strong className="text-[#f7f1e6]">&apos;Adicionar à Tela de Início&apos; (➕)</strong>.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2f6b4f] text-[10px] font-bold text-white">3</span>
                <p>
                  No <strong>Computador</strong>: Clique no ícone de <strong className="text-[#f7f1e6]">Instalar (🖥️)</strong> na barra de endereços do navegador.
                </p>
              </div>
            </div>

            <button
              onClick={() => setModalAjudaInstalacao(false)}
              className="mt-5 w-full rounded-2xl bg-[#2f6b4f] py-3 text-xs font-bold text-white shadow-md hover:bg-[#255740] transition active:scale-95"
            >
              Entendi!
            </button>
          </div>
        </div>
      )}

      {/* Topo da Rádio (Mobile Header) */}
      <header className="sticky top-0 z-30 border-b border-[#d9c9a8] bg-[#f7f1e6]/90 backdrop-blur-md px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/icon-192x192.png"
              alt="Logo"
              className="h-9 w-9 rounded-2xl shadow-sm border border-[#d9c9a8]"
            />
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

          {/* Botão de Instalação PWA no Topo (só aparece se o navegador tiver suporte a 1-clique e o app não estiver instalado) */}
          {!jaInstalado && promptInstalacao && (
            <button
              onClick={handleInstalarApp}
              className="flex items-center gap-1 rounded-2xl bg-[#2b2118] px-3 py-1.5 text-[11px] font-bold text-[#f7f1e6] shadow-sm hover:bg-[#1a140e] transition active:scale-95 animate-pulse"
              title="Instalar Aplicativo da Rádio"
            >
              <span>📲</span>
              <span>Instalar</span>
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
        {/* Card de Instalação Rápida do App */}
        {!jaInstalado && (
          <section className="flex items-center justify-between gap-3 rounded-3xl bg-[#2b2118] p-4 text-white shadow-md border border-[#d9c9a8]/30 animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/icons/icon-192x192.png"
                alt="App Icon"
                className="h-12 w-12 shrink-0 rounded-2xl border border-white/20 shadow-xs object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-[#f7f1e6]">
                  Baixe o App da Rádio
                </p>
                <p className="text-[11px] text-[#d9c9a8] leading-tight mt-0.5">
                  Ouça em 2º plano com a tela do celular apagada
                </p>
              </div>
            </div>

            <button
              onClick={handleInstalarApp}
              className="shrink-0 rounded-2xl bg-[#2f6b4f] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-[#255740] transition active:scale-95 flex items-center gap-1.5 animate-pulse"
            >
              <span>📲</span>
              <span>Instalar</span>
            </button>
          </section>
        )}

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

        {/* Card Fixo de Apoio Cultural / Patrocinadores */}
        {currentSponsor && (
          <CardPatrocinador
            sponsor={currentSponsor}
            indice={currentSponsorIndex}
            total={sponsorsList.length}
            logoUrl={getSponsorLogoUrl(currentSponsor.logo_storage_path)}
            arteUrl={getSponsorArteUrl(currentSponsor.background_storage_path)}
          />
        )}

        {/* Bate-papo dos Ouvintes */}
        <section className="flex flex-1 flex-col rounded-3xl border border-[#d9c9a8] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-[#f0e6d2] pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52]">
              💬 Bate-Papo &amp; Pedidos
            </h2>
            <span className="text-[11px] text-[#a0937a]">{messages.length} mensagens</span>
          </div>

          {/* Palavra do Pastor (Fixada no topo do bate-papo quando ativa) */}
          <MensagemDoDia />

          {/* Lista de Mensagens com rolagem suave */}
          <div
            ref={chatScrollRef}
            className="flex h-56 flex-col gap-2 overflow-y-auto pr-1 text-sm scroll-smooth"
          >
            {messages.map((m) => {
              const eMeu = m.client_id === getClientId();
              const audioSrc = m.kind === 'audio' ? getAudioUrl(m.audio_storage_path) : '';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col rounded-2xl px-3.5 py-2 transition ${
                    eMeu
                      ? 'ml-auto max-w-[88%] bg-[#2b2118] text-[#f7f1e6]'
                      : 'mr-auto max-w-[88%] bg-[#f0e6d2] text-[#2b2118]'
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
                    <div className="mt-1.5 flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-[11px] opacity-75">
                        <span>🎙️ Mensagem de voz</span>
                      </div>
                      <audio
                        controls
                        src={audioSrc}
                        preload="metadata"
                        className="h-9 w-full max-w-[240px] rounded-lg"
                      />
                    </div>
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
            <p className="my-1 rounded-lg bg-[#fbeaea] px-2.5 py-1.5 text-center text-xs font-semibold text-[#b3261e]">
              ⚠️ {erroAudio}
            </p>
          )}

          {/* Barra de Gravação Ativa ou Formulário de Envio */}
          <div className="mt-3 flex flex-col gap-2 border-t border-[#f0e6d2] pt-2">
            {/* Identificação do Ouvinte (Nome e WhatsApp) */}
            <div className="rounded-2xl bg-[#f7f1e6]/60 p-2.5 border border-[#d9c9a8]/50">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7a6a52] flex items-center gap-1">
                <span>👤</span> Sua Identificação (só o Pastor / Locutor vê)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Seu nome (ex: Maria)"
                  className="rounded-xl border border-[#d9c9a8] bg-white px-2.5 py-1.5 text-xs font-semibold focus:border-[#2b2118] focus:outline-none"
                />
                <input
                  value={whatsapp}
                  onChange={(e) => handleWhatsappChange(e.target.value)}
                  placeholder="Seu WhatsApp (não aparece no bate-papo)"
                  type="tel"
                  className="rounded-xl border border-[#d9c9a8] bg-white px-2.5 py-1.5 text-xs font-semibold focus:border-[#2b2118] focus:outline-none"
                />
              </div>
            </div>

            {/* Escolha entre bate-papo comum e pedido de louvor — é essa
                marcação que faz a mensagem aparecer na aba "Pedidos de
                Louvor" do painel do locutor, com o botão de atendido. */}
            <div className="flex gap-1.5 rounded-2xl bg-[#f0e6d2]/60 p-1">
              <button
                type="button"
                onClick={() => setModoPedido(false)}
                disabled={gravando || enviandoAudio}
                className={`flex-1 rounded-xl py-1.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-60 ${
                  !modoPedido ? 'bg-white text-[#2b2118] shadow-xs' : 'text-[#7a6a52]'
                }`}
              >
                💬 Bate-papo
              </button>
              <button
                type="button"
                onClick={() => setModoPedido(true)}
                disabled={gravando || enviandoAudio}
                className={`flex-1 rounded-xl py-1.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-60 ${
                  modoPedido ? 'bg-[#c98a2c] text-white shadow-xs' : 'text-[#7a6a52]'
                }`}
              >
                🎵 Pedido de Louvor
              </button>
            </div>

            {gravando ? (
              /* Interface Clara de Gravação em Andamento */
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#b3261e]/10 p-2 border border-[#b3261e]/20 animate-in fade-in">
                <div className="flex items-center gap-2 pl-2">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b3261e] opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-[#b3261e]" />
                  </span>
                  <span className="text-xs font-bold text-[#b3261e]">
                    Gravando {tempoGravacao}s {modoPedido ? '(pedido de louvor)' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={cancelarGravacao}
                    className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#7a6a52] hover:bg-gray-100 transition active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={alternarGravacao}
                    disabled={enviandoAudio}
                    className="rounded-xl bg-[#b3261e] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#8f1e17] transition active:scale-95 flex items-center gap-1"
                  >
                    {enviandoAudio ? 'Enviando...' : '✓ Enviar Áudio'}
                  </button>
                </div>
              </div>
            ) : enviandoAudio ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#f0e6d2] p-2.5 text-xs font-bold text-[#5c4a35]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Enviando áudio para o bate-papo...
              </div>
            ) : (
              <form onSubmit={enviarMensagem} className="flex items-center gap-1.5">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={modoPedido ? 'Qual música você quer pedir?' : 'Escreva uma mensagem...'}
                  className="flex-1 rounded-2xl border border-[#d9c9a8] bg-white px-3.5 py-2.5 text-xs focus:border-[#2b2118] focus:outline-none"
                />

                {/* Botão Gravar Áudio */}
                <button
                  type="button"
                  onClick={alternarGravacao}
                  title="Gravar áudio"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f0e6d2] text-[#5c4a35] text-base hover:bg-[#e4d6be] transition active:scale-90 shadow-xs"
                >
                  🎤
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
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

