# iot-simulator/server

Servidor standalone que finge ser uma rede de medidores IoT reais publicando via MQTT, para exercitar o pipeline de ingestão do LumiTrack (backend) sem hardware. Broker MQTT embutido (via `aedes`) — não depende de nenhum broker externo.

## Como rodar

```bash
cp .env.example .env
npm install
npm run dev
```

Isso sobe:

- Broker MQTT embutido em `mqtt://localhost:1883` (`BROKER_PORT`)
- API de controle em `http://localhost:4100` (`API_PORT`)

## API de controle

Sem autenticação — **nunca exponha este servidor publicamente**, é uma ferramenta de desenvolvimento local.

```
GET/POST     /api/networks                 DELETE /api/networks/:id
GET/POST     /api/networks/:id/devices
PATCH/DELETE /api/devices/:id
POST         /api/devices/:id/power         { on: boolean }
POST         /api/devices/:id/anomaly       { multiplier?, durationSeconds? }
DELETE       /api/devices/:id/anomaly
GET          /api/status/stream             SSE — snapshot a cada mudança
GET          /api/broker/info               { host, port }
```

## Testando contra o LumiTrack real

1. Suba o simulador (`npm run dev`).
2. Crie uma rede e um device via `POST /api/networks` + `POST /api/networks/:id/devices` (anote o `topic`).
3. Ligue o device (`POST /api/devices/:id/power { "on": true }`).
4. No LumiTrack, crie um `Meter` com `protocol: MQTT`, `host: localhost`, `port: 1883` e o mesmo `topic`.
5. O `RealTimeCard` do LumiTrack deve atualizar ao vivo. `POST /api/devices/:id/anomaly` produz um pico de potência visível.
