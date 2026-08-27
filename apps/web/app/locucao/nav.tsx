'use client';

// Navegação simples da área de locução: 4 destinos grandes, ícones +
// palavras (nunca só ícone) pra não depender de o pastor "adivinhar" o que
// cada botão faz.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/locucao', label: 'Início', icone: '🎙️' },
  { href: '/locucao/musicas', label: 'Músicas', icone: '🎵' },
  { href: '/locucao/mensagens', label: 'Mensagens', icone: '💬' },
  { href: '/locucao/convidados', label: 'Convidados', icone: '👤' },
  { href: '/locucao/patrocinadores', label: 'Patrocinadores', icone: '🏷️' },
];

export default function LocucaoNav({ nome }: { nome: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function sair() {
    await supabase.auth.signOut();
    router.push('/entrar');
  }

  return (
    <header className="border-b border-[#d9c9a8] bg-white/70">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <span className="text-sm text-[#7a6a52]">Olá, {nome}</span>
        <button onClick={sair} className="text-sm font-medium text-[#b3261e]">
          Sair
        </button>
      </div>
      <nav className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 pb-2">
        {ITENS.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium ${
                ativo ? 'bg-[#2b2118] text-[#f7f1e6]' : 'text-[#5c4a35] hover:bg-[#eee1c8]'
              }`}
            >
              <span className="text-lg">{item.icone}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
