'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallLocucao() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [jaInstalado, setJaInstalado] = useState(false);
  const [fechado, setFechado] = useState(false);
  const [modalAjuda, setModalAjuda] = useState(false);
  const [tipoDispositivo, setTipoDispositivo] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    // 1. Detectar se já está rodando como PWA (App instalado)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setJaInstalado(true);
      return;
    }

    // 2. Detectar tipo de dispositivo
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) {
      setTipoDispositivo('ios');
    } else if (/android/.test(ua)) {
      setTipoDispositivo('android');
    } else {
      setTipoDispositivo('desktop');
    }

    // 3. Capturar o evento nativo de instalação do navegador
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setJaInstalado(true);
      setDeferredPrompt(null);
      setModalAjuda(false);
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

  async function handleInstalar() {
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
        console.error('[PWA Locução] Erro ao disparar prompt:', err);
        setModalAjuda(true);
      }
      setDeferredPrompt(null);
    } else {
      // Se o navegador ainda não disparou o prompt ou for iOS/Firefox/Desktop
      setModalAjuda(true);
    }
  }

  // Não renderizar se já estiver rodando como aplicativo instalado
  if (jaInstalado || fechado) {
    return null;
  }

  return (
    <>
      {/* Banner Principal de Instalação do Locutor */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#241b18] via-[#1c1412] to-[#241b18] p-3.5 text-white shadow-xl border-2 border-[#d4af37]/60 animate-in fade-in">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/icons/icon-locucao-192.png"
            alt="Ícone Estúdio"
            className="h-12 w-12 shrink-0 rounded-xl border border-[#d4af37] shadow-md object-contain bg-[#181210]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-[#b3261e] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                🔴 Estúdio
              </span>
              <p className="truncate text-xs font-black text-[#f3e5c8]">
                Instalar Console do Locutor
              </p>
            </div>
            <p className="text-[11px] text-[#d9c9a8] mt-0.5 leading-tight">
              Instale na tela inicial para transmitir e soltar vinhetas em 1 toque
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstalar}
            className="rounded-xl bg-gradient-to-r from-[#b3261e] via-[#c92a20] to-[#8f1d16] px-3.5 py-2.5 text-xs font-black text-white shadow-md hover:brightness-110 active:scale-95 transition flex items-center gap-1.5 animate-pulse"
          >
            <span>📲</span>
            <span>Instalar</span>
          </button>
          <button
            onClick={() => setFechado(true)}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-white/70 hover:bg-white/20 transition"
            title="Fechar aviso"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Modal Interativo de Ajuda caso o navegador não abra o pop-up nativo */}
      {modalAjuda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-[#1c1412] p-6 text-white shadow-2xl border border-[#d4af37]/60">
            <button
              onClick={() => setModalAjuda(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/80 hover:bg-white/20"
            >
              ✕
            </button>

            <div className="flex flex-col items-center text-center">
              <img
                src="/icons/icon-locucao-192.png"
                alt="Ícone do Estúdio"
                className="h-16 w-16 rounded-2xl border-2 border-[#d4af37] bg-[#181210] p-1 shadow-lg mb-3"
              />
              <h3 className="text-base font-black text-[#f3e5c8]">
                Instalar Console do Locutor
              </h3>
              <p className="mt-1 text-xs text-[#d9c9a8]">
                Siga as instruções abaixo para adicionar à sua tela inicial:
              </p>
            </div>

            <div className="mt-4 rounded-2xl bg-white/5 p-4 text-xs space-y-3 border border-white/10 text-left">
              {tipoDispositivo === 'ios' && (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">1</span>
                    <p>Toque no botão <strong className="text-[#f3e5c8]">Compartilhar (⎋)</strong> na barra inferior do Safari.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">2</span>
                    <p>Role para baixo e selecione <strong className="text-[#f3e5c8]">&apos;Adicionar à Tela de Início&apos; (➕)</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">3</span>
                    <p>Toque em <strong className="text-[#f3e5c8]">Adicionar</strong> no canto superior direito.</p>
                  </div>
                </>
              )}

              {tipoDispositivo === 'android' && (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">1</span>
                    <p>Toque nos <strong className="text-[#f3e5c8]">3 pontinhos (⋮)</strong> no canto superior do navegador Chrome.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">2</span>
                    <p>Selecione a opção <strong className="text-[#f3e5c8]">&apos;Instalar aplicativo&apos;</strong> ou <strong className="text-[#f3e5c8]">&apos;Adicionar à tela inicial&apos;</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">3</span>
                    <p>Confirme clicando em <strong className="text-[#f3e5c8]">Instalar</strong>.</p>
                  </div>
                </>
              )}

              {tipoDispositivo === 'desktop' && (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">1</span>
                    <p>Na barra de endereços do navegador (ao lado da estrela de favoritos), clique no ícone de <strong className="text-[#f3e5c8]">Instalar (🖥️ ou ⊕)</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b3261e] text-[10px] font-bold text-white">2</span>
                    <p>Clique em <strong className="text-[#f3e5c8]">Instalar</strong> para abrir o console em janela própria.</p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setModalAjuda(false)}
              className="mt-5 w-full rounded-2xl bg-[#d4af37] py-3 text-xs font-black text-[#1c1412] shadow-md hover:bg-[#e6c587] transition active:scale-95"
            >
              Entendido!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
