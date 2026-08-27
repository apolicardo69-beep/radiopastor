// Cliente Supabase para uso no servidor (Server Components, Route Handlers).
// Lê/escreve cookies de sessão via next/headers — necessário pro login do
// pastor/moderador funcionar com Server Components.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Ver o comentário em lib/supabase/client.ts sobre não usar o genérico
// <Database> com um tipo escrito à mão.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // chamado de um Server Component sem permissão de escrita —
            // ok ignorar quando há um middleware renovando a sessão.
          }
        },
      },
    }
  );
}
