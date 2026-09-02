'use client';

// Histórico de mensagens dos ouvintes com filtros e moderação.
//
// ---------------------------------------------------------------------------
// DE ONDE VEM O TELEFONE AGORA
// ---------------------------------------------------------------------------
// Antes o número era pescado do próprio texto da mensagem com expressão
// regular, porque ele vinha grudado no nome ("Carlos 📱 77988720718"). Isso
// tinha dois problemas: acertava por acaso (qualquer número no meio de um
// pedido virava "telefone do ouvinte") e, principalmente, significava que o
// número estava visível pra todo mundo no bate-papo público.
//
// Agora o telefone vive em message_contacts, uma tabela que só pastor e
// moderador conseguem ler. Esta tela carrega esses contatos e liga cada um à
// sua mensagem — os ouvintes não têm como ver o número de ninguém.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { carregarSilenciados } from '@/lib/moderacao';
import ModeracaoMensagem from '@/components/ModeracaoMensagem';
import type { Message } from '@/lib/types';

export default function MensagensPage() {
  const supabase = createClient();
  const [mensagens, setMensagens] = useState<Message[]>([]);
  const [filtro, setFiltro] = useState<'todas' | 'pedidos'>('todas');

  // message_id -> telefone. Só chega preenchido pra quem está logado como
  // equipe; pro resto do mundo a consulta volta vazia por causa da RLS.
  const [contatos, setContatos] = useState<Record<string, string>>({});

  // client_id -> até quando está silenciado. Como message_contacts, só chega
  // preenchido pra equipe: a RLS de muted_listeners não devolve nada ao ouvinte.
  const [silenciados, setSilenciados] = useState<Record<string, string>>({});

  async function recarregarSilenciados() {
    setSilenciados(await carregarSilenciados(supabase));
  }

  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => data && setMensagens(data));

    // Carrega a lista de silenciados. O aviso do lint aqui é o mesmo padrão já
    // usado nas outras telas: a função é assíncrona, então o estado só muda
    // depois da resposta do banco, não durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recarregarSilenciados();

    supabase
      .from('message_contacts')
      .select('message_id, whatsapp')
      .then(({ data }) => {
        if (!data) return;
        const mapa: Record<string, string> = {};
        for (const c of data) mapa[c.message_id] = c.whatsapp;
        setContatos(mapa);
      });

    const channel = supabase
      .channel('locucao-mensagens')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => setMensagens((atual) => [payload.new as Message, ...atual])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) =>
          setMensagens((atual) =>
            atual.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
          )
      )
      // O contato entra logo depois da mensagem, em outra tabela. Sem escutar
      // aqui, o botão do WhatsApp só apareceria ao recarregar a página.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'muted_listeners' },
        () => recarregarSilenciados()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_contacts' },
        (payload) => {
          const c = payload.new as { message_id: string; whatsapp: string };
          setContatos((atual) => ({ ...atual, [c.message_id]: c.whatsapp }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getAudioUrl(storagePath?: string | null) {
    if (!storagePath) return '';
    const { data } = supabase.storage.from('mensagens-audio').getPublicUrl(storagePath);
    return data.publicUrl;
  }

  function linkWhatsapp(numero?: string): string | null {
    if (!numero) return null;
    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 8) return null;
    const completo = digitos.startsWith('55') ? digitos : `55${digitos}`;
    return `https://wa.me/${completo}?text=${encodeURIComponent(
      'A paz do Senhor! Recebi sua mensagem na Rádio Graça & Paz.'
    )}`;
  }

  async function marcarAtendido(m: Message) {
    await supabase.from('messages').update({ fulfilled: !m.fulfilled }).eq('id', m.id);
  }

  const visiveis = filtro === 'pedidos' ? mensagens.filter((m) => m.type === 'pedido') : mensagens;

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Filtros em abas tipo pílula */}
      <div className="flex gap-2">
        <button
          onClick={() => setFiltro('todas')}
          className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition active:scale-95 shadow-xs ${
            filtro === 'todas'
              ? 'bg-[#2b2118] text-[#f7f1e6]'
              : 'bg-white text-[#5c4a35] hover:bg-[#f0e6d2]'
          }`}
        >
          💬 Todas ({mensagens.length})
        </button>
        <button
          onClick={() => setFiltro('pedidos')}
          className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition active:scale-95 shadow-xs ${
            filtro === 'pedidos'
              ? 'bg-[#2b2118] text-[#f7f1e6]'
              : 'bg-white text-[#5c4a35] hover:bg-[#f0e6d2]'
          }`}
        >
          🎵 Pedidos de Louvor
        </button>
      </div>

      <ul className="flex flex-col gap-2.5">
        {visiveis.map((m) => {
          const telefone = contatos[m.id];
          const waLink = linkWhatsapp(telefone);
          return (
            <li
              key={m.id}
              className={`rounded-3xl p-4 shadow-sm border ${
                m.hidden
                  ? 'border-[#b3261e]/25 bg-[#fbeaea]/40'
                  : 'border-[#d9c9a8]/40 bg-white'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-[#2b2118]">{m.author_name}</span>
                  {m.is_guest && (
                    <span className="rounded-md bg-[#8a6d3b] px-1.5 py-0.5 text-[9px] font-bold text-white">
                      CONVIDADO
                    </span>
                  )}
                  {m.type === 'pedido' && (
                    <span className="rounded-md bg-[#c98a2c] px-1.5 py-0.5 text-[9px] font-bold text-white">
                      PEDIDO
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-[#25D366] px-2.5 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[#1ebd5a] transition active:scale-95 flex items-center gap-1"
                    >
                      <span>💬</span>
                      <span>WhatsApp</span>
                    </a>
                  )}
                  <span className="text-[10px] text-[#a0937a]">
                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* O número aparece só aqui, no Estúdio. Fica logo abaixo do nome
                  pra a equipe conseguir anotar ou ditar no ar sem precisar
                  abrir o WhatsApp. */}
              {telefone && (
                <p className="mb-1.5 text-[11px] font-semibold text-[#7a6a52]">📱 {telefone}</p>
              )}

              {m.kind === 'audio' ? (
                <div className="mt-1 flex flex-col gap-1 rounded-2xl bg-[#f7f1e6] p-2.5">
                  <span className="text-[11px] font-semibold text-[#7a6a52]">🎙️ Áudio do ouvinte:</span>
                  <audio
                    controls
                    preload="metadata"
                    src={getAudioUrl(m.audio_storage_path)}
                    className="h-9 w-full"
                  />
                </div>
              ) : (
                <p
                  className={`text-xs leading-relaxed ${
                    m.hidden ? 'text-[#a0937a] line-through' : 'text-[#2b2118]'
                  }`}
                >
                  {m.content}
                </p>
              )}

              {/* Moderação: ocultar do bate-papo público e silenciar quem
                  escreveu. Fica no fim do cartão pra não competir com o
                  conteúdo da mensagem. */}
              <div className="mt-2.5 border-t border-[#d9c9a8]/40 pt-2.5">
                <ModeracaoMensagem
                  mensagem={m}
                  silenciadoAte={silenciados[m.client_id]}
                  onMudou={recarregarSilenciados}
                />
              </div>

              {m.type === 'pedido' && (
                <button
                  onClick={() => marcarAtendido(m)}
                  className={`mt-2.5 flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                    m.fulfilled
                      ? 'bg-[#eaf3ec] text-[#2f6b4f]'
                      : 'bg-[#f0e6d2] text-[#5c4a35] hover:bg-[#e4d6be]'
                  }`}
                >
                  {m.fulfilled ? '✓ Pedido Atendido' : 'Marcar como Atendido'}
                </button>
              )}
            </li>
          );
        })}

        {visiveis.length === 0 && (
          <p className="py-12 text-center text-xs text-[#a0937a]">
            Nenhuma mensagem recebida ainda.
          </p>
        )}
      </ul>
    </div>
  );
}
