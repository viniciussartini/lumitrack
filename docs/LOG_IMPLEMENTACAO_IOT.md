# Log de implementação — Reformulação IoT

> Registro cronológico do que foi executado em cada fase do [PLANO_REFORMULACAO_IOT.md](./PLANO_REFORMULACAO_IOT.md), incluindo desvios do plano original e decisões tomadas durante a implementação. Branch: `feat/iot-meters-rework`.

---

## Fase 1 — Schema Prisma, migração destrutiva e seed

**Data:** 09/07/2026

**Executado conforme planejado.** Resumo:

- `backend/prisma/schema.prisma` reescrito: enums `TargetType`/`BillingClass`/`TariffFlag` adicionados, `ConsumptionPeriod`/`AlertTargetType` removidos; `EnergyDistributor` virou catálogo global (TUSD/TE + ICMS/PIS/COFINS, `cnpj @unique`, sem `userId`); `Property` ganhou `electricalSystem`/`billingClass`/`publicLightingFeeBrl`; novos modelos `Meter`, `MeterReading`, `TariffFlagConfig`, `AlertTriggerEvent`; `Alert` reformulado para faixa de potência; `ConsumptionRecord`/`IoTDeviceConfig` removidos.
- Migração destrutiva `20260709215523_rework_v2` gerada via `prisma migrate diff` (o shell não é interativo, então `prisma migrate dev` não pôde ser usado diretamente) e aplicada via `prisma migrate reset --force` — com consentimento explícito do usuário para a ação destrutiva (guard de segurança do Prisma para agentes de IA).
- `backend/prisma/seed.ts` criado: 11 distribuidoras reais com `tusdPerKwh`/`tePerKwh` calibrados pela fórmula "por dentro" para bater a tarifa efetiva-alvo de cada uma (Celesc mais barata ~R$0,53/kWh, Equatorial PA mais cara ~R$0,94/kWh), `TariffFlagConfig` singleton (GREEN vigente). Idempotente via `upsert` por CNPJ — verificado rodando 2× sem duplicar.
- Descoberta: o seed já estava configurado via `prisma.config.ts` → `migrations.seed` (Prisma 7), não via a chave `"prisma": { "seed": ... }` do `package.json` como o plano sugeria — não foi necessário editar o `package.json`.

**Verificação:** `prisma migrate reset` limpo, `prisma generate` OK, seed idempotente, 11 distribuidoras com tarifas na faixa esperada, `TariffFlagConfig` com bandeira GREEN.

---

## Fase 2 — Backend: módulo Meter, ingestão por segundo, rollup por minuto

**Data:** 09/07/2026

### O que foi implementado

**Módulo `backend/src/modules/meter/`** (novo):
- `meter.schema.ts` — union discriminada por protocolo (mesmo padrão do antigo `iot.schema.ts`, agora dono exclusivo dessa validação) com campos de alvo (`targetType`/`propertyId`/`areaId`/`deviceId`) na criação; atualização não permite trocar o alvo.
- `meter.repository.ts` — CRUD + `findByTarget`, `findAllByUser` (união dos 3 caminhos de posse via `OR` de relação aninhada).
- `meter.service.ts` — valida exatamente um FK coerente com `targetType`, resolve posse subindo a hierarquia até `Property.userId`, 409 se o alvo já tem medidor.
- `meter.controller.ts` + `meter.routes.ts` — `POST/GET /api/meters`, `GET /api/meters/by-target`, `GET/PUT/DELETE /api/meters/:id`. Rotas top-level (não aninhadas), conforme o plano. `POST`/`PUT`/`DELETE` disparam `IoTConnectionManager.start/restart/stop` via import dinâmico (fire-and-forget, mesmo padrão do antigo `iot.controller.ts`).
- `meter-reading.repository.ts` — `upsertMinute` com merge ponderado por `secondsCovered` (cobre restart do servidor no meio do minuto).

**Pipeline de ingestão (`backend/src/modules/iot/iot-worker/`)**:
- `IoTConnectionManager` rechaveado de `deviceId` para `meterId` (rename mecânico também em `IConnection.ts`, `MqttConnection.ts`, `ModbusTcpConnection.ts` — este último contém 7 classes de protocolo). Novo tipo `MeterConnectionConfig` substitui o antigo `IoTConfigResponse`.
- `IoTDataProcessor` reescrito: payload novo `{ deviceTimestamp?, voltage, current, powerW, powerFactor }`; timestamp oficial = `new Date()` no recebimento; cálculo de energia com `Δt` (clamp em [0, 5]s) — primeira amostra de um medidor (ou após gap) não acumula energia, só inicializa o relógio. Listener genérico `addSampleListener` (usado hoje só pela rota SSE).
- `MinuteBuffer` (substitui `ReadingBuffer`): baldes por minuto com médias ponderadas por Δt; `drainCompletedBuckets`/`drainAll`; método `merge` adicional para reinserir um snapshot agregado sem perder `sampleCount`/`secondsCovered` (usado no retry de upsert falho).
- `MinuteRollupScheduler` (substitui `HourlyRollupScheduler`): flush alinhado ao início do minuto + `setInterval(60s)`; `flush()` (baldes completos) e `flushAll()` (inclui o minuto em curso, usado no shutdown); balde com falha de persistência volta ao buffer via `merge`.
- Módulo REST `iot` (controller/service/repository/schema/routes) removido — config de conexão passou a ser propriedade do `Meter`.
- `iot-stream.routes.ts`: `resolveUserDeviceIds` → `resolveUserMeterIds`; evento `reading` agora carrega `{ meterId, voltage, current, powerW, powerFactor, receivedAt }` em vez de `{ deviceId, kwhConsumed }`. Re-resolução periódica do set de medidores **não** implementada aqui (fica para a Fase 4, junto do contrato SSE completo).

**Módulo `consumption` removido por completo** (controller/service/repository/schema/routes + testes) — dependia inteiramente de `ConsumptionRecord`; a reescrita como somente-leitura (via `MeterReading`) é a Fase 3.

**`server.ts`/`app.ts` rewiring:**
- Pipeline IoT simplificado: sem mais `ConsumptionRepository`/`DeviceRepository`/`AreaRepository`/`PropertyRepository`/`DistributorRepository`/`AlertService` na cadeia — `MinuteRollupScheduler` só depende do buffer e do `MeterReadingRepository`.
- `restoreIoTConnections()` passou a ler `prisma.meter.findMany()` em vez de `prisma.ioTDeviceConfig.findMany()`.
- Shutdown usa `scheduler.flushAll()` (drena inclusive o minuto em curso) em vez de instanciar um scheduler efêmero como antes.
- **Bug pré-existente corrigido**: `server.ts` chamava `createApp({ processor })` sem passar `alertNotifier`, e o mount de `/api/iot` em `app.ts` exige `processor && alertNotifier` — ou seja, o stream SSE nunca era montado em execução real (só nos testes, que constroem o `app` passando ambos manualmente). Corrigido passando `alertNotifier` também, o que era necessário para a própria verificação desta fase (stream SSE precisa responder).

### Desvios do plano (documentados também em PLANO_REFORMULACAO_IOT.md)

1. **`GET /api/meters` sem paginação** — a Fase 3.4 é explicitamente responsável pela paginação universal, incluindo `meters`; implementá-la agora seria antecipar escopo de outra fase.
2. **`alertEvaluator.evaluate(...)` não chamado** — o `AlertEvaluator` só existe na Fase 4. O processor expõe um listener genérico (`addSampleListener`) que a Fase 4 usará sem precisar alterar a API pública.
3. **Quebra em cadeia maior que a prevista pelo texto do plano** (a introdução do épico já alertava para isso, mas o alcance foi além do módulo `consumption`): dois módulos tinham imports **em runtime** (não apenas de tipo) para `@/modules/consumption/consumption.repository.js`, o que impedia `createApp()` de inicializar (`Cannot find package`) — derrubando toda a suíte de testes HTTP do backend, não só os do módulo `meter`. Corrigido:
   - `export.service.ts`/`export.routes.ts` (exportação de dados LGPD, #09): removida a dependência de `ConsumptionRepository`/`consumptionRecords` do `DataExportPayload`. A exportação de consumo agregado via `MeterReading` fica para quando a agregação (TariffService, Fase 3) existir.
   - `dataExportPdf.ts`: removida a seção "Resumo de consumo por propriedade" (`buildConsumptionSummaryByProperty`/`drawConsumptionSummarySection`), que dependia de `ConsumptionRecord`.
   - Módulo `report` (`GET /api/properties/:id/report`) **removido por completo** nesta fase, não apenas desmontado — antecipação pontual da tarefa "Remover módulo `report`" listada na Fase 3.3, inevitável porque o módulo já não tinha como compilar nem rodar sem `ConsumptionRecord`.
   - Testes desses dois módulos (`export.service.test.ts`, `dataExportPdf.test.ts`) tiveram as referências a consumo removidas para não carregar imports mortos; as demais falhas neles (fixtures de distribuidora/propriedade no formato antigo) permanecem — são Fase 3, fora de escopo aqui.

### Testes escritos (70 novos, todos passando)

- `MinuteBuffer.test.ts` (13) — acumulação ponderada por Δt, separação por minuto/medidor, `drainCompletedBuckets` vs `drainAll`, `merge`.
- `IoTDataProcessor.test.ts` (12) — validação de payload, cálculo de energia (incluindo clamp de Δt e primeira amostra sem energia), timestamp oficial = recebimento, listeners.
- `MinuteRollupScheduler.test.ts` (8) — flush de baldes completos, não-drenagem do minuto em curso, retry via `merge` preservando `sampleCount`, `flushAll`, alinhamento do timer.
- `meter.service.test.ts` (18, DB real) — criação nos 3 níveis de alvo, validação cruzada de FK/targetType, posse, conflito de medidor duplicado, cascade delete.
- `meter.routes.test.ts` (13, HTTP/DB real) — mesmos cenários via API real.
- `meter-reading.repository.test.ts` (3, DB real) — **merge ponderado no upsert do banco** (critério de aceite "restart no meio de um minuto não perde nem duplica energia"): duas chamadas de `upsertMinute` para o mesmo `(meterId, minuteStart)` somam energia corretamente, fazem média ponderada por `secondsCovered` e não duplicam a linha.
- `iot-stream.routes.test.ts` (reescrito, 5) — contrato SSE novo (`connected` com `meterCount`, `reading` com leitura elétrica por medidor), isolamento entre usuários. Testes do evento `alert` removidos (payload depende do `Alert` antigo — Fase 4 redesenha esse contrato).

### Verificação executada

- `npx tsc --noEmit`: nenhum erro nos arquivos desta fase (`meter/*`, `iot/*`, `server.ts`, `app.ts`, rotas de device/area/property, helpers de teste). Erros restantes (58) são 100% dos módulos já sabidamente quebrados desde a Fase 1 (`alert`, `distributor`, `property`, `dataExportPdf.ts` — este último só na seção de alertas do PDF).
- `npx eslint` nos arquivos tocados: limpo.
- Suíte completa (`npx vitest run`): **373 passando / 249 falhando** em 45 arquivos. Os 14 arquivos com falha são exatamente os que dependem de `distributor`/`property`/`alert` no formato antigo (`alert.*`, `area.*`, `device.*`, `distributor.*`, `export.*`, `property.*`, `simulation.*`) — nenhuma falha fora desse conjunto já previsto pelo plano. Migrações aplicadas via `prisma migrate deploy` (não-destrutivo) em `lumitrack_test` e `lumitrack_test_http`.

### Próximo passo

Fase 3 — TariffService, catálogo de distribuidoras somente leitura, consumo agregado (`GET /api/consumption` via `MeterReading`), paginação universal. É o que desbloqueia `property`/`distributor` e, por consequência, boa parte das falhas hoje conhecidas.

---

## Fase 3 — Backend: tarifação, agregação e paginação

**Data:** 11/07/2026

### O que foi implementado

**`backend/src/shared/tariff/tariff.service.ts`** (novo) — `TariffService.calculateForProperty` (piso de disponibilidade 30/50/100 kWh conforme `electricalSystem`, CIP somada fora da base de tributos) e `calculateForSubTarget` (AREA/DEVICE — sem piso, sem CIP), ambos com o cálculo "por dentro" (`total = (energia + bandeira) / (1 − (icms+pis+cofins))`).

**`backend/src/modules/distributor/`** reescrito como catálogo global somente leitura: `create/update/delete` removidos, `findAll` paginado, `findById` sem checagem de dono (não existe mais), `findAllByIds` (novo, sem paginação, uso interno pelo `export`) e `exists` (usado pelo `property` para validar o vínculo).

**`backend/src/modules/tariff-flag/`** (novo módulo): `GET /api/tariff-flag` (qualquer usuário autenticado) e `PUT /api/tariff-flag` (`requireRole("ADMIN")` — RBAC já existia, ver desvio abaixo). `resolveFlagPer100Kwh` exportado do repository para uso compartilhado por `consumption` e `simulation`.

**`backend/src/modules/property/`**: schema ganhou `electricalSystem` (obrigatório), `billingClass` (default `B1`) e `publicLightingFeeBrl` (opcional); `distributorId` agora só valida existência no catálogo (`DistributorRepository.exists`), não mais posse — a distribuidora deixou de ter dono.

**`backend/src/modules/consumption/`** (novo, reescrito do zero como somente leitura): `GET /api/consumption?targetType=&targetId=&granularity=hour|day|month|year&from=&to=&page=&pageSize=`. Resolve o medidor vinculado diretamente ao alvo (sem rollup de subárvore). Repository com `$queryRaw` (`Prisma.sql`) agregando por `date_trunc` sobre o instante convertido para `America/Sao_Paulo` (ver desvio de fuso horário abaixo), com média de potência ponderada por `secondsCovered`. Custo por bucket via `TariffService`: hour/day nunca aplicam piso/CIP; month+PROPERTY aplica piso direto (o bucket já é um mês inteiro); year+PROPERTY soma os custos de cada mês do ano (`findMonthlyKwhForYears`), preservando o piso mês a mês em vez de aplicá-lo uma única vez sobre o total anual.

**Paginação universal** (`backend/src/shared/pagination.ts`): `paginationQuerySchema` (zod, `page≥1` default 1, `pageSize` 1–31 default 10) + `toSkipTake`/`toPaginated`. Aplicada a `properties`, `areas`, `devices`, `meters` e `distributors` — repositories ganharam `findAllXxxPaginated` (skip/take + count), services passaram a receber `query` (não mais só `userId`), controllers passam `req.query` e devolvem `{ items, total, page, pageSize }` em vez do array bruto.

**`backend/src/modules/simulation/simulation.service.ts`** reescrito para usar `TariffService` no lugar do antigo `distributor.kwhPrice` (removido na Fase 1, mas o `simulation` só foi migrado agora — ver desvio abaixo). Mesma lógica de piso: MONTHLY+PROPERTY aplica piso direto; ANNUAL+PROPERTY divide por 12 meses iguais (não há leituras reais mês a mês numa simulação hipotética) e aplica o piso por "mês médio"; os demais casos (DAILY, ou alvo AREA/DEVICE) não têm piso nem CIP. `SimulationResult` perdeu o campo `kwhPrice`.

**`backend/src/modules/export/export.service.ts`**: `distributors` do payload passou a vir de `DistributorRepository.findAllByIds` (distribuidoras referenciadas pelas propriedades do titular), não mais de `findAllByUser` (que não existe mais — catálogo sem dono).

**`backend/src/app.ts`**: montadas `/api/tariff-flag` e `/api/consumption`.

### Desvios do plano (documentados também em PLANO_REFORMULACAO_IOT.md)

1. **Fuso horário em `consumption.repository.ts`** — `minuteStart` é `TIMESTAMP(3)` sem fuso (grava o instante em UTC). Um único `AT TIME ZONE 'America/Sao_Paulo'` faria o Postgres interpretar o valor como se já estivesse em SP e convertê-lo para UTC — o oposto do necessário. Usada a conversão dupla `("minuteStart" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`. Testado o caso de virada de dia (duas leituras no mesmo dia UTC caindo em dias SP diferentes).
2. **RBAC já existia para `tariff-flag`** — o plano previa "comentário admin futuro (projeto não tem RBAC)", escrito antes de #16 (RBAC mínimo) ser concluído nesta mesma branch antes da reformulação IoT começar. `PUT /api/tariff-flag` usa `requireRole("ADMIN")` de verdade.
3. **`simulation` não ficou intacto** — a Fase 3.3 prendia isso, mas pressupunha que `kwhPrice` continuaria existindo. Como a Fase 3.2 o removeu de vez, `simulation.service.ts` precisou migrar para `TariffService` (fora do escopo literal do texto original, mas inevitável).
4. **Paginação de `alerts`/`alert-events` adiada para a Fase 4** — o módulo `alert` ainda está no formato pré-reformulação (quebrado desde a Fase 1) e será reescrito por completo na Fase 4; paginar algo que será jogado fora na fase seguinte seria retrabalho. Aplicada a todos os outros alvos previstos (properties, areas, devices, meters, distributors, consumption).
5. **`device.service.test.ts` tinha um teste obsoleto** (cascade delete via `ConsumptionRecord`, modelo removido desde a Fase 1) que nunca tinha sido corrigido — substituído por um equivalente via `Meter`/`MeterReading` (cascade real do schema atual: `Device → Meter → MeterReading`).
6. **Nova fixture de teste** `backend/src/shared/test/distributorFixture.ts` (`createTestDistributor`, `createTestTariffFlagConfig`) — como distribuidora virou catálogo sem dono, todos os testes que antes criavam distribuidora via `POST /api/distributors`/`DistributorService.create` passaram a inserir direto via Prisma.

### Testes escritos/reescritos

- **Novos**: `tariff.service.test.ts` (14), `pagination.test.ts` (9), `tariff-flag.service.test.ts` (8), `tariff-flag.routes.test.ts` (7), `consumption.service.test.ts` (11, incluindo o caso de virada de dia e o de soma de custos mensais no `year`), `consumption.routes.test.ts` (6).
- **Reescritos** (catálogo global + novos campos + paginação): `distributor.service.test.ts`, `distributor.routes.test.ts`, `property.service.test.ts`, `property.routes.test.ts`, `simulation.service.test.ts`, `simulation.routes.test.ts`, `export.service.test.ts`, `export.routes.test.ts`, `dataExportPdf.test.ts`, `area.service.test.ts`, `area.routes.test.ts`, `device.service.test.ts`, `device.routes.test.ts`, `meter.service.test.ts` (2 asserts), `meter.routes.test.ts` (1 assert).

### Verificação executada

- `npx tsc --noEmit`: nenhum erro fora do módulo `alert` (schema/repository/service ainda pré-reformulação, quebrado desde a Fase 1 — escopo da Fase 4) e da seção de alertas de `dataExportPdf.ts` (mesma causa).
- `npx eslint src`: limpo, zero avisos.
- Suíte completa (`npx vitest run`): **597 passando / 43 falhando** em 51 arquivos — as 43 falhas são 100% dos dois arquivos do módulo `alert` (`alert.service.test.ts`, `alert.routes.test.ts`), exatamente como previsto (Fase 4 os reescreve). Nenhuma falha fora desse conjunto. Comparado à Fase 2 (373 passando/249 falhando), a Fase 3 desbloqueou `property`, `distributor`, `simulation`, `export`, `area`, `device` e `meter` como esperado, além de adicionar cobertura nova (18 testes a mais no total).

### Próximo passo

Fase 4 — `AlertEvaluator` (histerese/episódios por faixa de potência), `NotificationStore` efêmero, módulo `alert` reescrito por completo (CRUD `{name, meterId, referencePowerKw, tolerancePercent, enabled}` + histórico de disparo), contrato SSE novo (`UserEventHub`). É o que finalmente desbloqueia `alert.service.test.ts`/`alert.routes.test.ts` e a seção de alertas de `dataExportPdf.ts`.
