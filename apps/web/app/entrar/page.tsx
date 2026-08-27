'use client';

// Login da equipe (pastor/moderador). Propositalmente simples: só e-mail e
// senha, textos grandes, uma única ação por tela — pensado pra alguém que
// não usa muito a tecnologia e vai abrir isso raramente (o celular fica
// logado o tempo todo depois do primeiro acesso).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
    <div className="flex min-h-screen items-center justify-center bg-[#f7f1e6] px-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="mb-1 text-2xl font-bold text-[#2b2118]">Entrar na locução</h1>
        <p className="mb-6 text-sm text-[#7a6a52]">Área da equipe da Rádio Graça &amp; Paz</p>

        {erro && (
          <p className="mb-4 rounded-lg bg-[#fbeaea] px-3 py-2 text-sm text-[#b3261e]">{erro}</p>
        )}

        <label className="mb-1 block text-sm font-medium text-[#2b2118]">E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[#d9c9a8] px-4 py-3 text-base"
          placeholder="pastor@igreja.com"
        />

        <label className="mb-1 block text-sm font-medium text-[#2b2118]">Senha</label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mb-6 w-full rounded-lg border border-[#d9c9a8] px-4 py-3 text-base"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-lg bg-[#2b2118] py-3 text-lg font-semibold text-[#f7f1e6] disabled:opacity-60"
        >
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
