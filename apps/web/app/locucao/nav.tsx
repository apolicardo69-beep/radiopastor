'use client';

// Navegação otimizada para celular e desktop
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ITENS = [
  { href: '/locucao', label: 'Estúdio', icone: '🎙️' },
  { href: '/locucao/musicas', label: 'Músicas', icone: '🎵' },
  { href: '/locucao/mensagens', label: 'Mensagens', icone: '💬' },
  { href: '/locucao/convidados', label: 'Convidados', icone: '👤' },
  { href: '/locucao/patrocinadores', label: 'Apoios', icone: '🏷️' },
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
    <header className="sticky top-0 z-40 border-b border-[#d9c9a8] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2b2118] text-xs text-white">
            📻
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold text-[#2b2118]">{nome}</p>
            <p className="text-[10px] text-[#7a6a52]">Console de Locução</p>
          </div>
        </div>
        <button
          onClick={sair}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#b3261e] hover:bg-[#b3261e]/10 active:scale-95 transition"
        >
          Sair
        </button>
      </div>

      <nav className="mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-none [-webkit-overflow-scrolling:touch]">
        {ITENS.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition active:scale-95 ${
                ativo
                  ? 'bg-[#2b2118] text-[#f7f1e6] shadow-sm'
                  : 'bg-[#f0e6d2]/60 text-[#5c4a35] hover:bg-[#f0e6d2]'
              }`}
            >
              <span className="text-sm">{item.icone}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

