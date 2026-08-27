#!/usr/bin/liquidsoap
# =========================================================
# Console Graça & Paz — rádio 24h com fallback ao vivo
#
# A ideia central (e o maior risco técnico do projeto,
# validado aqui): duas fontes de áudio — a playlist e a
# entrada "ao vivo" — competem por atenção com fallback().
# Quando o audio-bridge conecta na entrada ao vivo (porque o
# pastor tocou "Ir ao Ar"), ela assume sozinha. Quando ele
# desconecta, a playlist volta sozinha, sem intervenção manual.
# =========================================================

settings.log.level.set(3)
settings.harbor.bind_addrs.set(["0.0.0.0"])
# Muitas imagens Docker (inclusive as usadas no Railway) rodam o processo
# como root por padrão. Se o seu ambiente já roda com um usuário próprio,
# pode remover esta linha.
settings.init.allow_root.set(true)

# ---- Variáveis de ambiente (troque em produção) ----
harbor_password = environment.get(default="CHANGE_ME_HARBOR_PASSWORD", "HARBOR_PASSWORD")
icecast_password = environment.get(default="CHANGE_ME_SOURCE_PASSWORD", "ICECAST_SOURCE_PASSWORD")
icecast_host = environment.get(default="localhost", "ICECAST_HOST")
icecast_port = int_of_string(environment.get(default="8000", "ICECAST_PORT"))

# ---- Fila de músicas ----
# O serviço `playlist-sync` (apps/playlist-sync) mantém esta pasta e este
# arquivo .m3u atualizados com o conteúdo da tabela `tracks` do Supabase,
# na ordem certa. O Liquidsoap só observa o arquivo e recarrega sozinho
# quando ele muda (reload_mode="watch") — não precisa reiniciar nada
# quando o pastor reordena ou adiciona uma música.
playlist_file = environment.get(default="/var/lib/radio-graca-paz/queue.m3u", "PLAYLIST_FILE")

radio_playlist =
  playlist(reload_mode="watch", playlist_file)
radio_playlist = mksafe(radio_playlist)

# ---- Entrada ao vivo (pastor e/ou convidado, já mixados) ----
# O audio-bridge se conecta aqui exatamente como uma fonte Icecast comum.

# buffer/max baixos de propósito: o padrão do Liquidsoap (12s de pré-buffer,
# pensado pra permitir crossfade) deixaria o pastor com uns 15-20s de atraso
# entre falar e o ouvinte escutar — inaceitável pra uma locução ao vivo.
# Testado neste protótipo: com esses valores, o atraso fica na casa de poucos
# segundos (a maior parte vem do lado do Icecast, ver icecast.xml).
live = input.harbor(
  "live",
  port=8005,
  password=harbor_password,
  buffer=1.5,
  max=4.,
  # padrão é 30s: se o processo do lado do audio-bridge morrer sem fechar a
  # conexão de forma limpa (visto na prática durante os testes), o harbor
  # segura o mountpoint "ocupado" por até esse tempo, recusando uma
  # reconexão do pastor logo em seguida. 5s é rápido o bastante pra o
  # ouvinte não notar e curto o bastante pra não travar uma nova tentativa.
  timeout=5.
)
# IMPORTANTE: NÃO envolver "live" com mksafe() aqui. mksafe() faz a fonte
# nunca "falhar" (ela passa a gerar silêncio sozinha quando não há conexão),
# o que faz o fallback() abaixo achar que "live" está sempre pronta e nunca
# mais voltar pra playlist depois que o pastor sai do ar. Só a última opção
# da lista (a playlist) deve ser "segura" desse jeito.

# fallback: usa a primeira fonte da lista que estiver "tocando" de verdade;
# track_sensitive=false quer dizer que a troca pode acontecer no meio de
# uma faixa (não precisa esperar a música atual acabar pra entrar ao vivo).
radio = fallback(track_sensitive=false, [live, radio_playlist])

output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/radio",
  name="Rádio Graça & Paz",
  description="24h na Palavra",
  genre="Religioso",
  radio
)
