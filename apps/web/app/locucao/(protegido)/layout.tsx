// Guarda de acesso da área de locução: roda no servidor, então mesmo que
// alguém desative o JS ou chegue direto numa URL, sem sessão de
// pastor/moderador válida ele nunca chega a ver o conteúdo desta área.
//
// Fica dentro do grupo (protegido) — que envolve só as páginas de verdade
// da locução, mas NÃO a de login em /locucao/entrar — senão a própria tela
// de login ficaria presa num redirecionamento infinito pra ela mesma. O
// manifest/ícone/nome PRÓPRIOS da locução ficam no layout de cima
// (app/locucao/layout.tsx), que envolve tanto esta área quanto o login.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LocucaoNav from './nav';
import { PlayerProvider } from '@/lib/PlayerContext';
import PwaInstallLocucao from '../PwaInstallLocucao';

export default async function LocucaoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/locucao/entrar');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  if (!profile || !['pastor', 'moderador'].includes(profile.role)) {
    redirect('/locucao/entrar');
  }

  return (
    <PlayerProvider>
      <div className="min-h-screen bg-[#f7f1e6] text-[#2b2118]">
        <LocucaoNav nome={profile.display_name} />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <PwaInstallLocucao />
          {children}
        </main>
      </div>
    </PlayerProvider>
  );
}

