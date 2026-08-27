#!/usr/bin/env bash
# deploy/seed-simulator-devices.sh
#
# O iot-simulator/server não persiste estado entre reinícios — a cada boot
# do container `simulator`, a rede e os devices de demonstração precisam
# ser recriados via API para o painel voltar a mostrar dado vivo. Este
# script cria exatamente os 11 devices que casam com os tópicos fixos de
# backend/prisma/seed-demo/topology.ts, e liga todos.
#
# Os mesmos 11 devices (nome/tópico/perfil/params) de
# iot-simulator/server/src/simulation/demoBootstrap.ts (usado só no
# Caminho A, onde DEMO_BOOTSTRAP_ENABLED=true recria tudo em memória a
# cada boot) — aqui replicados via chamada HTTP porque no Caminho B
# (self-hosted) DEMO_BOOTSTRAP_ENABLED=false e a criação é só deste script,
# rodado uma vez. Se um lado mudar (topology.ts ganhar/perder medidor),
# os dois arquivos precisam mudar junto.
#
# As chamadas HTTP rodam via `fetch` nativo do Node (Node 18+, sem
# dependência extra) — a imagem `node:24-slim` do backend não tem `curl`
# instalado, e instalar um binário extra só para este script pontual não
# vale o aumento de superfície da imagem que roda o serviço o tempo todo.
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

# name|topic|profile|nominalVoltage|nominalPowerW|powerFactorBase|noiseAmplitudePercent
# Valores idênticos a DEMO_DEVICES em
# iot-simulator/server/src/simulation/demoBootstrap.ts — não reinventar
# calibração aqui, só espelhar. `|` como delimitador (não tab — heredoc
# entre bash e o script Node embutido não preserva `\t` de forma confiável).
DEVICES_LIST="Medidor Geral — Casa Demo|lumitrack/demo/residencial/geral|RESIDENTIAL_STEADY|220|3500|0.92|2
Sala de Estar|lumitrack/demo/residencial/sala|RESIDENTIAL_STEADY|220|900|0.93|2
Cozinha|lumitrack/demo/residencial/cozinha|RESIDENTIAL_STEADY|220|1900|0.9|3
Quarto Casal|lumitrack/demo/residencial/quarto-casal|RESIDENTIAL_STEADY|220|750|0.93|2
Banheiro — Chuveiro Elétrico|lumitrack/demo/residencial/banheiro|RESIDENTIAL_STEADY|220|4800|0.98|1
Área de Serviço|lumitrack/demo/residencial/area-servico|RESIDENTIAL_STEADY|220|1100|0.88|3
Medidor Geral — Metalúrgica Demo|lumitrack/demo/comercial/geral|INDUSTRIAL_MOTOR|380|19000|0.88|2
Administrativo|lumitrack/demo/comercial/administrativo|COMMERCIAL_HVAC|380|2200|0.92|2
Torno CNC|lumitrack/demo/comercial/torno-cnc|INDUSTRIAL_MOTOR|380|4800|0.85|2
Máquina de Solda MIG/MAG|lumitrack/demo/comercial/solda|INDUSTRIAL_MOTOR|380|3600|0.8|4
Compressor de Ar Industrial|lumitrack/demo/comercial/compressor|INDUSTRIAL_MOTOR|380|7800|0.86|1"

# Node roda DENTRO do container backend via stdin (evita qualquer problema
# de escaping entre bash local → ssh → docker compose exec → sh -c). O
# token e a lista de devices chegam por variável de ambiente, nunca
# interpolados como texto no script.
DEVICES_LIST="$DEVICES_LIST" SIMULATOR_API_TOKEN="$SIMULATOR_API_TOKEN" \
    docker compose exec -T \
    -e DEVICES_LIST -e SIMULATOR_API_TOKEN \
    backend node <<'NODE_SCRIPT'
const API = "http://127.0.0.1:4100"
const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SIMULATOR_API_TOKEN}`,
}

async function main() {
    console.log("==> Criando rede 'Demo'...")
    const networkRes = await fetch(`${API}/api/networks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Demo" }),
    })
    if (!networkRes.ok) {
        throw new Error(`Falha ao criar a rede (HTTP ${networkRes.status}) — confira se o serviço 'simulator' está de pé.`)
    }
    const network = await networkRes.json()
    console.log(`==> Rede criada: ${network.id}`)

    const rows = process.env.DEVICES_LIST.trim().split("\n")
    for (const row of rows) {
        const [name, topic, profile, nominalVoltage, nominalPowerW, powerFactorBase, noiseAmplitudePercent] =
            row.split("|")
        console.log(`==> Criando device '${name}' (${topic}, perfil ${profile})...`)

        const deviceRes = await fetch(`${API}/api/networks/${network.id}/devices`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                name,
                topic,
                params: {
                    profile,
                    nominalVoltage: Number(nominalVoltage),
                    nominalPowerW: Number(nominalPowerW),
                    powerFactorBase: Number(powerFactorBase),
                    noiseAmplitudePercent: Number(noiseAmplitudePercent),
                },
            }),
        })
        if (!deviceRes.ok) {
            throw new Error(`Falha ao criar o device '${name}' (HTTP ${deviceRes.status}).`)
        }
        const device = await deviceRes.json()

        console.log(`    -> ligando device ${device.id}`)
        const powerRes = await fetch(`${API}/api/devices/${device.id}/power`, {
            method: "POST",
            headers,
            body: JSON.stringify({ on: true }),
        })
        if (!powerRes.ok) {
            throw new Error(`Falha ao ligar o device '${name}' (HTTP ${powerRes.status}).`)
        }
    }

    console.log("==> Concluído. Verifique no painel do LumiTrack se os 11 medidores mostram potência ao vivo via SSE.")
}

main().catch((err) => {
    console.error(err.message)
    process.exit(1)
})
NODE_SCRIPT
