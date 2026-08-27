# Imagem própria (em vez da imagem oficial do Icecast) porque este
# Dockerfile espelha exatamente o ambiente onde o icecast.xml já foi testado
# de verdade (Debian/Ubuntu com o pacote `icecast2` do apt, rodando como
# root com <changeowner> pra icecast2/icecast — ver os comentários em
# icecast.xml). Trocar pra imagem oficial exigiria remover esse bloco e
# revalidar; melhor manter igual ao que já foi validado.
FROM debian:bookworm-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends icecast2 && \
    rm -rf /var/lib/apt/lists/*

COPY streaming/icecast/icecast.xml /etc/icecast2/icecast.xml
COPY streaming/icecast/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

# Sem "-b" (que roda em segundo plano) — no Docker o processo precisa ficar
# em primeiro plano, senão o container encerra na hora. As senhas reais
# entram via variáveis de ambiente e são gravadas no config só na hora de
# subir (ver entrypoint.sh) — nunca ficam no arquivo commitado.
ENTRYPOINT ["/entrypoint.sh"]
