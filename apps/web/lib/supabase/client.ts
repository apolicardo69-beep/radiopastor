// Cliente Supabase para uso no navegador (componentes "use client").
// Usa a chave "anon" pública — nunca a service_role aqui.
import { createBrowserClient } from '@supabase/ssr';

// Sem o parâmetro genérico <Database>: escrever à mão um tipo no formato
// exato que o supabase-js espera (Tables/Views/Functions/Enums/
// CompositeTypes) é frágil e trava em "never" no menor detalhe faltando —
// mais seguro tipar os RESULTADOS das queries com as interfaces de
// lib/types.ts do que tentar imitar a saída de `supabase gen types` à mão.
// Ao rodar `supabase gen types typescript` no seu projeto, dá pra trazer de
// volta o genérico se quiser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
