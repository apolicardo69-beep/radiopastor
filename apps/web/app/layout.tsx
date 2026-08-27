import type { Metadata } from "next";
import "./globals.css";

// Sem next/font/google de propósito: evita depender de acesso à internet
// no momento do build (algumas plataformas/ambientes bloqueiam isso) e o
// visual das telas do app já não usa essas variáveis — só a fonte padrão
// do sistema mesmo, o que também é mais leve pro celular do pastor.

export const metadata: Metadata = {
  title: "Rádio Graça & Paz",
  description: "Rádio web da igreja — ao vivo, playlist e bate-papo com os ouvintes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
