#!/usr/bin/env bash
# Entrypoint da imagem da demo pública (ADR-0010) — sobe iot-simulator e
# backend no mesmo container e encaminha os sinais corretamente.
#
# Por que isso não é um detalhe: o Render manda SIGTERM antes de hibernar o
# serviço. O graceful shutdown de backend/src/server.ts é quem persiste o
# minuto corrente do MinuteBuffer (scheduler.flushAll()) e fecha as conexões
# IoT. Um entrypoint que não encaminhasse o sinal deixaria o PID 1 morrer
# sozinho, o Docker mataria os filhos com SIGKILL, e cada hibernação perderia
# leituras já ingeridas — silenciosamente.
#
# Ordem de encerramento importa: o backend primeiro (precisa do broker do
# simulador vivo enquanto fecha as conexões MQTT), o simulador depois.

set -euo pipefail

BACKEND_ENTRY="/app/backend/dist/server.js"
SIMULATOR_ENTRY="/app/iot-simulator/server/dist/index.js"
SIMULATOR_API_PORT="${API_PORT:-4100}"
READINESS_TIMEOUT_SECONDS=30

log() {
    echo "[demo-entrypoint] $*"
}

log "Iniciando iot-simulator..."
node "$SIMULATOR_ENTRY" &
SIMULATOR_PID=$!

# O simulador só passa a responder em /health depois de o broker MQTT estar
# de pé (broker.start() é aguardado antes do app.listen, em
# iot-simulator/server/src/index.ts) — então /health é um sinal de prontidão
# confiável para o broker, não só para a API de controle.
#
# curl não existe na imagem node:*-slim; o próprio node faz a checagem.
simulator_is_ready() {
    node -e "
        require('http')
            .get('http://127.0.0.1:${SIMULATOR_API_PORT}/health', (res) => {
                process.exit(res.statusCode === 200 ? 0 : 1)
            })
            .on('error', () => process.exit(1))
    " >/dev/null 2>&1
}

log "Aguardando o broker MQTT do simulador ficar pronto..."
ready=false
for _ in $(seq 1 "$READINESS_TIMEOUT_SECONDS"); do
    if simulator_is_ready; then
        ready=true
        break
    fi
    sleep 1
done

if [ "$ready" = true ]; then
    log "Simulador pronto."
else
    # Falha aberta de propósito: a API REST é o produto, o dado ao vivo é
    # complemento. O cliente MQTT do backend reconecta sozinho quando o
    # broker subir, então subir o backend assim mesmo degrada a demo por
    # alguns segundos em vez de deixá-la fora do ar por inteiro.
    log "AVISO: simulador não respondeu em ${READINESS_TIMEOUT_SECONDS}s. Subindo o backend mesmo assim."
fi

log "Iniciando backend..."
node "$BACKEND_ENTRY" &
BACKEND_PID=$!

shutdown() {
    log "Sinal recebido. Encerrando backend (flush do MinuteBuffer)..."
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true

    log "Encerrando simulador..."
    kill -TERM "$SIMULATOR_PID" 2>/dev/null || true
    wait "$SIMULATOR_PID" 2>/dev/null || true

    log "Encerrado."
    exit 0
}

trap shutdown TERM INT

# Se qualquer um dos dois morrer por conta própria, encerra o outro e deixa
# o container cair — um backend vivo sem simulador (ou o inverso) seria uma
# demo meio funcionando, que é pior de diagnosticar que uma que reiniciou.
wait -n "$SIMULATOR_PID" "$BACKEND_PID"
log "Um dos processos terminou. Encerrando o container."
shutdown
