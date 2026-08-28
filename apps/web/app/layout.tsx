import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegisterOuvinte from "./sw-register";

// Este manifest/ícone é o do app do OUVINTE. A área da locução
// (app/locucao/layout.tsx) declara o seu próprio, diferente — os dois
// viram apps instaláveis separados, cada um com seu ícone e nome na tela
// do celular, mesmo estando no mesmo site.
export const metadata: Metadata = {
  title: "Rádio Graça & Paz",
  description: "Rádio web da igreja — 24h na Palavra, louvores e bate-papo com os ouvintes.",
  manifest: "/manifest-ouvinte.webmanifest",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Graça & Paz",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2b2118",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased selection:bg-[#2b2118] selection:text-[#f7f1e6]">
      <body className="min-h-full flex flex-col bg-[#f7f1e6] text-[#2b2118]">
        <SwRegisterOuvinte />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Captura global do evento de instalação PWA antes de qualquer React montar.
              // Funciona igual nas duas áreas (ouvinte e locução): o navegador dispara este
              // evento com base no manifest/service worker da página em que a pessoa está,
              // então o botão "Instalar App" sempre oferece o app certo pro contexto certo.
              window.__pwaInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__pwaInstallPrompt = e;
                // Dispara um evento customizado para componentes React que já montaram
                window.dispatchEvent(new Event('pwa-install-ready'));
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
