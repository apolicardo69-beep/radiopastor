'use client';

import { usePlayer } from '@/lib/PlayerContext';

function getWhatsappLink(wa?: string): string | null {
  if (!wa) return null;
  const limpo = wa.replace(/\D/g, '');
  if (!limpo) return null;
  const numFinal = limpo.length <= 11 && !limpo.startsWith('55') ? `55${limpo}` : limpo;
  return `https://wa.me/${numFinal}`;
}

export default function ModalOuvintes() {
  const { ouvintesOnline, modalOuvintesAberto, setModalOuvintesAberto } = usePlayer();

  if (!modalOuvintesAberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-ouvintes-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
      onClick={() => setModalOuvintesAberto(false)}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-[#f7f1e6] p-5 shadow-2xl border border-[#d9c9a8] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#d9c9a8] pb-3 mb-3">
          <div>
            <h3 id="modal-ouvintes-title" className="text-sm font-extrabold text-[#2b2118] flex items-center gap-1.5">
              <span>👥</span> Ouvintes Conectados ({ouvintesOnline.length})
            </h3>
            <p className="text-[11px] text-[#7a6a52]">
              Pessoas conectadas à rádio em tempo real
            </p>
          </div>
          <button
            onClick={() => setModalOuvintesAberto(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b2118]/10 text-xs font-bold text-[#2b2118] hover:bg-[#2b2118]/20 transition active:scale-95"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 flex flex-col gap-2 pr-1">
          {ouvintesOnline.map((ouvinte, idx) => {
            const waLink = getWhatsappLink(ouvinte.whatsapp);
            return (
              <div
                key={ouvinte.client_id || idx}
                className="flex items-center justify-between gap-2.5 rounded-2xl bg-white p-3 shadow-xs border border-[#d9c9a8]/50"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2f6b4f]/10 text-base font-bold text-[#2f6b4f]">
                    {ouvinte.is_playing ? '🔊' : '🎧'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-[#2b2118]">
                        {ouvinte.name || 'Ouvinte Anônimo'}
                      </p>
                      {ouvinte.is_playing && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#2f6b4f]/15 px-1.5 py-0.5 text-[9px] font-extrabold text-[#2f6b4f]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2f6b4f] animate-pulse" />
                          Escutando
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-[#7a6a52]">
                      {ouvinte.whatsapp ? `📱 ${ouvinte.whatsapp}` : 'Sem WhatsApp'}
                    </p>
                  </div>
                </div>

                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-xl bg-[#25D366] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-[#1ebd5a] transition active:scale-95 flex items-center gap-1"
                  >
                    <span>💬</span>
                    <span>Conversar</span>
                  </a>
                )}
              </div>
            );
          })}

          {ouvintesOnline.length === 0 && (
            <div className="py-8 text-center text-xs text-[#a0937a]">
              <span className="text-2xl block mb-1">📻</span>
              Nenhum ouvinte conectado no momento.
            </div>
          )}
        </div>

        <button
          onClick={() => setModalOuvintesAberto(false)}
          className="mt-3 w-full rounded-2xl bg-[#2b2118] py-2.5 text-xs font-bold text-[#f7f1e6] shadow-sm hover:bg-[#1a140e] transition active:scale-95"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
