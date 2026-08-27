'use client';

// Tela principal da locução: controle do Ao Vivo + Mesa de Som / Músicas
// Permite ao pastor ir ao ar, falar no microfone, e tocar louvores/fundos musicais
// diretamente para os ouvintes com controle de volume em tempo real.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAudioBroadcast } from '@/lib/useAudioBroadcast';
import type { BroadcastState, Track } from '@/lib/types';

const TEXTO_STATUS: Record<string, string> = {
  parado: 'Fora do ar (tocando playlist automática 24h)',
  pedindo_microfone: 'Pedindo acesso ao microfone...',
  conectando: 'Conectando ao servidor...',
  ao_vivo: '🔴 VOCÊ ESTÁ AO VIVO NA RÁDIO',
  erro: 'Não foi possível ir ao ar',
};

export default function LocucaoHome() {
  const supabase = createClient();
  const {
    status,
    erro,
    iniciar,
    parar,
    volumeMic,
    volumeMusica,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
  } = useAudioBroadcast('pastor');

  const [broadcast, setBroadcast] = useState<BroadcastState | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicaTocando, setMusicaTocando] = useState<Track | null>(null);
  const [estaTocandoMusica, setEstaTocandoMusica] = useState(false);

  const [erroMusica, setErroMusica] = useState<string | null>(null);

  const audioMusicaRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    supabase
      .from('broadcast_state')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setBroadcast(data));

    supabase
      .from('tracks')
      .select('*')
      .order('position', { ascending: true })
      .then(({ data }) => data && setTracks(data));

    const channel = supabase
      .channel('locucao-home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'broadcast_state' },
        (payload) => setBroadcast(payload.new as BroadcastState)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tracks' },
        () => {
          supabase
            .from('tracks')
            .select('*')
            .order('position', { ascending: true })
            .then(({ data }) => data && setTracks(data));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTrackUrl(track: Track): string {
    if (track.source === 'link' && track.source_url) {
      return track.source_url;
    }
    if (track.storage_path) {
      const { data } = supabase.storage.from('musicas').getPublicUrl(track.storage_path);
      return data.publicUrl;
    }
    return '';
  }

  async function alternarAoVivo() {
    if (status === 'ao_vivo') {
      parar();
      if (audioMusicaRef.current) {
        audioMusicaRef.current.pause();
        setEstaTocandoMusica(false);
      }
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    iniciar(session.access_token, audioMusicaRef.current);
  }

  function tocarMusicaNaTransmissao(track: Track) {
    const url = getTrackUrl(track);
    if (!url || !audioMusicaRef.current) {
      setErroMusica('Link ou arquivo de áudio não encontrado para esta música.');
      return;
    }

    if (musicaTocando?.id === track.id && estaTocandoMusica) {
      audioMusicaRef.current.pause();
      setEstaTocandoMusica(false);
      return;
    }

    setErroMusica(null);
    const audioEl = audioMusicaRef.current;
    if (url.includes('supabase.co')) {
      audioEl.crossOrigin = 'anonymous';
    } else {
      audioEl.removeAttribute('crossOrigin');
    }
    audioEl.src = url;
    audioEl.load();

    audioEl.play().then(() => {
      setMusicaTocando(track);
      setEstaTocandoMusica(true);
      conectarElementoAudio(audioEl);
    }).catch((err) => {
      console.error('Erro ao tocar áudio:', err);
      setErroMusica('Não foi possível carregar o áudio dessa música. Verifique se o link/arquivo é válido.');
      setEstaTocandoMusica(false);
    });
  }

  function pausarMusica() {
    if (audioMusicaRef.current) {
      audioMusicaRef.current.pause();
      setEstaTocandoMusica(false);
    }
  }

  const noAr = status === 'ao_vivo';
  const ocupado = status === 'pedindo_microfone' || status === 'conectando';

  return (
    <div className="flex flex-col gap-6">
      {/* Audio element oculto usado para mixagem */}
      <audio
        ref={audioMusicaRef}
        onEnded={() => setEstaTocandoMusica(false)}
        onPause={() => setEstaTocandoMusica(false)}
        onPlay={() => setEstaTocandoMusica(true)}
      />

      {/* Cartão Principal do Microfone / Ao Vivo */}
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className={`mb-4 text-xs font-bold uppercase tracking-wider ${noAr ? 'text-[#b3261e]' : 'text-[#7a6a52]'}`}>
          {TEXTO_STATUS[status]}
        </p>

        <button
          onClick={alternarAoVivo}
          disabled={ocupado}
          className={`mx-auto flex h-36 w-36 items-center justify-center rounded-full text-base font-bold text-white shadow-xl transition-all active:scale-95 disabled:opacity-60 ${
            noAr ? 'animate-pulse bg-[#b3261e] hover:bg-[#8f1e17]' : 'bg-[#2f6b4f] hover:bg-[#255740]'
          }`}
        >
          {noAr ? 'Encerrar Ao Vivo' : 'Ir ao ar'}
        </button>

        {erro && (
          <p className="mt-4 rounded-lg bg-[#fbeaea] px-3 py-2 text-sm text-[#b3261e]">{erro}</p>
        )}

        {broadcast?.guest_live && (
          <p className="mt-4 rounded-lg bg-[#eaf3ec] px-3 py-2 text-sm text-[#2f6b4f]">
            🎙️ Convidado conectado ao vivo com você.
          </p>
        )}
      </section>

      {/* Mesa de Controle de Áudio (Mixer de Volumes) */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-[#7a6a52]">
          🎛️ Mesa de Som (Mixer de Áudio)
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Controle do Microfone */}
          <div className="flex flex-col gap-2 rounded-xl bg-[#f0e6d2] p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[#2b2118]">
              <span>🎤 Microfone do Pastor</span>
              <span>{Math.round(volumeMic * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={volumeMic}
              onChange={(e) => alterarVolumeMic(parseFloat(e.target.value))}
              className="accent-[#2b2118]"
            />
            <button
              onClick={() => alterarVolumeMic(volumeMic > 0 ? 0 : 1)}
              className={`text-left text-xs font-medium ${volumeMic === 0 ? 'text-[#b3261e]' : 'text-[#7a6a52]'}`}
            >
              {volumeMic === 0 ? '🔇 Microfone Mutado' : '🔊 Microfone Ativo'}
            </button>
          </div>

          {/* Controle da Música */}
          <div className="flex flex-col gap-2 rounded-xl bg-[#f0e6d2] p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-[#2b2118]">
              <span>🎵 Música / Fundo Musical</span>
              <span>{Math.round(volumeMusica * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volumeMusica}
              onChange={(e) => alterarVolumeMusica(parseFloat(e.target.value))}
              className="accent-[#2b2118]"
            />
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => alterarVolumeMusica(0.25)}
                className="rounded bg-white/70 px-2 py-0.5 font-medium hover:bg-white"
                title="Deixar música baixinha como fundo de oração"
              >
                Fundo (25%)
              </button>
              <button
                onClick={() => alterarVolumeMusica(0.85)}
                className="rounded bg-white/70 px-2 py-0.5 font-medium hover:bg-white"
                title="Tocar louvor no volume principal"
              >
                Louvor (85%)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Soundboard / Tocar Louvores na Transmissão */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#7a6a52]">
              📻 Tocar Músicas para os Ouvintes
            </h2>
            <p className="text-xs text-[#7a6a52]">
              Clique em ▶ para soltar o louvor ou fundo musical para os fiéis.
            </p>
          </div>
          {estaTocandoMusica && (
            <button
              onClick={pausarMusica}
              className="rounded-lg bg-[#b3261e] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#8f1e17]"
            >
              ⏸ Pausar Música
            </button>
          )}
        </div>

        {musicaTocando && estaTocandoMusica && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-[#2f6b4f] bg-[#eaf3ec] p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="animate-spin text-sm">💿</span>
              <div>
                <p className="font-bold text-[#2f6b4f]">Tocando Agora para os Ouvintes:</p>
                <p className="font-medium text-[#2b2118]">{musicaTocando.title}</p>
              </div>
            </div>
            <button
              onClick={pausarMusica}
              className="rounded-md bg-[#2f6b4f] px-2 py-1 font-semibold text-white"
            >
              Pausar
            </button>
          </div>
        )}

        {erroMusica && (
          <p className="mb-3 rounded-lg bg-[#fbeaea] px-3 py-2 text-xs text-[#b3261e]">{erroMusica}</p>
        )}

        <ul className="flex flex-col gap-2">
          {tracks.map((track) => {
            const estaTocandoEsta = musicaTocando?.id === track.id && estaTocandoMusica;
            return (
              <li
                key={track.id}
                className={`flex items-center justify-between rounded-xl p-3 transition ${
                  estaTocandoEsta ? 'bg-[#e8dac0] font-semibold' : 'bg-[#f0e6d2]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => tocarMusicaNaTransmissao(track)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm transition active:scale-95 ${
                      estaTocandoEsta ? 'bg-[#b3261e]' : 'bg-[#2b2118] hover:bg-[#43362a]'
                    }`}
                    title={estaTocandoEsta ? 'Pausar louvor' : 'Tocar louvor na transmissão'}
                  >
                    {estaTocandoEsta ? '⏸' : '▶'}
                  </button>
                  <div>
                    <p className="text-sm text-[#2b2118]">{track.title}</p>
                    <p className="text-[11px] text-[#7a6a52]">
                      {track.source === 'link' ? '🌐 Link' : '📁 Arquivo'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => tocarMusicaNaTransmissao(track)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                    estaTocandoEsta
                      ? 'bg-[#b3261e] text-white'
                      : 'bg-white text-[#2b2118] hover:bg-[#f7f1e6]'
                  }`}
                >
                  {estaTocandoEsta ? 'Pausar' : '▶ Tocar no Ar'}
                </button>
              </li>
            );
          })}

          {tracks.length === 0 && (
            <p className="py-4 text-center text-xs text-[#a0937a]">
              Nenhuma música cadastrada na playlist. Acesse a aba <b>Músicas</b> acima para adicionar faixas!
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}

