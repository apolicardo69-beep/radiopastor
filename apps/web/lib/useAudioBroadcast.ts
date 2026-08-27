'use client';

// Hook compartilhado entre a tela do pastor (/locucao) e a do convidado
// (/convidado/[token]) pra transmitir o microfone do celular ao vivo.
//
// Usa Web Audio API para mixar o microfone + música de fundo (se houver) em tempo real,
// grava em pedaços de 250ms com MediaRecorder (Opus/WebM) e manda pro audio-bridge.
import { useCallback, useEffect, useRef, useState } from 'react';

export type BroadcastStatus = 'parado' | 'pedindo_microfone' | 'conectando' | 'ao_vivo' | 'erro';

const BRIDGE_WS_URL = process.env.NEXT_PUBLIC_AUDIO_BRIDGE_WS_URL || 'ws://localhost:9000';

export function useAudioBroadcast(role: 'pastor' | 'guest') {
  const [status, setStatus] = useState<BroadcastStatus>('parado');
  const [erro, setErro] = useState<string | null>(null);
  const [volumeMic, setVolumeMic] = useState<number>(1);
  const [volumeMusica, setVolumeMusica] = useState<number>(0.8);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const musicSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const parar = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    destNodeRef.current = null;
    micGainNodeRef.current = null;
    musicGainNodeRef.current = null;
    musicSourceNodeRef.current = null;

    setStatus('parado');
  }, []);

  function iniciarGravacao(stream: MediaStream, ws: WebSocket) {
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(await e.data.arrayBuffer());
      }
    };
    recorder.start(250);
    recorderRef.current = recorder;
  }

  const conectarElementoAudio = useCallback((audioEl: HTMLAudioElement) => {
    if (!audioCtxRef.current || !destNodeRef.current) return;
    try {
      if (musicSourceNodeRef.current) {
        try { musicSourceNodeRef.current.disconnect(); } catch {}
      }
      const audioCtx = audioCtxRef.current;
      const source = audioCtx.createMediaElementSource(audioEl);
      const musicGain = ctxCreateGain(audioCtx, volumeMusica);

      source.connect(musicGain);
      musicGain.connect(destNodeRef.current);
      source.connect(audioCtx.destination);

      musicGainNodeRef.current = musicGain;
      musicSourceNodeRef.current = source;
    } catch {}
  }, [volumeMusica]);

  function ctxCreateGain(ctx: AudioContext, val: number) {
    const g = ctx.createGain();
    g.gain.value = val;
    return g;
  }

  const alterarVolumeMic = useCallback((novoVolume: number) => {
    setVolumeMic(novoVolume);
    if (micGainNodeRef.current) {
      micGainNodeRef.current.gain.value = novoVolume;
    }
  }, []);

  const alterarVolumeMusica = useCallback((novoVolume: number) => {
    setVolumeMusica(novoVolume);
    if (musicGainNodeRef.current) {
      musicGainNodeRef.current.gain.value = novoVolume;
    }
  }, []);

  const iniciar = useCallback(
    async (token: string, audioMusicaEl?: HTMLAudioElement | null) => {
      setErro(null);
      setStatus('pedindo_microfone');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        setErro('Não consegui acessar o microfone. Verifique a permissão nas configurações do navegador.');
        setStatus('erro');
        return;
      }
      streamRef.current = stream;

      let outputStream = stream;
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          const ctx = new AudioCtxClass();
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          audioCtxRef.current = ctx;

          const micSource = ctx.createMediaStreamSource(stream);
          const micGain = ctx.createGain();
          micGain.gain.value = volumeMic;
          micGainNodeRef.current = micGain;

          const dest = ctx.createMediaStreamDestination();
          destNodeRef.current = dest;

          micSource.connect(micGain);
          micGain.connect(dest);

          if (audioMusicaEl) {
            try {
              const musicSource = ctx.createMediaElementSource(audioMusicaEl);
              const musicGain = ctx.createGain();
              musicGain.gain.value = volumeMusica;
              musicSource.connect(musicGain);
              musicGain.connect(dest);
              musicSource.connect(ctx.destination);
              musicGainNodeRef.current = musicGain;
              musicSourceNodeRef.current = musicSource;
            } catch {}
          }

          outputStream = dest.stream;
        }
      } catch {}

      setStatus('conectando');
      const ws = new WebSocket(BRIDGE_WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ role, token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'ready') {
            iniciarGravacao(outputStream, ws);
            setStatus('ao_vivo');
          } else if (msg.type === 'error') {
            setErro(msg.message || 'A transmissão recusou a conexão.');
            setStatus('erro');
            parar();
          }
        } catch {}
      };

      ws.onerror = () => {
        setErro('Não consegui conectar com o servidor de transmissão. Verifique sua internet.');
        setStatus('erro');
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          setErro((atual) => atual ?? 'A transmissão caiu. Tente ir ao ar de novo.');
          setStatus((atual) => (atual === 'ao_vivo' ? 'erro' : atual));
        }
      };
    },
    [role, parar, volumeMic, volumeMusica]
  );

  useEffect(() => () => parar(), [parar]);

  return {
    status,
    erro,
    iniciar,
    parar,
    volumeMic,
    volumeMusica,
    alterarVolumeMic,
    alterarVolumeMusica,
    conectarElementoAudio,
  };
}

