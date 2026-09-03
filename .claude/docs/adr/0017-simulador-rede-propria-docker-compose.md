# ADR-0017 — Simulador com rede própria no Docker Compose (revisa a co-localização de rede da ADR-0008)

- **Data:** 2026-08-29
- **Status:** aceita
- **Branch/Issue relacionada:** issue #255, Fase 16 do roadmap
- **Relação com outras ADRs:** revisa especificamente o item 3 ("Simulador IoT co-locado, com o broker MQTT em `127.0.0.1`") e os Gates de go-live 3/4 da [ADR-0008](0008-hospedagem-brasil-oracle-always-free.md) — o racional de hospedagem geral (VM única, sem operador estrangeiro) da ADR-0008 continua valendo, inclusive sob a VPS Hostinger da [ADR-0012](0012-separacao-producao-vps-staging-render-neon.md). Não afeta o Caminho A (Render, ADR-0010), onde backend e simulador rodam no mesmo processo/container, sem Docker Compose.

## Contexto

O `docker-compose.yml` de produção (Caminho B, VPS) configurava o serviço `simulator` com `network_mode: "service:backend"` — ele compartilhava o namespace de rede do container `backend` em vez de ter o seu próprio, para que o backend falasse com o broker MQTT do simulador em `localhost:1883` sem publicar essa porta.

A execução real da Fase 13.7 (VPS Hostinger, 2026-08-23) expôs dois custos operacionais recorrentes dessa amarração (issue #255):

1. **Qualquer reinício do `backend`** — mesmo um `docker compose restart backend` simples, sem `--force-recreate` — quebra a rede compartilhada do `simulator`, porque `network_mode: service:backend` é resolvido uma única vez, no instante em que o `simulator` liga, e não se atualiza dinamicamente quando o `backend` muda. A única recuperação confiável era recriar os dois **juntos**, o que apaga a lista de medidores do simulador (estado só em memória) e exige rodar `deploy/seed-simulator-devices.sh` de novo — documentado como "o ponto mais frágil de todo o processo" no `DEPLOY.md`.
2. **`IOT_ALLOWED_HOSTS` precisava incluir `localhost` como hostname** (não só `127.0.0.1/32`), porque dentro do namespace compartilhado "localhost" resolve para IPv4 e IPv6, e um CIDR só de IPv4 deixava o `::1` de fora — a checagem de SSRF (issue #150) negava a conexão. Funcionava, mas era uma exceção de loopback num guard desenhado para negar por padrão.

## Decisão

**O `simulator` passa a ter rede própria** — a mesma `lumitrack_default` que os demais serviços do compose já usam, sem `network_mode` especial. Consequências diretas:

- `backend` e `simulator` viram containers independentes no plano de rede: reiniciar um não afeta o alcance de rede do outro. Isso elimina o modo de falha #1 por completo.
- O `backend` passa a alcançar a API (4100) e o broker MQTT (1883) do simulador pelo **hostname do serviço Docker**, `simulator`, via DNS interno do compose — não mais `localhost`.
- O broker/API do simulador (`aedes`/Express) precisam escutar em `0.0.0.0` dentro do próprio container (`BROKER_HOST`/`API_HOST` em `iot-simulator/server/.env`) para serem alcançáveis por outro container da mesma rede — `127.0.0.1` só seria alcançável pelo próprio container do simulador. Isso **não** expõe a porta ao host nem à internet: nenhum `ports:` é publicado para este serviço no `docker-compose.yml`, então só outros containers da rede interna do compose chegam nele — mesma superfície de exposição de antes, só que via rede própria em vez de namespace compartilhado.
- `backend/prisma/seed-demo/topology.ts` (`DEMO_METER_HOST`) e `IOT_ALLOWED_HOSTS` (`backend/.env`) passam a usar `simulator` em vez de `localhost` — elimina o modo de falha #2: `simulator` casa por comparação textual de hostname, antes de qualquer resolução de DNS, sem precisar cobrir IPv4/IPv6 separadamente.
- `deploy/seed-simulator-devices.sh` passa a chamar `http://simulator:4100` em vez de `http://127.0.0.1:4100`.

## Alternativas consideradas

- **Manter `network_mode: service:backend` e documentar melhor o procedimento de restart conjunto** — descartada: o problema já estava bem documentado (o próprio `DEPLOY.md` tinha um aviso extenso), e a fragilidade persistia mesmo assim — documentação não corrige uma amarração de infraestrutura frágil por desenho.
- **Publicar as portas do simulador no host e apontar o backend para o IP da VM** — descartada: reintroduziria exposição desnecessária (a API de controle e o broker ficariam alcançáveis de fora do compose), contrariando o princípio de rede interna já estabelecido para os demais serviços (postgres, backend).

## Consequências

**Positivas**

- Reiniciar o `backend` isoladamente (para reler `.env`, aplicar atualização) deixa de exigir recriar o `simulator` junto — simplifica os passos 7.6 e 8 do `DEPLOY.md` (que perdem uma etapa cada) e elimina a exigência de rodar `seed-simulator-devices.sh` novamente depois de um restart que só tocou o `backend`.
- `IOT_ALLOWED_HOSTS`/`DEMO_METER_HOST` deixam de depender do caso especial "localhost resolve IPv4+IPv6" — um hostname de serviço Docker normal, sem exceção.
- Topologia de rede mais legível: cada serviço no compose segue o mesmo padrão (rede própria, sem `ports:` publicado salvo Caddy/Kuma), sem uma exceção só para o simulador.

**Negativas/custos**

- `BROKER_HOST`/`API_HOST` precisam ser `0.0.0.0` em produção — um desvio a mais do `.env.example` (pensado para rodar fora de container) que quem faz o deploy precisa lembrar de aplicar; documentado no `DEPLOY.md` e no próprio `.env.example`.
- Três arquivos adicionais (`topology.ts`, `backend/.env.example`, `deploy/seed-simulator-devices.sh`) passam a ter um valor de host diferente por ambiente (local vs. VPS) — mitigado por env var com default local seguro (`DEMO_METER_HOST` vazio → `"localhost"`).
