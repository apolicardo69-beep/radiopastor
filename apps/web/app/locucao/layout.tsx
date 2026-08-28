// Layout de topo de /locucao — de propósito bem simples, sem checar login
// (isso é feito só dentro do grupo (protegido), que envolve as páginas de
// verdade da locução mas NÃO a de login em /locucao/entrar — senão a
// própria tela de login ficaria presa num redirecionamento infinito pra
// ela mesma).
//
// O que este arquivo faz de importante: define o manifest/ícone/nome
// PRÓPRIOS da locução (diferentes dos do ouvinte — ver app/layout.tsx e
// app/page.tsx), pra virar um app instalável separado de verdade, e
// registra o service worker da locução em toda página sob /locucao,
// incluindo a de login.
import type { Metadata, Viewport } from 'next';
import SwRegisterLocucao from './sw-register';

export const metadata: Metadata = {
  title: 'Locução — Graça & Paz',
  description: 'Painel do pastor e da equipe da Rádio Graça & Paz.',
  manifest: '/manifest-locucao.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Locução',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icon-locucao-512.png',
    apple: '/icons/icon-locucao-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#b3261e',
};

export default function LocucaoSegmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwRegisterLocucao />
      {children}
    </>
  );
}
