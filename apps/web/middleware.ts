import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // roda em tudo, menos assets estáticos — a checagem de quem PODE
    // acessar /locucao continua sendo feita no layout dessa área (aqui é
    // só renovação de sessão).
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
