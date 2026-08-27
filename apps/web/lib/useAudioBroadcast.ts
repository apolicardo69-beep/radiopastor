'use client';

// Hook compartilhado entre a tela do pastor (/locucao) e a do convidado
// (/convidado/[token]) pra transmitir o microfone do celular ao vivo.
//
// Pega o áudio com getUserMedia, grava em pedaços de 250ms com
// MediaRecorder (Opus/WebM — o próprio navegador faz a codificação, sem
// nenhuma lib extra) e manda cada pedaço por WebSocket pro audio-bridge
// (ver apps/audio-bridge/server.mjs), que junta tudo com FFmpeg e envia pro
// Icecast. Essa mesma combinação foi testada de ponta a ponta com
// navegador headless antes de virar este hook.
import { useCallback, useEffect, useRef, useState } from 'react';

export type BroadcastStatus = 'parado' | 'pedindo_microfone' | 'conectando' | 'ao_vivo' | 'erro';

const BRIDGE_WS_URL = process.env.NEXT_PUBLIC_AUDIO_BRIDGE_WS_URL || 'ws://localhost:9000';

export function useAudioBroadcast(role: 'pastor' | 'guest') {
  const [status, setStatus] = useState<BroadcastStatus>('parado');
  const [erro, setErro] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const parar = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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

  const iniciar = useCallback(
    async (token: string) => {
      setErro(null);
      setStatus('pedindo_microfone');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setErro('Não consegui acessar o microfone. Verifique a permissão nas configurações do navegador.');
        setStatus('erro');
        return;
      }
      streamRef.current = stream;

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
            iniciarGravacao(stream, ws);
            setStatus('ao_vivo');
          } else if (msg.type === 'error') {
            setErro(msg.message || 'A transmissão recusou a conexão.');
            setStatus('erro');
            parar();
          }
        } catch {
          // mensagens não-JSON no canal de controle são ignoradas
        }
      };

      ws.onerror = () => {
        setErro('Não consegui conectar com o servidor de transmissão. Verifique sua internet.');
        setStatus('erro');
      };

      ws.onclose = (event) => {
        // 1000 = fechamento normal (o próprio usuário apertou "encerrar")
        if (event.code !== 1000) {
          setErro((atual) => atual ?? 'A transmissão caiu. Tente ir ao ar de novo.');
          setStatus((atual) => (atual === 'ao_vivo' ? 'erro' : atual));
        }
      };
    },
    [role, parar]
  );

  // se o componente sumir da tela (o pastor trocou de aba, por exemplo) sem
  // ter apertado "encerrar", ainda assim libera o microfone e a conexão.
  useEffect(() => () => parar(), [parar]);

  return { status, erro, iniciar, parar };
}
