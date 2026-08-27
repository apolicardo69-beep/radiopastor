// Guarda de acesso da área de locução: roda no servidor, então mesmo que
// alguém desative o JS ou chegue direto numa URL, sem sessão de
// pastor/moderador válida ele nunca chega a ver o conteúdo desta área.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LocucaoNav from './nav';

export default async function LocucaoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/entrar');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  if (!profile || !['pastor', 'moderador'].includes(profile.role)) {
    redirect('/entrar');
  }

  return (
    <div className="min-h-screen bg-[#f7f1e6] text-[#2b2118]">
      <LocucaoNav nome={profile.display_name} />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
