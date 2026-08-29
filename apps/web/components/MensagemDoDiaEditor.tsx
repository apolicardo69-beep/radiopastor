'use client';

// Editor da "Palavra do Pastor" — bloco do ESTÚDIO (/locucao) onde o pastor
// escreve a mensagem do dia e decide se ela está no ar.
//
// Visual seguindo o padrão das outras seções do Estúdio: card branco de
// cantos 3xl, borda #d9c9a8, título em caixa alta cinza-quente e botão de
// ação em verde #2f6b4f. (O Estúdio é claro e quente de propósito — quem
// fica horas nele não aguenta tela escura.)
//
// É autossuficiente: basta colocar <MensagemDoDiaEditor /> em algum ponto da
// página. A prop `autorNome` é opcional — se você tiver o nome do pastor
// logado à mão, passe (ele aparece junto da mensagem no app do ouvinte); se
// não passar, a mensagem sai sem assinatura.
//
// Detalhe pensado pro uso real: se a mensagem estiver ativa mas tiver sido
// salva antes de hoje, aparece um aviso lembrando que os ouvintes ainda
// estão vendo a palavra de outro dia.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DailyMessage } from '@/lib/types';

const LIMITE_CARACTERES = 500;

function ehDeHoje(iso: string): boolean {
  const data = new Date(iso);
  const hoje = new Date();
  return (
    data.getDate() === hoje.getDate() &&
    data.getMonth() === hoje.getMonth() &&
    data.getFullYear() === hoje.getFullYear()
  );
}

function formatarQuando(iso: string): string {
  const data = new Date(iso);
  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return ehDeHoje(iso) ? `hoje às ${hora}` : `${dia} às ${hora}`;
}

export default function MensagemDoDiaEditor({ autorNome }: { autorNome?: string }) {
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Guarda o que está gravado no banco, pra saber se há alteração pendente.
  const [textoSalvo, setTextoSalvo] = useState('');
  const [ativoSalvo, setAtivoSalvo] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;

    async function carregar() {
      const { data, error } = await supabase
        .from('daily_message')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (!vivo) return;

      if (error) {
        setAviso({ tipo: 'erro', texto: 'Não consegui carregar a mensagem. Recarregue a página.' });
      } else if (data) {
        const m = data as DailyMessage;
        setTexto(m.content ?? '');
        setTextoSalvo(m.content ?? '');
        setAtivo(m.active);
        setAtivoSalvo(m.active);
        setSalvoEm(m.updated_at);
      }
      setCarregando(false);
    }
    carregar();

    return () => {
      vivo = false;
    };
  }, []);

  async function salvar() {
    setSalvando(true);
    setAviso(null);

    const supabase = createClient();
    const conteudo = texto.trim();
    const agora = new Date().toISOString();

    const { error } = await supabase
      .from('daily_message')
      .update({
        content: conteudo || null,
        active: ativo,
        author_name: autorNome ?? null,
        updated_at: agora,
      })
      .eq('id', 1);

    setSalvando(false);

    if (error) {
      setAviso({ tipo: 'erro', texto: 'Não consegui salvar. Verifique sua conexão e tente de novo.' });
      return;
    }

    setTextoSalvo(conteudo);
    setAtivoSalvo(ativo);
    setSalvoEm(agora);
    setAviso({
      tipo: 'ok',
      texto:
        ativo && conteudo
          ? 'Salvo — os ouvintes já estão vendo.'
          : 'Salvo — não está aparecendo pros ouvintes.',
    });
  }

  const temAlteracao = texto.trim() !== textoSalvo.trim() || ativo !== ativoSalvo;
  const noArDeOutroDia =
    ativoSalvo && textoSalvo.trim() !== '' && salvoEm !== null && !ehDeHoje(salvoEm);

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm border border-[#d9c9a8]/40">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#7a6a52] flex items-center gap-1.5">
            <span>📌</span> Palavra do Pastor
          </h2>
          <p className="text-[11px] text-[#a0937a]">
            Aparece fixada no topo do bate-papo, no app dos ouvintes.
          </p>
        </div>

        {salvoEm && !carregando && (
          <span className="shrink-0 rounded-md bg-[#f0e6d2] px-2 py-0.5 text-[10px] font-semibold text-[#7a6a52]">
            Salva {formatarQuando(salvoEm)}
          </span>
        )}
      </div>

      {noArDeOutroDia && (
        <p className="mb-3 rounded-xl bg-[#fdf4e3] p-2.5 text-[11px] font-semibold text-[#8a6d3b] border border-[#e0c98a]">
          ⚠️ Esta mensagem é de outro dia e continua no ar. Atualize o texto ou desligue o
          interruptor abaixo.
        </p>
      )}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_CARACTERES))}
        disabled={carregando || salvando}
        rows={4}
        placeholder="Escreva aqui a palavra de hoje para os ouvintes..."
        className="w-full resize-none rounded-xl border border-[#d9c9a8] bg-white px-3 py-2.5 text-xs font-semibold leading-relaxed text-[#2b2118] placeholder:text-[#a0937a] placeholder:font-normal focus:outline-none focus:border-[#2b2118] disabled:opacity-50"
      />

      <div className="mt-1 text-right text-[10px] text-[#a0937a]">
        {texto.length}/{LIMITE_CARACTERES}
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[#f0e6d2]/70 px-3.5 py-3">
        <span className="text-xs font-bold text-[#2b2118] flex items-center gap-1.5">
          <span>👁️</span> Mostrar aos ouvintes
        </span>
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          disabled={carregando || salvando}
          className="h-5 w-5 shrink-0 cursor-pointer accent-[#2f6b4f]"
        />
      </label>

      <button
        onClick={salvar}
        disabled={carregando || salvando || !temAlteracao}
        className="mt-3 w-full rounded-2xl bg-[#2f6b4f] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#255740] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#a0937a] disabled:hover:bg-[#a0937a]"
      >
        {salvando ? '⏳ Salvando...' : temAlteracao ? '💾 Salvar mensagem' : '✓ Tudo salvo'}
      </button>

      {aviso && (
        <p
          className={`mt-2.5 rounded-xl p-2.5 text-center text-[11px] font-semibold ${
            aviso.tipo === 'ok' ? 'bg-[#eaf3ec] text-[#2f6b4f]' : 'bg-[#fbeaea] text-[#b3261e]'
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
