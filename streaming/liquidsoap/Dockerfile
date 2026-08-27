# Constrói a partir da RAIZ do repositório (não desta pasta) porque este
# serviço roda o Liquidsoap E o playlist-sync juntos, no mesmo container —
# de propósito: o playlist-sync escreve um arquivo .m3u local que o
# Liquidsoap fica de olho (reload_mode="watch" em radio.liq), e serviços
# separados no Railway NÃO compartilham disco entre si. Rodar os dois no
# mesmo container é a forma mais simples de garantir que os dois enxergam o
# mesmo arquivo, sem precisar inventar um jeito de servir a playlist por
# HTTP só por causa disso.
#
# No Railway: aponte o "Dockerfile Path" pra streaming/liquidsoap/Dockerfile
# e deixe o "Root Directory" na raiz do repo.
FROM debian:bookworm-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      liquidsoap ca-certificates curl gnupg && \
    # Instalar Node.js 22 (Supabase JS exige Node 22+ para WebSocket nativo)
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*


WORKDIR /app
COPY streaming/liquidsoap/radio.liq /app/radio.liq
COPY apps/playlist-sync /app/playlist-sync
RUN cd /app/playlist-sync && npm install --omit=dev

COPY streaming/liquidsoap/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8005
ENTRYPOINT ["/entrypoint.sh"]
