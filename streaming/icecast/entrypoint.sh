#!/bin/sh
# Substitui as senhas placeholder do icecast.xml pelas variáveis de ambiente
# reais no momento em que o container sobe — assim as senhas de verdade só
# existem nas variáveis de ambiente do Railway, nunca no arquivo commitado
# no repositório.
set -e

CONFIG=/etc/icecast2/icecast.xml

sed -i \
  -e "s|CHANGE_ME_SOURCE_PASSWORD|${ICECAST_SOURCE_PASSWORD:?defina ICECAST_SOURCE_PASSWORD}|g" \
  -e "s|CHANGE_ME_RELAY_PASSWORD|${ICECAST_RELAY_PASSWORD:-$(head -c16 /dev/urandom | md5sum | cut -d' ' -f1)}|g" \
  -e "s|CHANGE_ME_ADMIN_PASSWORD|${ICECAST_ADMIN_PASSWORD:?defina ICECAST_ADMIN_PASSWORD}|g" \
  "$CONFIG"

if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
  sed -i "s|<hostname>localhost</hostname>|<hostname>${RAILWAY_PUBLIC_DOMAIN}</hostname>|" "$CONFIG"
fi

# Railway atribui uma porta dinâmica via $PORT — o Icecast precisa escutar nela.
if [ -n "$PORT" ]; then
  sed -i "s|<port>8000</port>|<port>${PORT}</port>|" "$CONFIG"
fi

exec icecast2 -c "$CONFIG"
