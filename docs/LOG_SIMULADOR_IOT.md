# Log de implementação — Simulador IoT e seed de demonstração

> Registro cronológico do que foi executado em cada fase do [PLANO_SIMULADOR_IOT_E_SEED_DEMO.md](./PLANO_SIMULADOR_IOT_E_SEED_DEMO.md), incluindo desvios do plano original e decisões tomadas durante a implementação. Branch: `feat/demo-environment`. O texto de commit não fica neste arquivo — é dado na conversa, um por sub-issue completa.

---

## Fase 1 — Simulador de dispositivos IoT (servidor, Sub-issue 1)

**Data:** 13/07/2026

### O que foi implementado

Novo app standalone `iot-simulator/server/`, replicando as convenções de tooling já usadas em `backend/` (TypeScript strict/NodeNext, `tsx`, eslint flat config, `vitest`, schema zod de ambiente testável, logger pino com pretty-print em dev).

- **Simulação**: `simulation/types.ts` (`VirtualNetwork`/`VirtualDevice`/`DeviceParams`/`AnomalyState`, DTO `NetworkSnapshot`), `simulation/store.ts` (`SimulationStore extends EventEmitter` — CRUD de redes/devices + índice reverso `deviceId → networkId`, emite `"changed"` a cada mutação), `simulation/signalGenerator.ts` (ruído gaussiano via Box-Muller + variação senoidal + anomalia, mantendo `P = V·I·PF` fisicamente coerente por construção) e `simulation/deviceRunner.ts`/`simulation/simulationEngine.ts` (tick de 1s por device ligado, auto-stop defensivo, expira anomalias automaticamente via scan periódico).
- **Transporte MQTT**: `broker/broker.ts` (broker Aedes embutido sobre `net.Server`) e `mqtt/internalPublisher.ts` (cliente `mqtt`, mesma versão do backend, publicando no broker embutido).
- **API de controle**: `api/schemas.ts` (validação zod), `api/routes/{networks,devices,status}.routes.ts`, `api/app.ts` (Express 5, middleware de erro `ZodError`→422/`NotFoundError`→404). `GET /api/status/stream` replica o padrão SSE de `iot-stream.routes.ts` do backend, sem autenticação (ferramenta local).
- `src/index.ts` — bootstrap final ligando broker → publisher → store → engine → API, com shutdown gracioso em `SIGTERM`/`SIGINT`. `README.md` com instruções de uso e aviso de que a API não tem autenticação (nunca expor publicamente).

### Desvios do plano (documentados também em PLANO_SIMULADOR_IOT_E_SEED_DEMO.md)

1. **`npm workspaces` raiz ainda não criado** — `iot-simulator/package.json` com `["server","ui"]` fica para quando `ui/` existir; por ora `server/` é standalone (`package.json` próprio), igual a `backend/`/`frontend/`.
2. **Vitest 4 não exclui `dist/` por padrão** (diferente de versões anteriores) — depois do primeiro `npm run build`, os testes rodavam em dobro (arquivos `.test.ts` de `src/` e as cópias compiladas em `dist/`). Corrigido adicionando `exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"]` explícito ao `vitest.config.ts`.
3. **Aedes 1.x exige `await aedes.listen()` explícito** para inicializar sua persistência interna antes de aceitar conexões — sem isso, o handshake MQTT trava silenciosamente: o socket TCP conecta normalmente (confirmado via teste de socket cru), mas nenhum CONNACK é enviado e nenhum evento de erro é emitido. Reproduzido fora do Vitest (script `tsx` avulso) para isolar a causa antes de mexer no código. Não documentado nos exemplos públicos da lib.
4. **`exactOptionalPropertyTypes: true` rejeitava o spread de `params` parcial** (zod `deviceParamsSchema.partial()`) sobre `DeviceParams` em `SimulationStore.createDevice`/`updateDevice`, porque cada campo opcional inferido pelo zod é tipado como `X | undefined`, não só `X` opcional. Corrigido com um helper `mergeDefined()` que só sobrescreve chaves com valor definido, e ajustando `NewDeviceInput`/`UpdateDeviceInput` para declarar `| undefined` explicitamente, espelhando a inferência real do zod.
5. **`EmbeddedBroker.start(port)` retorna a porta efetivamente vinculada** (`Promise<number>`, não `void`) — permite testes chamarem `start(0)` para o SO escolher uma porta livre, evitando colisão entre execuções paralelas de teste.
6. **Arquivos extras não previstos na árvore da Estrutura do plano**, mas consistentes com o padrão do backend: `api/schemas.ts` (schemas zod centralizados), `shared/errors.ts` (`NotFoundError`).

### Testes escritos (54, todos passando)

- `config/env.test.ts` (4), `shared/logger.test.ts` (6).
- `simulation/store.test.ts` (9), `simulation/signalGenerator.test.ts` (5), `simulation/deviceRunner.test.ts` (4), `simulation/simulationEngine.test.ts` (6).
- `broker/broker.test.ts` (3) e `mqtt/internalPublisher.test.ts` (2, integração local: sobe o broker numa porta de teste, conecta o publisher, conecta um segundo cliente MQTT cru assinando um tópico e confirma que a mensagem chega intacta).
- `api/routes/networks.routes.test.ts` (6), `api/routes/devices.routes.test.ts` (6), `api/routes/status.routes.test.ts` (1, sobe um `http.Server` real e confirma `content-type: text/event-stream` + primeiro chunk `event: snapshot`), `api/app.test.ts` (2).

### Verificação executada

- `npm run build`/`lint`/`test`: limpos, 54/54 testes em 12 arquivos, suíte rodada múltiplas vezes seguidas sem flakiness (inclusive o teste de SSE com servidor HTTP real e o de integração MQTT).
- Verificação manual ponta a ponta (`npx tsx src/index.ts` + `curl` + um cliente MQTT avulso): criar rede → criar device → ligar → cliente MQTT recebeu mensagens JSON válidas ~1×/s; `POST /api/devices/:id/anomaly` fez `powerW` saltar de ~1040W para ~3130W (3× o nominal) durante a janela configurada e voltar sozinho ao expirar, sem chamada manual a `DELETE /anomaly`; `SIGTERM` encerrou o processo de forma graciosa (broker fechado, publisher desconectado, sem processos residuais).
- **Não verificado** (fora do alcance do ambiente de desenvolvimento atual, sem backend do LumiTrack rodando com banco configurado): criar um `Meter` real no LumiTrack apontando para o broker embutido e confirmar que `RealTimeCard`/SSE do backend recebem as leituras. Risco residual considerado baixo — o payload publicado já foi validado byte a byte contra o mesmo predicado de `IoTDataProcessor.isValidPayload` do backend real.

### Próximo passo

UI do simulador (Sub-issue 2, `iot-simulator/ui/`) — depende do servidor, já pronto. Depois: Fase 2 (seed de demonstração), Fase 4 (proteção da conta demo), Fase 3 (login de demonstração), na ordem sugerida pelo plano (2 → 4 → 3, com a UI em paralelo a qualquer momento).
