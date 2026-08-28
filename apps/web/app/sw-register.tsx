'use client';

// Registra o service worker do app do OUVINTE (ver public/sw-ouvinte.js),
// com escopo '/' — mas o Next.js resolve automaticamente qual service
// worker vale em cada página pelo escopo mais específico, então isso nunca
// conflita com o da locução (escopo '/locucao').
import { useEffect } from 'react';

export default function SwRegisterOuvinte() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-ouvinte.js', { scope: '/' }).catch(() => {
        // instalação como app é um "extra"; se falhar, o site do ouvinte
        // continua funcionando normalmente pelo navegador.
      });
    }
  }, []);
  return null;
}
