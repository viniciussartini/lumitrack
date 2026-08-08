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

`API_HOST`/`BROKER_HOST` escutam por padrão só em `127.0.0.1` — **nunca exponha este servidor publicamente**, é uma ferramenta de desenvolvimento local (issue #180).

`/api/networks` e `/api/devices` exigem o header `Authorization: Bearer $SIMULATOR_API_TOKEN` (env obrigatória, sem default). `/api/broker/info`, `/api/status/stream` e `/health` continuam sem token — o primeiro só expõe host/port já públicos por design, e `/api/status/stream` é consumido via `EventSource` nativo do browser, que não permite headers customizados.

```text
GET/POST     /api/networks                 DELETE /api/networks/:id      } exigem Authorization: Bearer <token>
GET/POST     /api/networks/:id/devices                                   }
PATCH/DELETE /api/devices/:id                                            }
POST         /api/devices/:id/power         { on: boolean }              }
POST         /api/devices/:id/anomaly       { multiplier?, durationSeconds? } }
DELETE       /api/devices/:id/anomaly                                    }
GET          /api/status/stream             SSE — snapshot a cada mudança
GET          /api/broker/info               { host, port }
```

O broker MQTT embutido também exige credenciais (`BROKER_USERNAME`/`BROKER_PASSWORD`, env obrigatórias) via hook `authenticate` do Aedes — qualquer cliente (inclusive o publisher interno da própria simulação) precisa se conectar com esse par para publicar/assinar.

## Testando contra o LumiTrack real

1. Configure `.env` (`cp .env.example .env`) e anote `SIMULATOR_API_TOKEN`/`BROKER_USERNAME`/`BROKER_PASSWORD`.
2. Suba o simulador (`npm run dev`).
3. Crie uma rede e um device via `POST /api/networks` + `POST /api/networks/:id/devices` (com o header `Authorization: Bearer $SIMULATOR_API_TOKEN`; anote o `topic`).
4. Ligue o device (`POST /api/devices/:id/power { "on": true }`).
5. No LumiTrack, crie um `Meter` com `protocol: MQTT`, `host: localhost`, `port: 1883`, o mesmo `topic`, e `extra: { username, password }` com as mesmas credenciais do broker.
6. O `RealTimeCard` do LumiTrack deve atualizar ao vivo. `POST /api/devices/:id/anomaly` produz um pico de potência visível.
