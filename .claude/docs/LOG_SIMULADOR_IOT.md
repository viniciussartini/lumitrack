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

---

## Fase 2 — Seed de demonstração: identidades e topologia (Sub-issue 3)

**Data:** 13/07/2026

### O que foi implementado

`backend/src/shared/config/demoAccounts.ts` — fonte única dos e-mails demo (`DEMO_RESIDENTIAL_EMAIL`, `DEMO_COMMERCIAL_EMAIL`, `DEMO_ACCOUNT_EMAILS`), já preparada para ser reaproveitada pelo guard da Fase 4.

`backend/prisma/seed-demo.ts` (script manual, `npm run db:seed:demo`) + `backend/prisma/seed-demo/`:

- **`constants.ts`** — senha demo (`DemoLumi@2026`, satisfaz `passwordSchema`), reexporta os e-mails de `demoAccounts.ts`.
- **`identities.ts`** — geradores `generateCpf`/`generateCnpj` (dígito verificador calculado "de trás para frente", mesma fórmula de `isValidCpf`/`isValidCnpj` do `user.schema.ts`) + `createDemoResidentialUser`/`createDemoCommercialUser`, ambos via `UserService.createUser` real (hash bcrypt, criptografia+blind index de CPF/CNPJ, `consentedAt`/`consentVersion` — idêntico a um cadastro de verdade).
- **`topology.ts`** (não previsto na árvore original do plano — ver desvio) — cria a hierarquia completa reaproveitando `PropertyService.create`/`AreaService.create`/`DeviceService.create` reais (criptografia de endereço, validação de posse) + `prisma.meter.create` direto para os medidores (sem service próprio de escrita, como já documentado no plano). Residencial: 1 `Property` (`BIPHASIC`/`B1`) + 1 `Meter` `PROPERTY`. Comercial: 1 `Property` (`TRIPHASIC`/`B3`, CIP `R$42,50`) + 2 `Area` ("Área de Vendas", "Produção/Cozinha") + 3 `Device` (Forno Industrial e Câmara Fria na cozinha, Ar-condicionado nas vendas) + 3 `Meter` (`PROPERTY`, `AREA` da área de vendas, `DEVICE` do forno) — exatamente como especificado no plano.
- **`verify.ts`** — `printSummary(residentialUserId, commercialUserId)`: lista os medidores criados (nome/nível/tópico) via uma única query com `OR` pelos 3 caminhos de posse (mesmo padrão de `resolveUserMeterIds` do backend), e imprime as credenciais de login no console.
- `backend/package.json`: novo script `"db:seed:demo": "tsx prisma/seed-demo.ts"`.

### Desvios do plano (documentados também em PLANO_SIMULADOR_IOT_E_SEED_DEMO.md)

1. **`topology.ts` é um arquivo novo, não previsto na árvore original** (`constants.ts`, `identities.ts`, `consumptionGen.ts`, `anomalies.ts`, `verify.ts`) — a criação de propriedade/área/dispositivo/medidor é uma responsabilidade distinta o bastante de "identidades" (CPF/CNPJ/usuário) pra justificar um módulo próprio; `main()` já falava em "identities → topology" como passos separados, só o arquivo não estava na lista.
2. **Medidores demo usam `protocol: MQTT` com `host: localhost, port: 1883`** — aponta pro broker embutido do `iot-simulator` (Fase 1), assim quem tiver o simulador rodando pode ligar um device virtual em qualquer um dos 4 medidores demo sem precisar recriar nada.
3. **Distribuidora escolhida via `findFirst` (ordenada por nome)** — o plano não especificava qual das 11 distribuidoras do catálogo usar; qualquer uma serve (só precisa existir), então a primeira em ordem alfabética foi suficiente.
4. **Geradores de CPF/CNPJ testados por reimplementação independente do validador**, não por importar `isValidCpf`/`isValidCnpj` (funções privadas do módulo `user.schema.ts`, não exportadas) — mesmo padrão já usado no `iot-simulator` pra validar contra o predicado real do `IoTDataProcessor`. A prova mais forte, porém, foi rodar o script de verdade contra o Postgres de dev: `UserService.createUser` chama a validação real internamente, e os dois usuários foram criados sem erro.

### Testes escritos (8, todos passando)

- `prisma/seed-demo/identities.test.ts` — `generateCpf`/`generateCnpj` produzem documentos com dígito verificador válido (reimplementação independente de `isValidCpf`/`isValidCnpj`, testada com múltiplas bases), incluindo os valores reais usados no seed (`DEMO_CPF`, `DEMO_CNPJ`), e formatação (`000.000.000-00`/`00.000.000/0000-00`).

### Verificação executada

- `npx tsc --noEmit` e `npx eslint` (arquivos novos): limpos.
- **Suíte completa do backend**: 1398/1398 testes em 117 arquivos, nenhuma regressão.
- **Rodado de verdade contra o Postgres de dev** (`lumitrack_dev`, ambiente com o catálogo de 11 distribuidoras já seedado):
  - 1ª execução: `Medidores criados: 4` (1 residencial + 3 comercial).
  - 2ª execução (idempotência): mesmo resultado, `4` medidores — confirmado via SQL direto que não há duplicação (`SELECT count(*)` em `users`/`properties`/`meters` batendo exatamente).
  - Login real via `POST /api/auth/login` (backend `dev` de verdade) — `200 OK` para os dois usuários demo, sem MFA (confirma `mfaEnabled: false` default).
  - `GET /api/meters` autenticado: residencial retorna 1 medidor (`PROPERTY`); comercial retorna exatamente 3 medidores nos 3 níveis (`AREA`, `DEVICE`, `PROPERTY`) — bate com o critério de aceite da Sub-issue 3.

### Próximo passo

Fase 2 segue para a Sub-issue 4 (1 ano de `MeterReading` por medidor, alertas e episódios de anomalia históricos) — depende desta (identidades/topologia já prontas). Depois: Fase 4 (proteção da conta demo — `DEMO_ACCOUNT_EMAILS` já existe), Fase 3 (login de demonstração).

Nota (Sub-issue 4): `topology.ts` passou a retornar os `Meter` criados (não só `Property`/`Area`/`Device`), necessário para `alerts.ts`/`readings.ts` referenciarem os medidores certos sem query extra — ver detalhes abaixo.

---

## Fase 2 — Seed de demonstração: consumo de 1 ano, alertas e anomalias históricas (Sub-issue 4)

**Data:** 13/07/2026

### O que foi implementado

- **`consumptionGen.ts`** — gerador puro (sem I/O) de amostra por minuto para 4 perfis de carga (`RESIDENTIAL`, `COMMERCIAL_GENERAL`, `SALES_AREA`, `OVEN`). PRNG determinístico (`mulberry32`, mesma escolha do `iot-simulator`) + ruído gaussiano (Box-Muller). Cada perfil deriva a potência-alvo da hora/dia da semana/época do ano local (Brasil, deslocamento fixo de -3h, sem depender do fuso da máquina que roda o script — todo cálculo usa `getUTC*` sobre um timestamp já deslocado, nunca `getHours`/`getDay` do host). `avgCurrent` é sempre derivada de `avgPowerW/(avgVoltage·avgPowerFactor)`, garantindo `P=V·I·PF` por construção.
- **`anomalies.ts`** — 6 janelas de anomalia fixas (2 por medidor alertável: residencial, comercial geral, forno), com `meterKey`/`startUtc`/`durationMinutes`/`multiplier`, todas em horário de atividade normal do respectivo perfil (evita "salto do zero").
- **`alerts.ts`** — cria os 3 `Alert` reais via `AlertRepository.create` (residencial `4kW±25%`, comercial geral `11kW±20%`, forno `5kW±15%`), calibrados para o pico normal de cada perfil.
- **`readings.ts`** — orquestra o loop de 1 ano (525.600 minutos) por medidor, gerando a leitura de cada minuto, acumulando em lote de `READINGS_BATCH_SIZE=10_000` e persistindo via `prisma.meterReading.createMany({ skipDuplicates: true })`; para os 3 medidores alertáveis, acumula estatísticas (`min`/`max`/`avg`/`sampleCount`) durante cada janela de anomalia e grava um `AlertTriggerEvent` diretamente ao fim da janela — nunca via `AlertEvaluator` ao vivo.
- **`seed-demo.ts`** — `main()` agora encadeia identities → topology → alerts → readings → printSummary, medindo e imprimindo o tempo real da geração de leituras.
- **`verify.ts`** — resumo final agora inclui, por medidor, contagem de leituras/kWh total/potência média (`prisma.meterReading.aggregate`), e a lista dos episódios de anomalia gerados (via `AlertTriggerEvent` + nome do alerta).
- **`topology.ts`** (Sub-issue 3) passou a retornar os `Meter` criados (`meters: { general, salesArea?, oven? }`) — necessário para `alerts.ts`/`readings.ts` referenciarem os medidores certos sem uma query extra.

### Desvios do plano (documentados também em PLANO_SIMULADOR_IOT_E_SEED_DEMO.md)

1. **4º perfil de carga (`SALES_AREA`), não previsto na lista original de 3** (residencial/comercial geral/forno) — o medidor da "Área de Vendas" (nível `AREA`) precisa de uma curva própria (iluminação + ar-condicionado, mesmo horário de funcionamento da loja, escala bem menor que o medidor geral que cobre o prédio inteiro). Sem `Alert` associado (só residencial/comercial geral/forno têm alerta, como já especificado no plano).
2. **`alerts.ts` e `readings.ts` são arquivos novos**, não previstos na árvore original (`constants.ts`, `identities.ts`, `consumptionGen.ts`, `anomalies.ts`, `verify.ts`) — mesmo raciocínio do desvio #1 da Sub-issue 3 (`topology.ts`): criar os `Alert` e orquestrar o loop de geração/batching são responsabilidades distintas o bastante das de `consumptionGen.ts`/`anomalies.ts` (que ficam puras, sem I/O) para justificar módulos próprios.
3. **RNG com seed fixa por papel de medidor (`residential`/`commercialGeneral`/`salesArea`/`oven`), não pelo `meterId`** — o `meterId` é um UUID gerado pelo Postgres a cada execução do seed; usá-lo como seed do RNG quebraria o determinismo entre execuções (mesma contagem de linhas, mas valores de consumo diferentes a cada run). Seeds fixas por papel garantem que rodar o script 2× produz exatamente os mesmos números, não só a mesma contagem.
4. **`sampleCount`/`durationSeconds` do `AlertTriggerEvent` aproximados a partir dos minutos gerados** (`duracaoMinutos × 60`), não de amostras por segundo reais — o seed só retém agregados por minuto (sem raw samples a 1Hz, diferente do pipeline real de ingestão). `min`/`max`/`avg` de potência do episódio vêm dos `avgPowerW` de cada minuto dentro da janela, uma aproximação razoável dado que o seed não guarda granularidade menor.
5. **Transições suaves (função logística) em vez de degraus** nas janelas de abertura/fechamento comercial e nos lobos de pico residenciais — evita um "serrote" artificial entre minutos consecutivos num gráfico de linha; não estava especificado no plano, mas é consistente com "coerência física" já exigida para tensão/corrente/potência.

### Testes escritos (26, todos passando; total do módulo `seed-demo/` sobe para 34)

- `consumptionGen.test.ts` (20) — determinismo do RNG (mesma seed ⇒ mesma sequência), distribuição uniforme, coerência `P=V·I·PF` e validade de campo (finito, `≥0`, `powerFactor∈[0,1]`) para os 4 perfis, comparações de forma (pico noturno > madrugada, fim de semana > dia de semana, loja fechada `<<` horário comercial, forno em produção `>>` fora dela, domingo zerado), e efeito da anomalia (potência bem maior + leve sag de tensão).
- `anomalies.test.ts` (6) — `anomalyMultiplierAt` retorna 1 fora de qualquer janela, aplica o multiplicador correto durante toda a duração configurada, cessa exatamente no minuto seguinte ao fim, não vaza entre medidores diferentes, e há exatamente 6 janelas (2 por medidor alertável).

`alerts.ts`/`readings.ts`/mudanças em `topology.ts`/`verify.ts` **não têm teste unitário dedicado** — mesmo padrão já registrado para `topology.ts` na Sub-issue 3: tocam `prisma`/services reais diretamente, verificados pela execução de verdade contra o Postgres de dev (abaixo), não por mocks.

### Verificação executada

- `npx tsc --noEmit` e `npx eslint prisma/seed-demo prisma/seed-demo.ts`: limpos.
- **Suíte completa do backend**: 1425/1425 testes em 119 arquivos (1398 anteriores + 27 novos: 26 de `consumptionGen.test.ts`/`anomalies.test.ts` + 1 de ajuste), nenhuma regressão. Duração ~850s (suíte inteira contra Postgres real, `maxWorkers: 1`).
- **Rodado de verdade contra o Postgres de dev** (`lumitrack_dev`, dados da Sub-issue 3 recriados do zero pelo próprio `resetDemoData`):
  - **Tempo real**: geração das leituras (`generateYearOfReadings`) levou **602,9s** (~10min) para os 4 medidores; script completo (`time npm run db:seed:demo`) **10m6s**. `BATCH_SIZE=10_000` (constants.ts) não precisou de ajuste — throughput estável do início ao fim, sem degradação perceptível conforme o volume crescia.
  - **Volume**: exatamente `4 × 525.600 = 2.102.400` linhas de `MeterReading` (confirmado via `SELECT count(*)` e via console do próprio script, medidor a medidor).
  - **Console do script**: `Medidor Geral` (residencial) 525.600 leituras/9.676,2 kWh/1.105W médios; `Medidor Geral` (comercial) 525.600/35.323,5 kWh/4.032W médios; `Medidor Área de Vendas` 525.600/6.622,8 kWh/756W médios; `Medidor Forno` 525.600/6.539,8 kWh/747W médios. 6 episódios de anomalia impressos com duração e potência de pico coerentes com os multiplicadores configurados.
  - **`GET /api/consumption?granularity=year`** (login real via `POST /api/auth/login`, sem MFA) para o medidor geral residencial: 2 buckets (2025 e 2026) somando **9.676,2 kWh** — bate exatamente com o total do console.
  - **`GET /api/alerts`**: 1 alerta residencial (`4kW±25%`) e 2 comerciais (`11kW±20%` geral, `5kW±15%` forno), todos `enabled`.
  - **`GET /api/alert-events`** por alerta: 2 episódios cada (6 no total), com `startedAt`/`endedAt`/`durationSeconds`/`minPowerW`/`maxPowerW`/`avgPowerW` batendo exatamente com o que o console do seed reportou (ex.: episódio residencial de 2026-03-03, `durationSeconds: 420`, `maxPowerW: 12084.29`).
  - **Idempotência da geração de leituras não foi reexecutada** (2ª rodada completa levaria outros ~10min) — a garantia vem por construção: `resetDemoData` (cascade) já remove todo o histórico antigo (comportamento testado na Sub-issue 3) e `readings.ts` usa seeds de RNG fixas por papel de medidor (não pelo `meterId`), então uma 2ª execução reproduziria os mesmos valores, não só a mesma contagem — coberto pelos testes de determinismo do RNG em `consumptionGen.test.ts`.

### Próximo passo

Fase 2 (seed de demonstração) **completa**. Próximo: Fase 4 (proteção da conta demo — `DEMO_ACCOUNT_EMAILS` já existe), Fase 3 (login de demonstração).

---

## Fase 4 — Proteção da conta demo contra alteração de senha (Sub-issue 6)

**Data:** 14/07/2026

### O que foi implementado

`backend/src/modules/auth/auth.service.ts`: `AuthService.forgotPassword` ganhou uma guarda logo após localizar o usuário — se `DEMO_ACCOUNT_EMAILS.has(user.email)`, retorna silenciosamente (mesmo padrão já usado para e-mail inexistente: nenhum `PasswordReset` criado, nenhum e-mail enviado, resposta HTTP idêntica). Como nenhum token é criado, `resetPassword` já é estruturalmente incapaz de completar para essas contas — nenhuma mudança necessária lá.

### Desvios do plano

Nenhum — implementado exatamente como especificado (guarda de 3 linhas, reaproveitando `DEMO_ACCOUNT_EMAILS` de `@/shared/config/demoAccounts.js`, já existente desde a Sub-issue 3).

### Testes escritos (1, todos passando; suíte de `auth.service.test.ts` sobe para 39)

- `forgotPassword`: novo caso "não deve criar PasswordReset nem enviar e-mail para uma conta de demonstração" — cria um usuário real com o e-mail residencial demo, chama `forgotPassword`, confirma que não resolve com erro, que nenhum `PasswordReset` foi persistido e que `sendPasswordResetEmail` não foi chamado.

### Verificação executada

- `npx tsc --noEmit` e `npx eslint` (arquivos alterados): limpos.
- **Suíte completa do backend**: 1426/1426 testes em 119 arquivos, nenhuma regressão.
- **Rodado de verdade contra o Postgres de dev**: `POST /auth/forgot-password` com `demo.residencial@lumitrack.dev` e com um e-mail inexistente (`fantasma-nao-existe@lumitrack.dev`) devolveram exatamente a mesma resposta (`200`, `"Se o e-mail estiver cadastrado, você receberá as instruções de redefinição."`); `SELECT count(*)` em `password_resets` para a conta demo confirmou `0` linhas.

### Próximo passo

Fase 4 **completa**. Próximo: Fase 3 (login de demonstração no frontend).

---

## Fase 3 — Login de demonstração (Sub-issue 5)

**Data:** 14/07/2026

### O que foi implementado

- **`frontend/src/config/demoUsers.ts`** (novo) — `DEMO_USERS.residential`/`.commercial`, cada um com `{email, password, label}`, sincronizado manualmente com `backend/prisma/seed-demo/constants.ts` (mesmo e-mail/senha do seed).
- **`LoginPage.tsx`** — novo bloco condicional (renderizado só quando `isDemoModeEnabled` é `true`), com dois botões secundários chamando `handleDemoLogin`, que reusa `useAuth().login()` (mesma função do submit normal) com as credenciais fixas, mesmo tratamento de `serverError`/loading/redirecionamento pós-MFA do fluxo normal.
- **`frontend/.env.example`**: `VITE_DEMO_MODE=false` documentado (só vira `"true"` no ambiente de deploy de demonstração pública).

### Desvios do plano

1. **Flag lida dentro do corpo do componente** (`const isDemoModeEnabled = import.meta.env.VITE_DEMO_MODE === "true"`), não como `const` de módulo — necessário para os testes poderem alternar o valor por caso via `vi.stubEnv("VITE_DEMO_MODE", ...)`; um `const` de módulo fixaria o valor na primeira importação do arquivo de teste, tornando os dois cenários (flag ligada/desligada) impossíveis de testar no mesmo arquivo.
2. **`handleDemoLogin` recebe só `{email, password}` desestruturado**, não o objeto `DEMO_USERS.residential`/`.commercial` inteiro — o objeto também tem `label` (usado só como texto do botão), que vazaria pro payload de `login()` se passado direto (bug real encontrado no primeiro teste: `authService.login` foi chamado com um `label` extra no corpo).
3. **Verificação em browser real não foi possível neste ambiente** — mesma limitação sem acesso à internet para o Chromium do Playwright, já registrada nas Fases 1/2. Verificação alternativa: `npm run build` limpo, incluindo uma build extra com `VITE_DEMO_MODE=true` confirmando que os botões (`"Ver demo residencial"`) aparecem no bundle gerado (não são eliminados por dead-code-elimination); testes de componente com React Testing Library que renderizam `LoginPage` de verdade, clicam nos botões e confirmam a chamada correta a `authService.login()` — mesmo caminho de código que um clique real no browser exercitaria. As credenciais em si (login real via `POST /api/auth/login`) já haviam sido validadas contra o Postgres de dev na Fase 2.

### Testes escritos (3, todos passando; suíte de `LoginPage.test.tsx` sobe para 12)

- "não mostra os botões de demo quando a flag está desligada" (`vi.stubEnv("VITE_DEMO_MODE", "false")`).
- "mostra os dois botões de demo e loga com as credenciais fixas" (`vi.stubEnv("VITE_DEMO_MODE", "true")`, clica no botão residencial, confirma `authService.login` chamado com `{email, password}` exatos, sem `label`).
- "exibe a mesma mensagem de erro do login normal quando o demo falha" (reusa o mesmo tratamento de `serverError` do form normal).

### Verificação executada

- `npx tsc --noEmit` e `npx eslint` (arquivos alterados): limpos.
- **Suíte completa do frontend**: 519/519 testes em 56 arquivos, nenhuma regressão.
- `npm run build`: limpo; build extra com `VITE_DEMO_MODE=true` confirmando a string `"Ver demo residencial"` presente no bundle gerado.

### Próximo passo

Fase 3 **completa**. Com isso, todas as 4 fases do épico (simulador IoT, seed de demonstração, login de demonstração, proteção da conta demo) estão implementadas e verificadas dentro dos limites do ambiente de desenvolvimento atual (sem browser real via Playwright).
