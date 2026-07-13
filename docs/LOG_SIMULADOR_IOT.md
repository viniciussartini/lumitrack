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

---

## Fase 1 — Simulador de dispositivos IoT (UI, Sub-issue 2)

**Data:** 13/07/2026

### O que foi implementado

Novo app `iot-simulator/ui/` (Vite + React + TailwindCSS v4, mesmas versões do `frontend/`), consumindo a API do servidor via o proxy `/api` do Vite dev server (mesmo padrão de `frontend/vite.config.ts`, encaminhando pro servidor do simulador em vez do backend real). `iot-simulator/package.json` (raiz) criado agora com `npm workspaces ["server","ui"]` + script `dev` via `concurrently`, resolvendo o adiamento registrado na Fase 1 (servidor) — `server/` deixou de ter `package-lock.json` próprio, consolidado no lockfile raiz do workspace.

- **Componentes de UI base copiados** de `frontend/src/components/ui/` (`Button`, `Input`, `Select`, `lib/cn.ts`) — subset mínimo, `Button` sem a variante `asChild`/Radix `Slot` do original (não há necessidade de botão polimórfico aqui). `CopyButton` (novo, não existe no frontend principal) para o padrão "copiar tópico"/"copiar host:port" repetido em dois lugares.
- **Hooks**: `useLiveStatus` (EventSource nativo do browser consumindo `GET /api/status/stream` — não a lib `@microsoft/fetch-event-source` usada no frontend principal, desnecessária aqui por não haver headers customizados/credenciais) e `useNetworks` (mutations do TanStack Query — criar/remover rede, criar/atualizar/remover device, power, anomalia). Sem `useQuery` de leitura: o estado de tela vem inteiramente do snapshot da SSE, que já chega atualizado logo após qualquer mutação ter efeito no servidor. `useBrokerInfo` (query simples, `staleTime: Infinity`) hidrata o `host:port` do header uma vez.
- **Componentes de domínio**: `NetworkCard` (rede expansível via `<details>`, formulário de criar device, botão remover rede), `DeviceCard` (nome, tópico copiável, indicador "publicando — há Xs"/"desligado", toggle liga/desliga, remover), `DeviceControls` (form de `nominalVoltage`/`nominalPowerW`/`powerFactorBase`/`noiseAmplitudePercent`/`profile`, com "Salvar parâmetros"), `AnomalyButton` (form multiplicador/duração com defaults 3×/30s, ou badge "anomalia ativa — encerra em Xs" com contagem regressiva ao vivo quando `anomaly.active`).
- `pages/Dashboard.tsx` — página única: header com `host:port` do broker + copiar + indicador de conexão SSE, formulário de criar rede, lista de `NetworkCard`s, estado vazio quando não há redes.

### Desvios do plano (documentados também em PLANO_SIMULADOR_IOT_E_SEED_DEMO.md)

1. **`Button` sem `asChild`/Radix Slot** — simplificação deliberada; a ferramenta não precisa de botão polimórfico, e evita puxar `@radix-ui/react-slot` como dependência extra.
2. **`EventSource` nativo em vez de `@microsoft/fetch-event-source`** — o endpoint `/api/status/stream` não exige headers customizados nem credenciais (sem autenticação, ferramenta local), então a API nativa do browser é suficiente; evita uma dependência a mais.
3. **Sem `useQuery` de leitura para redes/devices** — só `useLiveStatus` (SSE). O `GET /api/networks` existe na API mas não é chamado pela UI: o primeiro evento SSE já chega com o snapshot completo assim que a conexão abre, tornando uma query REST inicial redundante.
4. **Bug real encontrado e corrigido no servidor** (não na UI): `POST /api/networks` devolvia a `VirtualNetwork` crua, cujo campo `devices` é um `Map` — `JSON.stringify(Map)` serializa para `"{}"`, não `"[]"`, inconsistente com o resto da API (`snapshot()`, `GET /:id/devices`, que sempre devolvem array). Descoberto testando o fluxo completo através do proxy da UI (a resposta do `POST` não é usada para renderizar nada — só apareceu ao inspecionar a resposta crua). Corrigido em `networks.routes.ts` para serializar `devices: []` explicitamente; teste de regressão adicionado em `networks.routes.test.ts`.
5. **Verificação em browser real não foi possível neste ambiente** — sem acesso à internet no sandbox para baixar o binário do Chromium via Playwright (`npx playwright install chromium` expirou/travou), mesma limitação já registrada em `LOG_IMPLEMENTACAO_IOT.md` (Fase 5, desvio #6) para este mesmo projeto. Verificação alternativa: todo o fluxo (criar rede → criar device → ligar → SSE atualizando → anomalia disparando e auto-limpando → deletar) foi exercitado via HTTP direto contra o proxy `/api` do Vite dev server (`http://localhost:5180`, o mesmo caminho que o browser usaria), incluindo consumo do stream SSE via `fetch` + leitura manual do body em chunks, confirmando snapshots corretos a cada mutação.

### Testes escritos (12, todos passando)

- `services/api.test.ts` (5) — monta a URL com prefixo `/api`, method/body corretos, trata `204` sem tentar parsear JSON, lança `Error` com a mensagem do corpo em respostas de erro (ou mensagem genérica se o corpo não for JSON válido).
- `hooks/useLiveStatus.test.ts` (3) — conecta em `/api/status/stream`, atualiza `networks`/`connected` a cada evento `snapshot` (via uma classe `FakeEventSource` de teste, já que jsdom não implementa `EventSource`), marca `connected: false` em erro, fecha a conexão ao desmontar.
- `hooks/useNetworks.test.tsx` (4) — cada mutation chama a função certa de `services/api` com os argumentos certos (`vi.mock` do módulo, mesmo padrão de `frontend/src/hooks/queries/useAreas.test.tsx`).

Componentes visuais (`NetworkCard`, `DeviceCard`, `AnomalyButton`, etc.) **não têm teste automatizado dedicado** — decisão de escopo dado o tamanho da ferramenta (o próprio plano já registra "aceitável para uma ferramenta interna pequena"); cobertos pela verificação manual ponta a ponta abaixo.

### Verificação executada

- `npm run build`/`lint`/`test` (server e ui): limpos — servidor 54/54 testes (12 arquivos, incluindo o teste de regressão do bug do Passo 4), UI 12/12 testes (3 arquivos), suíte da UI rodada múltiplas vezes seguidas sem flakiness.
- `npm run dev` na raiz de `iot-simulator/` sobe servidor (1883/4100) e UI (5180) juntos via `concurrently`, confirmado.
- Verificação funcional ponta a ponta via HTTP direto contra `http://localhost:5180` (proxy da UI, mesmo caminho que o browser usaria — ver desvio #5 sobre a ausência de verificação em browser real): `GET /` serve o HTML da UI; `GET /api/broker/info` via proxy retorna `{host,port}` do servidor; criar rede → criar device → ligar (`power on`) devolve o device com `poweredOn: true`; disparar anomalia (`multiplier: 3, durationSeconds: 3`) e consumir o SSE stream (`fetch` com leitura manual de chunks, framing por `\n\n`) confirma 6 eventos `snapshot` consecutivos refletindo cada mutação em tempo real; poll após a janela confirma `anomaly.active: false` de volta sozinho; `DELETE` de device/rede limpa o estado. Dados de teste removidos ao final.

### Próximo passo

Fase 1 (simulador) **completa** — servidor e UI implementados e verificados. Próximo: Fase 2 (seed de demonstração), Fase 4 (proteção da conta demo), Fase 3 (login de demonstração), na ordem sugerida pelo plano (2 → 4 → 3).
