'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallLocucao() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [jaInstalado, setJaInstalado] = useState(true);
  const [fechadoManualmente, setFechadoManualmente] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Verificar se já está rodando como PWA instalado (standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setJaInstalado(true);
      return;
    }

    try {
      const instaladoStorage = localStorage.getItem('pwa_locucao_installed') === 'true';
      const dispensadoSessao = sessionStorage.getItem('pwa_locucao_dismissed') === 'true';
      if (dispensadoSessao) setFechadoManualmente(true);
      if (instaladoStorage) {
        setJaInstalado(true);
        return;
      }
    } catch {}

    setJaInstalado(false);

    // Detectar iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(isIosDevice);

    // Capturar o evento de instalação do navegador (Chrome, Edge, Android, Opera)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setJaInstalado(false);
    };

    const handleAppInstalled = () => {
      setJaInstalado(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem('pwa_locucao_installed', 'true');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function instalar() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setJaInstalado(true);
          try {
            localStorage.setItem('pwa_locucao_installed', 'true');
          } catch {}
        }
      } catch (err) {
        console.error('[PWA Locução] Erro ao disparar instalação:', err);
      }
      setDeferredPrompt(null);
    }
  }

  function fechar() {
    setFechadoManualmente(true);
    try {
      sessionStorage.setItem('pwa_locucao_dismissed', 'true');
    } catch {}
  }

  // Se já está instalado ou foi dispensado na sessão, não exibe
  if (jaInstalado || fechadoManualmente) {
    return null;
  }

  // Se for Android/Chrome com prompt disponível
  if (deferredPrompt) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#241b18] via-[#1a1210] to-[#241b18] p-3.5 text-white shadow-lg border border-[#aa820a]/40 animate-in fade-in">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/icons/icon-locucao-192.png"
            alt="Ícone Estúdio"
            className="h-11 w-11 shrink-0 rounded-xl border border-[#d4af37]/60 shadow-md object-contain bg-[#181210]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-[#b3261e] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                Estúdio
              </span>
              <p className="truncate text-xs font-black text-[#f3e5c8]">
                Instalar Console do Locutor
              </p>
            </div>
            <p className="truncate text-[11px] text-[#d9c9a8] mt-0.5">
              Acesso rápido com disparo de vinhetas e locução
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={instalar}
            className="rounded-xl bg-gradient-to-r from-[#b3261e] to-[#8f1d16] px-3.5 py-2 text-xs font-black text-white shadow-md hover:brightness-110 active:scale-95 transition flex items-center gap-1"
          >
            <span>📲</span>
            <span>Instalar</span>
          </button>
          <button
            onClick={fechar}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-white/70 hover:bg-white/20 transition"
            title="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Se for iOS e ainda não estiver instalado
  if (isIos) {
    return (
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[#241b18] p-3 text-white shadow-md border border-[#aa820a]/30 animate-in fade-in">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/icons/icon-locucao-192.png"
            alt="Ícone Estúdio"
            className="h-9 w-9 shrink-0 rounded-xl border border-[#d4af37]/40 object-contain bg-[#181210]"
          />
          <p className="text-[11px] text-[#d9c9a8] leading-tight">
            <strong className="text-white">Instalar no iPhone:</strong> Toque em{' '}
            <span className="font-bold text-[#f3e5c8]">Compartilhar (⎋)</span> e depois em{' '}
            <span className="font-bold text-[#f3e5c8]">&apos;Adicionar à Tela de Início&apos; (➕)</span>
          </p>
        </div>
        <button
          onClick={fechar}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/70 hover:bg-white/20"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
