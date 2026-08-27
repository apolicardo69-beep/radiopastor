#!/bin/bash
# Sobe o playlist-sync (escreve o .m3u local sempre que a tabela `tracks`
# do Supabase muda) e o Liquidsoap juntos, e mantém os dois de olho um no
# outro: se qualquer um dos dois cair, derruba o outro e sai — assim o
# Railway reinicia o serviço inteiro do zero, em vez de ficar rodando pela
# metade (por exemplo, tocando uma playlist que nunca mais atualiza porque
# o playlist-sync morreu silenciosamente) sem ninguém perceber.
node /app/playlist-sync/index.mjs &
PLAYLIST_PID=$!

liquidsoap /app/radio.liq &
LIQUIDSOAP_PID=$!

# SEM "set -e" aqui de propósito: "wait -n" retorna o código de saída do
# processo que terminou primeiro, e um processo morto por sinal (o caso
# normal quando a gente mesmo derruba o outro logo abaixo) conta como saída
# "com erro" pro bash — com set -e isso encerraria o script ANTES de
# chegar no kill de limpeza, deixando o outro processo órfão rodando pra
# sempre sem ninguém perceber (bug real, visto na prática ao testar isto).
wait -n "$PLAYLIST_PID" "$LIQUIDSOAP_PID"
kill "$PLAYLIST_PID" "$LIQUIDSOAP_PID" 2>/dev/null
wait
