import type { Metadata, Viewport } from "next";
import "./globals.css";

// Este manifest/ícone é o do app do OUVINTE. A área da locução
// (app/locucao/layout.tsx) declara o seu próprio, diferente — os dois
// viram apps instaláveis separados, cada um com seu ícone e nome na tela
// do celular, mesmo estando no mesmo site.
//
// A partir daqui também ficam as marcações de Open Graph: é o que faz o
// WhatsApp (e Facebook, Telegram, iMessage) mostrarem aquele card grande
// com a arte da rádio quando alguém compartilha o link, em vez de só o
// endereço cru. Não mexe em nada do PWA — são apenas tags no <head> que
// esses aplicativos leem antes de exibir o link.
export const metadata: Metadata = {
  // Sem metadataBase o Next escreve o caminho relativo da imagem
  // (/og-instalar.jpg) e o WhatsApp não consegue baixá-la, porque ele exige
  // URL absoluta. É a causa mais comum do card não aparecer.
  metadataBase: new URL("https://radiopastor.vercel.app"),

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

  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://radiopastor.vercel.app",
    siteName: "Rádio Graça & Paz",
    title: "Rádio Graça & Paz — ao vivo, 24 horas",
    description: "Toque para abrir e instalar o app da rádio no seu celular.",
    images: [
      {
        url: "/og-instalar.jpg",
        width: 1200,
        height: 630,
        alt: "Rádio Graça & Paz — Instalar aplicativo",
      },
    ],
  },

  // Alguns aplicativos usam as marcações do Twitter/X em vez das do Open
  // Graph; sem elas, eles caem numa prévia pequena, com a imagem em
  // miniatura quadrada em vez do card grande.
  twitter: {
    card: "summary_large_image",
    title: "Rádio Graça & Paz — ao vivo, 24 horas",
    description: "Toque para abrir e instalar o app da rádio no seu celular.",
    images: ["/og-instalar.jpg"],
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
