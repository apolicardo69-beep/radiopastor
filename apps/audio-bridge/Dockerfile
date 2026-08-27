# Precisa do ffmpeg instalado no sistema (o pacote npm não inclui o
# binário) — é ele quem realmente mistura pastor + convidado e envia pro
# Icecast (ver rebuildFfmpeg() em server.mjs).
FROM node:20-bookworm-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.mjs ./

EXPOSE 9000

CMD ["node", "server.mjs"]
