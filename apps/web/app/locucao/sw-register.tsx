'use client';

// Registra o service worker do app da LOCUÇÃO (ver public/sw-locucao.js),
// com escopo próprio ('/locucao') — assim ele fica independente do
// service worker do ouvinte, e instalar um dos dois apps nunca mexe no
// outro. Fica no layout de topo de /locucao (não no layout raiz), então só
// roda aqui dentro, nunca nas páginas do ouvinte.
import { useEffect } from 'react';

export default function SwRegisterLocucao() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-locucao.js', { scope: '/locucao' }).catch(() => {
        // instalação como app é um "extra"; se falhar, a área de locução
        // continua funcionando normalmente pelo navegador.
      });
    }
  }, []);
  return null;
}
