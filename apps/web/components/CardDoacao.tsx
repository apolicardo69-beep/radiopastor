'use client';

// Card de doação do app do OUVINTE.
//
// Fica junto do card de patrocinador e abre uma janela com os dados do Pix:
// nome de quem recebe, a chave, e o código "copia e cola" pra pessoa colar
// direto no banco.
//
// ---------------------------------------------------------------------------
// PARA TROCAR OS DADOS DO PIX
// ---------------------------------------------------------------------------
// É só alterar as três constantes logo abaixo. O código copia e cola é montado
// aqui mesmo, na hora, a partir delas — não existe nenhum código fixo escrito
// à mão que possa ficar desatualizado.
//
// Cuidado com os limites do padrão do Banco Central: o nome aceita no máximo
// 25 caracteres e a cidade no máximo 15. Por isso "Vitória da Conquista" está
// abreviada — a cidade é só informativa, não muda pra onde o dinheiro vai.
// Use sem acentos: alguns bancos rejeitam caracteres acentuados.

import { useState } from 'react';

const PIX_CHAVE = '46643036534'; // CPF, só dígitos
const PIX_NOME = 'DANIEL FERREIRA SANTOS'; // máx 25
const PIX_CIDADE = 'VITORIA DA CONQ'; // máx 15

// ---------------------------------------------------------------------------
// Montagem do código Pix (padrão BR Code / EMV do Banco Central)
// ---------------------------------------------------------------------------
// Cada pedaço é "identificador + tamanho em 2 dígitos + conteúdo". No fim vai
// um dígito verificador (CRC16) calculado sobre tudo — é ele que faz o banco
// aceitar ou recusar o código.
function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, '0') + valor;
}

function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function montarCodigoPix(): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', PIX_CHAVE);

  const corpo =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') + // categoria do recebedor: não informada
    campo('53', '986') + // moeda: real
    campo('58', 'BR') +
    campo('59', PIX_NOME) +
    campo('60', PIX_CIDADE) +
    campo('62', campo('05', '***')); // sem identificador de cobrança

  // Sem valor definido de propósito: quem doa escolhe quanto dar.
  return corpo + '6304' + crc16(corpo + '6304');
}

// CPF fica mais fácil de conferir com a pontuação, mas o que a pessoa copia
// são só os dígitos — é o formato que todo banco aceita sem reclamar.
function formatarCpf(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export default function CardDoacao() {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState<'chave' | 'codigo' | null>(null);

  async function copiar(texto: string, qual: 'chave' | 'codigo') {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      // Navegador antigo ou sem permissão: o texto continua na tela pra
      // pessoa selecionar e copiar na mão.
      setCopiado(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="w-full text-left transition active:scale-98"
        aria-label="Fazer uma doação para a rádio"
      >
        <div className="relative overflow-hidden rounded-2xl border border-[#2f6b4f]/30 bg-gradient-to-br from-[#eaf3ec] via-[#f7f1e6] to-[#eaf3ec] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2f6b4f] text-xl text-white shadow-md">
              🤝
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#2f6b4f]">
                Contribua com a rádio
              </p>
              <h3 className="text-sm font-extrabold text-[#2b2118]">Faça sua doação</h3>
              <p className="text-[11px] leading-snug text-[#5c4a35]">
                Ajude a levar a Palavra a mais pessoas
              </p>
            </div>

            <span className="shrink-0 rounded-xl bg-[#2f6b4f] px-3 py-2 text-[11px] font-bold text-white shadow-sm">
              Doar
            </span>
          </div>
        </div>
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setAberto(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl border border-[#d9c9a8] bg-[#f7f1e6] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setAberto(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#2b2118]/10 text-sm font-bold text-[#2b2118] hover:bg-[#2b2118]/20"
            >
              ✕
            </button>

            <div className="mb-4 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2f6b4f] text-2xl text-white shadow-md">
                🤝
              </div>
              <h3 className="text-base font-extrabold text-[#2b2118]">Faça sua doação</h3>
              <p className="mt-1 text-[11px] leading-snug text-[#7a6a52]">
                Sua contribuição ajuda a manter a rádio no ar e a levar a Palavra a mais
                pessoas. Que Deus abençoe.
              </p>
            </div>

            {/* Dados de quem recebe */}
            <div className="mb-3 rounded-2xl border border-[#d9c9a8] bg-white p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a6a52]">
                Recebedor
              </p>
              <p className="text-sm font-bold text-[#2b2118]">Daniel Ferreira Santos</p>

              <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-[#7a6a52]">
                Chave Pix (CPF)
              </p>
              <p className="font-mono text-sm font-bold text-[#2b2118]">
                {formatarCpf(PIX_CHAVE)}
              </p>

              <button
                onClick={() => copiar(PIX_CHAVE, 'chave')}
                className="mt-2.5 w-full rounded-xl bg-[#f0e6d2] py-2 text-[11px] font-bold text-[#5c4a35] transition hover:bg-[#e4d6be] active:scale-95"
              >
                {copiado === 'chave' ? '✓ Chave copiada!' : '📋 Copiar chave Pix'}
              </button>
            </div>

            {/* Copia e cola */}
            <button
              onClick={() => copiar(montarCodigoPix(), 'codigo')}
              className="w-full rounded-2xl bg-[#2f6b4f] py-3.5 text-xs font-bold text-white shadow-md transition hover:bg-[#255740] active:scale-95"
            >
              {copiado === 'codigo' ? '✓ Código copiado!' : '💚 Copiar código Pix (copia e cola)'}
            </button>

            <p className="mt-2.5 text-center text-[10px] leading-snug text-[#a0937a]">
              Abra o aplicativo do seu banco, escolha Pix → Pix Copia e Cola, e cole o código.
              O valor é você quem escolhe.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
