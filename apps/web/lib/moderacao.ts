'use client';

// Moderação do bate-papo — a lógica compartilhada entre as duas telas do
// Estúdio (o painel ao vivo e a aba Mensagens) e o app do ouvinte.
//
// ---------------------------------------------------------------------------
// POR QUE EXISTE UM "AVISO" ALÉM DA MARCA NO BANCO
// ---------------------------------------------------------------------------
// Ocultar uma mensagem é um UPDATE que liga `hidden`. A RLS cuida do resto: a
// partir daí o ouvinte não consegue mais ler aquela linha.
//
// Só que isso cria um efeito colateral silencioso. O app do ouvinte escuta as
// mudanças da tabela em tempo real, e o Realtime respeita a RLS — então, no
// instante em que a linha deixa de ser visível pra ele, ele simplesmente NÃO
// recebe evento nenhum. A mensagem ofensiva continuaria na tela de quem está
// com o app aberto até a pessoa recarregar.
//
// Por isso, junto do UPDATE, o Estúdio manda um aviso por um canal de
// transmissão: "apaguem a mensagem tal". O aviso carrega só o id — nada do
// conteúdo — e serve para o app limpar a tela na hora.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const CANAL_MODERACAO = 'moderacao-chat';
export const EVENTO_OCULTAR = 'ocultar';
export const EVENTO_MOSTRAR = 'mostrar';

// Opções de duração oferecidas ao pastor. Curtas de propósito: silenciar é
// pra esfriar o ânimo de alguém no meio do culto, não pra banir.
export const DURACOES_SILENCIO = [
  { horas: 1, rotulo: '1 hora' },
  { horas: 6, rotulo: '6 horas' },
  { horas: 24, rotulo: '1 dia' },
  { horas: 24 * 7, rotulo: '1 semana' },
];

// Um canal só, criado na primeira necessidade e reaproveitado. Assinar é
// obrigatório antes de enviar: um canal não assinado descarta o envio em
// silêncio, e a mensagem ficaria na tela dos ouvintes sem ninguém perceber.
let canal: RealtimeChannel | null = null;
let canalPronto = false;

function obterCanal(supabase: SupabaseClient): RealtimeChannel {
  if (!canal) {
    canal = supabase.channel(CANAL_MODERACAO);
    canal.subscribe((status) => {
      canalPronto = status === 'SUBSCRIBED';
    });
  }
  return canal;
}

async function avisar(supabase: SupabaseClient, evento: string, id: string) {
  const c = obterCanal(supabase);
  // Se o canal ainda está conectando, espera um pouco. É melhor esperar meio
  // segundo do que o aviso se perder e a mensagem continuar na tela de todo
  // mundo até recarregarem.
  for (let i = 0; i < 20 && !canalPronto; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    await c.send({ type: 'broadcast', event: evento, payload: { id } });
  } catch {
    // O aviso é uma cortesia: mesmo se falhar, a mensagem já está oculta no
    // banco e some para quem abrir o app depois.
  }
}

export async function ocultarMensagem(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from('messages')
    .update({ hidden: true, hidden_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { erro: error.message };
  await avisar(supabase, EVENTO_OCULTAR, id);
  return {};
}

export async function mostrarMensagem(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from('messages')
    .update({ hidden: false, hidden_at: null })
    .eq('id', id);
  if (error) return { erro: error.message };
  await avisar(supabase, EVENTO_MOSTRAR, id);
  return {};
}

export async function silenciarOuvinte(
  supabase: SupabaseClient,
  clientId: string,
  horas: number
) {
  const until = new Date(Date.now() + horas * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from('muted_listeners')
    .upsert({ client_id: clientId, until }, { onConflict: 'client_id' });
  return error ? { erro: error.message } : {};
}

export async function liberarOuvinte(supabase: SupabaseClient, clientId: string) {
  const { error } = await supabase.from('muted_listeners').delete().eq('client_id', clientId);
  return error ? { erro: error.message } : {};
}

// Quem está silenciado agora. A RLS só devolve isto para a equipe.
export async function carregarSilenciados(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('muted_listeners')
    .select('client_id, until')
    .gt('until', new Date().toISOString());
  const mapa: Record<string, string> = {};
  for (const linha of data || []) mapa[linha.client_id] = linha.until;
  return mapa;
}

export function textoRestante(until: string): string {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'liberado';
  const horas = Math.ceil(ms / 3600000);
  if (horas < 24) return `${horas}h restante${horas > 1 ? 's' : ''}`;
  const dias = Math.ceil(horas / 24);
  return `${dias} dia${dias > 1 ? 's' : ''} restante${dias > 1 ? 's' : ''}`;
}
