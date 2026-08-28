'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PwaInstallLocucao from '../PwaInstallLocucao';

export default function EntrarPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro('E-mail ou senha não conferem. Tente de novo.');
      return;
    }
    router.push('/locucao');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f1e6] px-4 py-8">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <img
          src="/icons/icon-locucao-192.png"
          alt="Ícone Estúdio"
          className="h-16 w-16 rounded-3xl bg-[#241b18] p-1 shadow-md border-2 border-[#d4af37]/50"
        />
        <h1 className="text-xl font-bold text-[#2b2118]">Rádio Graça &amp; Paz</h1>
        <p className="text-xs text-[#7a6a52]">Console do Locutor &amp; Estúdio</p>
      </div>

      <div className="w-full max-w-sm">
        <PwaInstallLocucao />
      </div>

      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-md border border-[#d9c9a8]/40"
      >
        <h2 className="mb-4 text-base font-bold text-[#2b2118]">Acessar o Estúdio</h2>

        {erro && (
          <p className="mb-4 rounded-xl bg-[#fbeaea] p-3 text-xs font-semibold text-[#b3261e]">
            {erro}
          </p>
        )}

        <label className="mb-1 block text-xs font-bold text-[#2b2118]">Seu E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3.5 w-full rounded-xl border border-[#d9c9a8] bg-[#f7f1e6]/30 px-3.5 py-3 text-sm focus:border-[#2b2118] focus:bg-white focus:outline-none"
          placeholder="pastor@igreja.com"
        />

        <label className="mb-1 block text-xs font-bold text-[#2b2118]">Sua Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mb-5 w-full rounded-xl border border-[#d9c9a8] bg-[#f7f1e6]/30 px-3.5 py-3 text-sm focus:border-[#2b2118] focus:bg-white focus:outline-none"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-xl bg-[#2b2118] py-3.5 text-sm font-bold text-[#f7f1e6] shadow-sm transition active:scale-95 disabled:opacity-60"
        >
          {carregando ? 'Entrando no Estúdio...' : 'Entrar na Locução'}
        </button>
      </form>
    </div>
  );
}

