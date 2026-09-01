'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

import { usePlayer } from '@/lib/PlayerContext';
import ModalOuvintes from '@/components/ModalOuvintes';

const ITENS = [
  { href: '/locucao', label: 'Estúdio', icone: '🎙️' },
  { href: '/locucao/musicas', label: 'Músicas', icone: '🎵' },
  { href: '/locucao/mensagens', label: 'Mensagens', icone: '💬' },
  { href: '/locucao/convidados', label: 'Convidados', icone: '👤' },
  { href: '/locucao/patrocinadores', label: 'Apoios', icone: '🏷️' },
];

export default function LocucaoNav({ nome }: { nome: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const {
    musicaTocando,
    estaTocando,
    playlistAtiva,
    filaPlaylist,
    indiceFila,
    pausar,
    retomar,
    pararPlaylist,
    proxima,
    anterior,
    ouvintesOnline,
    setModalOuvintesAberto,
    isYouTube,
  } = usePlayer();

  const [promptInstalacao, setPromptInstalacao] = useState<any>(null);
  const [jaInstalado, setJaInstalado] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      localStorage.getItem('pwa_app_installed') === 'true';

    if (isStandalone) {
      setJaInstalado(true);
      return;
    }

    // Evento nativo disparado quando o app é instalado pelo navegador
    const handleAppInstalled = () => {
      try {
        localStorage.setItem('pwa_app_installed', 'true');
      } catch {}
      setJaInstalado(true);
      setPromptInstalacao(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Ler prompt já capturado globalmente pelo layout.tsx (pode ter disparado antes do React montar)
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

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-install-ready', handlePwaReady);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstalarApp() {
    const prompt = promptInstalacao || (typeof window !== 'undefined' && (window as any).__pwaInstallPrompt);
    if (prompt) {
      try {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          try {
            localStorage.setItem('pwa_app_installed', 'true');
          } catch {}
          setJaInstalado(true);
        }
      } catch {}
      setPromptInstalacao(null);
      if (typeof window !== 'undefined') {
        (window as any).__pwaInstallPrompt = null;
      }
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push('/locucao/entrar');
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#d9c9a8] bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <img
              src="/icons/icon-192x192.png"
              alt="Logo"
              className="h-8 w-8 rounded-xl shadow-xs border border-[#d9c9a8]"
            />
            <div className="leading-tight">
              <p className="text-xs font-bold text-[#2b2118]">{nome}</p>
              <p className="text-[10px] text-[#7a6a52]">Console de Locução</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Marcador Ao Vivo de Ouvintes Conectados (visível em todas as telas da locução) */}
            <button
              onClick={() => setModalOuvintesAberto(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold bg-[#eaf3ec] text-[#2f6b4f] hover:bg-[#d8edd9] transition active:scale-95 shadow-xs border border-[#2f6b4f]/20 cursor-pointer"
              title="Clique para ver os ouvintes conectados agora"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2f6b4f] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2f6b4f]" />
              </span>
              <span>👥 {ouvintesOnline.length} {ouvintesOnline.length === 1 ? 'Ouvinte' : 'Ouvintes'}</span>
            </button>

            {/* Só mostra botão de instalar se realmente houver suporte a 1-clique do navegador e não estiver instalado */}
            {!jaInstalado && promptInstalacao && (
              <button
                onClick={handleInstalarApp}
                className="flex items-center gap-1 rounded-xl bg-[#2b2118] px-2.5 py-1 text-xs font-bold text-[#f7f1e6] shadow-xs hover:bg-[#1a140e] transition active:scale-95 animate-pulse"
                title="Instalar App do Estúdio"
              >
                <span>📲</span>
                <span>Instalar App</span>
              </button>
            )}
            <button
              onClick={sair}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-95 transition"
            >
              Sair
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-none [-webkit-overflow-scrolling:touch]">
          {ITENS.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                  ativo
                    ? 'bg-[#2b2118] text-[#f7f1e6] shadow-sm'
                    : 'bg-[#f0e6d2]/60 text-[#5c4a35] hover:bg-[#f0e6d2]'
                }`}
              >
                <span className="text-sm">{item.icone}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Mini Player Persistente Flutuante (aparece em qualquer aba quando há música tocando ou carregada) */}
      {musicaTocando && (
        <aside
          aria-label="Player de Áudio em Reprodução"
          className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md animate-in slide-in-from-bottom duration-300"
        >
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-[#2b2118] p-3 text-white shadow-2xl border border-[#d9c9a8]/30 backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className={`text-xl ${estaTocando ? 'animate-spin' : ''}`}>
                {isYouTube ? '🔴' : '💿'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-[#f7f1e6] flex items-center gap-1.5">
                  <span className="truncate">{musicaTocando.title}</span>
                  {isYouTube && (
                    <span className="shrink-0 rounded-md bg-red-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                      YouTube
                    </span>
                  )}
                </p>
                <p className="truncate text-[10px] text-[#d9c9a8]">
                  {playlistAtiva
                    ? `📋 ${playlistAtiva.name} (${indiceFila + 1}/${filaPlaylist.length})`
                    : isYouTube
                    ? '🔴 YouTube — não vai ao ar'
                    : '🎵 Som no Ar'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {playlistAtiva && filaPlaylist.length > 1 && (
                <button
                  onClick={anterior}
                  disabled={indiceFila <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs text-white/80 hover:bg-white/20 disabled:opacity-30 active:scale-95"
                  title="Música anterior"
                >
                  ⏮
                </button>
              )}

              <button
                onClick={estaTocando ? pausar : retomar}
                className={`flex h-8 w-8 items-center justify-center rounded-2xl text-xs font-bold text-white shadow-md transition active:scale-95 ${
                  estaTocando ? 'bg-[#b3261e] hover:bg-[#8f1e17]' : 'bg-[#2f6b4f] hover:bg-[#255740]'
                }`}
                title={estaTocando ? 'Pausar' : 'Continuar tocando'}
              >
                {estaTocando ? '⏸' : '▶'}
              </button>

              {playlistAtiva && filaPlaylist.length > 1 && (
                <button
                  onClick={proxima}
                  disabled={indiceFila >= filaPlaylist.length - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs text-white/80 hover:bg-white/20 disabled:opacity-30 active:scale-95"
                  title="Próxima música"
                >
                  ⏭
                </button>
              )}

              <button
                onClick={pararPlaylist}
                className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-xs text-white/60 hover:text-white hover:bg-white/20 active:scale-95"
                title="Parar e fechar player"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Modal global de ouvintes conectados */}
      <ModalOuvintes />
    </>
  );
}
