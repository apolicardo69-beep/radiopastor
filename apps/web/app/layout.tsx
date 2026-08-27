import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rádio Graça & Paz",
  description: "Rádio web da igreja — ao vivo, playlist e bate-papo com os ouvintes.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rádio Graça & Paz",
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
      <body className="min-h-full flex flex-col bg-[#f7f1e6] text-[#2b2118]">{children}</body>
    </html>
  );
}

