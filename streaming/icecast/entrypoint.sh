#!/bin/sh
set -e

CONFIG=/etc/icecast2/icecast.xml

SOURCE_PW="${ICECAST_SOURCE_PASSWORD:-troque-esta-outra-senha}"
ADMIN_PW="${ICECAST_ADMIN_PASSWORD:-troque-esta-tambem}"
RELAY_PW="${ICECAST_RELAY_PASSWORD:-$(head -c16 /dev/urandom | md5sum | cut -d' ' -f1)}"

sed -i \
  -e "s|CHANGE_ME_SOURCE_PASSWORD|${SOURCE_PW}|g" \
  -e "s|CHANGE_ME_RELAY_PASSWORD|${RELAY_PW}|g" \
  -e "s|CHANGE_ME_ADMIN_PASSWORD|${ADMIN_PW}|g" \
  "$CONFIG"

if [ -n "$RAILWAY_PUBLIC_DOMAIN" ]; then
  sed -i "s|<hostname>localhost</hostname>|<hostname>${RAILWAY_PUBLIC_DOMAIN}</hostname>|" "$CONFIG"
fi

# Manter porta 8000 padrão configurada no Railway
sed -i "s|<port>.*</port>|<port>8000</port>|" "$CONFIG"

echo "Iniciando Icecast na porta 8000..."
exec icecast2 -c "$CONFIG"

