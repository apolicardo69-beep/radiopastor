// Renova a sessão do pastor/moderador a cada requisição, se necessário.
// Sem isso, a sessão pode expirar no meio do uso do app em Server Components
// sem chance de renovar o cookie (que só pode ser escrito em middleware ou
// Route Handlers, não em Server Components puros).
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getUser() (não getSession()) valida o token com o servidor do Supabase
  // em vez de só confiar no que está no cookie — mais seguro pra decisões
  // de acesso feitas aqui no middleware.
  await supabase.auth.getUser();

  return response;
}
