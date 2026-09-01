'use client';

// Editor da "Palavra do Pastor" — bloco do ESTÚDIO (/locucao) onde o pastor
// escreve OU grava a mensagem do dia e decide se ela está no ar.
//
// Texto e áudio são independentes: pode ter só um, ou os dois juntos. Gravar
// existe porque digitar todo dia é a parte difícil pra quem não tem facilidade
// com tecnologia — falando, ele resolve em 20 segundos.
//
// Visual seguindo o padrão das outras seções do Estúdio: card branco de
// cantos 3xl, borda #d9c9a8, título em caixa alta cinza-quente e botão de
// ação em verde #2f6b4f.
//
// É autossuficiente: basta colocar <MensagemDoDiaEditor /> em algum ponto da
// página. A prop `autorNome` é opcional — se você tiver o nome do pastor
// logado à mão, passe; se não passar, a mensagem sai sem assinatura.

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DailyMessage } from '@/lib/types';

const LIMITE_CARACTERES = 500;

// Mesmo bucket do áudio do bate-papo — já existe e já é público na leitura.
const BUCKET_AUDIO = 'mensagens-audio';

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

  // O que está gravado no banco, pra saber se há alteração pendente.
  const [textoSalvo, setTextoSalvo] = useState('');
  const [ativoSalvo, setAtivoSalvo] = useState(false);
  const [audioSalvo, setAudioSalvo] = useState<string | null>(null);

  // Áudio em edição (pode ser o mesmo do banco ou uma gravação nova)
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [enviandoAudio, setEnviandoAudio] = useState(false);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        setAudioPath(m.audio_storage_path ?? null);
        setAudioSalvo(m.audio_storage_path ?? null);
        setSalvoEm(m.updated_at);
      }
      setCarregando(false);
    }
    carregar();

    return () => {
      vivo = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function urlDoAudio(path: string): string {
    const supabase = createClient();
    const { data } = supabase.storage.from(BUCKET_AUDIO).getPublicUrl(path);
    return data.publicUrl;
  }

  // -------------------------------------------------------------------------
  // Gravação
  // -------------------------------------------------------------------------
  async function iniciarGravacao() {
    setAviso(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setAviso({ tipo: 'erro', texto: 'Este navegador não grava áudio. Use o Chrome.' });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAviso({ tipo: 'erro', texto: 'Permita o acesso ao microfone para gravar.' });
      return;
    }

    // O Safari do iPhone não grava webm; por isso testamos os formatos em
    // ordem e usamos o primeiro que o aparelho aceitar.
    let opcoes: MediaRecorderOptions = {};
    if (typeof MediaRecorder?.isTypeSupported === 'function') {
      for (const tipo of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
        if (MediaRecorder.isTypeSupported(tipo)) {
          opcoes = { mimeType: tipo };
          break;
        }
      }
    }

    let gravador: MediaRecorder;
    try {
      gravador = new MediaRecorder(stream, opcoes);
    } catch {
      gravador = new MediaRecorder(stream);
    }

    pedacosRef.current = [];
    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };
    gravador.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = gravador.mimeType || 'audio/webm';
      const blob = new Blob(pedacosRef.current, { type: mime });
      if (blob.size === 0) {
        setAviso({ tipo: 'erro', texto: 'Gravação vazia. Segure mais tempo antes de concluir.' });
        return;
      }
      await enviarAudio(blob, mime);
    };

    gravador.start();
    gravadorRef.current = gravador;
    setGravando(true);
    setSegundos(0);
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
  }

  function concluirGravacao() {
    if (timerRef.current) clearInterval(timerRef.current);
    gravadorRef.current?.stop();
    setGravando(false);
  }

  function cancelarGravacao() {
    if (timerRef.current) clearInterval(timerRef.current);
    const g = gravadorRef.current;
    if (g && g.state !== 'inactive') {
      g.onstop = null; // descarta: não envia nada
      g.stop();
      g.stream.getTracks().forEach((t) => t.stop());
    }
    setGravando(false);
    setSegundos(0);
  }

  async function enviarAudio(blob: Blob, mime: string) {
    setEnviandoAudio(true);
    try {
      const supabase = createClient();
      const ext = mime.includes('mp4') ? 'mp4' : mime.includes('aac') ? 'aac' : 'webm';
      const caminho = `palavra-do-pastor/${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET_AUDIO)
        .upload(caminho, blob, { contentType: mime });

      if (error) throw new Error(error.message);

      // Se havia uma gravação nova ainda não salva, ela vira lixo agora.
      await apagarSeForRascunho(audioPath);

      setAudioPath(caminho);
      setAviso({ tipo: 'ok', texto: 'Áudio gravado. Confira e clique em salvar.' });
    } catch (e) {
      setAviso({
        tipo: 'erro',
        texto: 'Não consegui enviar o áudio: ' + (e instanceof Error ? e.message : 'tente de novo'),
      });
    } finally {
      setEnviandoAudio(false);
      setSegundos(0);
    }
  }

  // Só apaga arquivo que foi gravado agora e ainda não está no banco — nunca
  // o que já está no ar, senão a mensagem publicada ficaria sem áudio.
  async function apagarSeForRascunho(path: string | null) {
    if (!path || path === audioSalvo) return;
    try {
      const supabase = createClient();
      await supabase.storage.from(BUCKET_AUDIO).remove([path]);
    } catch {
      // arquivo órfão não quebra nada; seguimos
    }
  }

  async function removerAudio() {
    await apagarSeForRascunho(audioPath);
    setAudioPath(null);
  }

  // -------------------------------------------------------------------------
  // Salvar
  // -------------------------------------------------------------------------
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
        audio_storage_path: audioPath,
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
    setAudioSalvo(audioPath);
    setSalvoEm(agora);
    setAviso({
      tipo: 'ok',
      texto:
        ativo && (conteudo || audioPath)
          ? 'Salvo — os ouvintes já estão vendo.'
          : 'Salvo — não está aparecendo pros ouvintes.',
    });
  }

  const temConteudo = texto.trim() !== '' || audioPath !== null;
  const temAlteracao =
    texto.trim() !== textoSalvo.trim() || ativo !== ativoSalvo || audioPath !== audioSalvo;
  const noArDeOutroDia =
    ativoSalvo &&
    (textoSalvo.trim() !== '' || audioSalvo !== null) &&
    salvoEm !== null &&
    !ehDeHoje(salvoEm);

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
          ⚠️ Esta mensagem é de outro dia e continua no ar. Atualize ou desligue o interruptor
          abaixo.
        </p>
      )}

      {/* ---------------- Áudio ---------------- */}
      <div className="mb-3 rounded-2xl border border-[#d9c9a8]/60 bg-[#f7f1e6]/60 p-3">
        <p className="mb-2 text-[11px] font-bold text-[#2b2118] flex items-center gap-1.5">
          <span>🎤</span> Gravar a palavra de hoje
        </p>

        {gravando ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#b3261e]/10 p-2 border border-[#b3261e]/20">
            <span className="flex items-center gap-2 pl-1 text-xs font-bold text-[#b3261e]">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b3261e] opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#b3261e]" />
              </span>
              Gravando {segundos}s
            </span>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelarGravacao}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#7a6a52] transition hover:bg-gray-100 active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={concluirGravacao}
                className="rounded-xl bg-[#b3261e] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#8f1e17] active:scale-95"
              >
                ✓ Concluir
              </button>
            </span>
          </div>
        ) : enviandoAudio ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-[#f0e6d2] p-2.5 text-xs font-bold text-[#5c4a35]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Enviando gravação...
          </p>
        ) : audioPath ? (
          <div className="flex flex-col gap-2">
            <audio controls src={urlDoAudio(audioPath)} preload="metadata" className="h-9 w-full" />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={iniciarGravacao}
                className="flex-1 rounded-xl bg-[#2b2118] py-2 text-[11px] font-bold text-[#f7f1e6] transition active:scale-95"
              >
                🎤 Regravar
              </button>
              <button
                type="button"
                onClick={removerAudio}
                className="rounded-xl bg-[#b3261e]/10 px-3 py-2 text-[11px] font-bold text-[#b3261e] transition hover:bg-[#b3261e]/20 active:scale-95"
              >
                Remover
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={iniciarGravacao}
            disabled={carregando || salvando}
            className="w-full rounded-xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-xs transition hover:bg-[#1a140e] active:scale-95 disabled:opacity-50"
          >
            🎤 Gravar áudio
          </button>
        )}
      </div>

      {/* ---------------- Texto ---------------- */}
      <p className="mb-1.5 text-[11px] font-bold text-[#2b2118] flex items-center gap-1.5">
        <span>✍️</span> Ou escreva (pode usar os dois)
      </p>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_CARACTERES))}
        disabled={carregando || salvando}
        rows={3}
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

      {ativo && !temConteudo && (
        <p className="mt-2 text-center text-[10px] text-[#a0937a]">
          Grave um áudio ou escreva algo — sem conteúdo, nada aparece pros ouvintes.
        </p>
      )}

      <button
        onClick={salvar}
        disabled={carregando || salvando || gravando || enviandoAudio || !temAlteracao}
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
