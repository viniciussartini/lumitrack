#!/usr/bin/env bash
# deploy/seed-simulator-devices.sh — Fase 13.5 Bloco A, issue #193.
#
# O iot-simulator/server não persiste estado entre reinícios — a cada boot
# do container `simulator`, a rede e os 4 devices de demonstração precisam
# ser recriados via API para o painel voltar a mostrar dado vivo. Este
# script cria exatamente os 4 devices que casam com os tópicos fixos de
# backend/prisma/seed-demo/topology.ts, e liga todos.
#
# Roda de DENTRO do container `backend` (docker compose exec) porque
# `simulator` usa `network_mode: "service:backend"` — a API do simulador
# (porta 4100) só é alcançável em 127.0.0.1 a partir desse container, nunca
# do host (ver docker-compose.yml e ADR-0008).
#
# Requer SIMULATOR_API_TOKEN, BROKER_USERNAME, BROKER_PASSWORD já presentes
# em iot-simulator/server/.env (mesmos valores usados no db:seed:demo do
# backend, via SIMULATOR_BROKER_USERNAME/PASSWORD — ver backend/.env.example).
#
# Uso: ./deploy/seed-simulator-devices.sh
# Pré-requisito: `docker compose exec backend npm run db:seed:demo` já rodou.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# shellcheck disable=SC1091
set -a && source iot-simulator/server/.env && set +a

if [ -z "${SIMULATOR_API_TOKEN:-}" ]; then
    echo "SIMULATOR_API_TOKEN não configurado em iot-simulator/server/.env — abortando." >&2
    exit 1
fi

API="http://127.0.0.1:4100"
AUTH_HEADER="Authorization: Bearer $SIMULATOR_API_TOKEN"

exec_backend() {
    docker compose exec -T backend sh -c "$1"
}

echo "==> Criando rede 'Demo'..."
NETWORK_ID=$(exec_backend "curl -sf -X POST $API/api/networks \
    -H 'Content-Type: application/json' -H '$AUTH_HEADER' \
    -d '{\"name\":\"Demo\"}'" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id" 2>/dev/null || true)

if [ -z "$NETWORK_ID" ]; then
    echo "Falha ao criar a rede — confira se o serviço 'simulator' está de pé (docker compose ps)." >&2
    exit 1
fi

echo "==> Rede criada: $NETWORK_ID"

# name|topic|profile — tópicos batem 1:1 com backend/prisma/seed-demo/topology.ts.
# Profile é aproximado (dado vivo plausível, não medição real) — ajustável.
DEVICES=(
    "Medidor Geral (Residencial)|lumitrack/demo/residencial/geral|RESIDENTIAL_STEADY"
    "Medidor Geral (Comercial)|lumitrack/demo/comercial/geral|COMMERCIAL_HVAC"
    "Medidor Área de Vendas|lumitrack/demo/comercial/vendas|COMMERCIAL_HVAC"
    "Medidor Forno|lumitrack/demo/comercial/forno|INDUSTRIAL_MOTOR"
)

for entry in "${DEVICES[@]}"; do
    IFS='|' read -r name topic profile <<<"$entry"
    echo "==> Criando device '$name' ($topic, perfil $profile)..."

    DEVICE_ID=$(exec_backend "curl -sf -X POST $API/api/networks/$NETWORK_ID/devices \
        -H 'Content-Type: application/json' -H '$AUTH_HEADER' \
        -d '{\"name\":\"$name\",\"topic\":\"$topic\",\"params\":{\"profile\":\"$profile\"}}'" \
        | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")

    echo "    -> ligando device $DEVICE_ID"
    exec_backend "curl -sf -X POST $API/api/devices/$DEVICE_ID/power \
        -H 'Content-Type: application/json' -H '$AUTH_HEADER' \
        -d '{\"on\":true}'" >/dev/null
done

echo "==> Concluído. Verifique no painel do LumiTrack se os 4 medidores mostram potência ao vivo via SSE."
