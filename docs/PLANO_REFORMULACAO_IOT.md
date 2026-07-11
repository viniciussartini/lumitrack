# Plano — Reformulação LumiTrack: medidores IoT, consumo minuto a minuto, tarifação realista e alertas por potência

> **Status:** em implementação na branch `feat/iot-meters-rework`. Fase 1 concluída em 09/07/2026, Fase 2 concluída em 09/07/2026 (ver log de implementação em [LOG_IMPLEMENTACAO_IOT.md](./LOG_IMPLEMENTACAO_IOT.md)).
>
> **Data do planejamento:** 03/07/2026.
>
> **Issues:** ver [ISSUES_REFORMULACAO_IOT.md](./ISSUES_REFORMULACAO_IOT.md) (épico + sub-issues para o GitHub).

## Contexto

O LumiTrack hoje registra consumo por dois caminhos (manual via REST e rollup IoT horário), modela o medidor como config 1:1 do Device, tem distribuidoras cadastradas por usuário com um único `kwhPrice` (o `taxRate` nem entra no cálculo), alertas one-shot sem histórico, notificações efêmeras sem UI dedicada e nenhuma paginação. Esta reformulação torna o sistema fiel à realidade: **consumo só via medidores IoT** (vinculáveis a propriedade, área ou dispositivo), **persistência minuto a minuto** com ingestão por segundo, **tarifação Grupo B realista** (TUSD/TE, bandeiras, tributos por dentro, CIP, custo de disponibilidade) com **catálogo global de distribuidoras seedado**, **alertas por faixa de potência com histórico de episódios**, **paginação universal (máx. 31/página)** e reorganização da UI (gráfico + tabela Hora/Dia nas details pages, card tempo real, página /relatorios, placeholders de Dashboard e Simulação).

**Decisões tomadas:**

- Timestamp oficial das leituras = hora de recebimento no backend (timestamp do dispositivo é só metadado de diagnóstico).
- Escopo de tarifação: Grupo B (baixa tensão) realista. Grupo A (binômia, demanda, ponta/fora ponta) fica para fase futura.
- Distribuidoras: catálogo global somente leitura + seed com dados reais.
- Dados de consumo existentes: **descartar** (migração destrutiva, `prisma migrate reset` — projeto em dev).

---

## Fase 1 — Schema Prisma, migração destrutiva e seed ✅ Concluída (09/07/2026)

Arquivo: `backend/prisma/schema.prisma`

### Enums

- Novo `TargetType { PROPERTY AREA DEVICE }` (substitui `AlertTargetType`; reuso para Meter e agregação).
- Novo `BillingClass { B1 B2 B3 }`, novo `TariffFlag { GREEN YELLOW RED_P1 RED_P2 }`.
- Remover `ConsumptionPeriod` e `AlertTargetType`. Manter `ElectricalSystemType`, `IoTProtocol` e demais.

### Modelos alterados

- **`EnergyDistributor` → catálogo global**: remove `userId` (e a relação `User.distributors`), `electricalSystem`, `workingVoltage`, `kwhPrice`, `taxRate`, `publicLightingFee`. Ganha: `cnpj @unique`, `state` (UF), `tusdPerKwh Decimal(10,6)`, `tePerKwh Decimal(10,6)`, `icmsRate/pisRate/cofinsRate Decimal(5,4)`.
- **`Property`**: ganha `electricalSystem ElectricalSystemType` (migra da distribuidora), `billingClass BillingClass @default(B1)`, `publicLightingFeeBrl Decimal?(10,2)` (CIP municipal), `meter Meter?`. Perde `consumption` e `alerts` diretos.
- **`Area`/`Device`**: ganham `meter Meter?`; perdem `consumption`/`alerts`; `Device` perde `iotConfig`.

### Modelos novos

- **`Meter`** (`meters`): `name`, `targetType TargetType`, `propertyId? @unique` / `areaId? @unique` / `deviceId? @unique` (exatamente um preenchido; `@unique` em cada FK garante máx. 1 medidor por alvo), config de conexão migrada do `IoTDeviceConfig` (`protocol IoTProtocol, host?, port?, topic?, address?, extra Json?`), relações `readings`, `alerts`. FKs com `onDelete: Cascade`.
- **`MeterReading`** (`meter_readings`) — 1 linha/medidor/minuto: `meterId`, `minuteStart DateTime` (truncado ao minuto, UTC), `kwhConsumed`, `avgVoltage`, `avgCurrent`, `avgPowerW`, `avgPowerFactor`, `sampleCount Int`, `secondsCovered Float` (permite merge ponderado idempotente no upsert). `@@unique([meterId, minuteStart])`.
- **`TariffFlagConfig`** (`tariff_flag_config`) — singleton (`id Int @id @default(1)`): `currentFlag`, `greenPer100Kwh/yellowPer100Kwh/redP1Per100Kwh/redP2Per100Kwh Decimal(10,4)`.
- **`Alert` reformulado**: `userId`, `meterId`, `name`, `referencePowerKw Float`, `tolerancePercent Float` (ex.: 10 kW ± 2% → faixa [9,8, 10,2] kW), `enabled Boolean @default(true)`, relação `events`. Remove `targetType`/FKs polimórficos/`thresholdKwh`/`message`/`triggeredAt`/`readAt`. `@@index([meterId])`.
- **`AlertTriggerEvent`** (`alert_trigger_events`) — histórico de episódios: `alertId`, `startedAt`, `endedAt`, `durationSeconds Int`, `minPowerW`, `maxPowerW`, `avgPowerW`, `sampleCount`. `@@index([alertId, startedAt])`.
- **Remover**: `ConsumptionRecord`, `IoTDeviceConfig`.

### Migração e seed

- Migração destrutiva: `prisma migrate reset` + nova migração `rework-v2` (dados de consumo/alertas/configs IoT descartados — decisão registrada).
- Criar `backend/prisma/seed.ts` + config `prisma.seed` no `backend/package.json` (o script `db:seed` já existe, mas não há arquivo). Idempotente (`upsert` por CNPJ):
  - ~11 distribuidoras reais: Enel SP, CPFL Paulista, Cemig, Neoenergia Coelba, Celesc, Light, Copel, Neoenergia PE, Equatorial PA, RGE Sul, Neoenergia DF. `tusdPerKwh + tePerKwh` calibrados para a tarifa efetiva de cada uma (Celesc mais barata ~0,53, Equatorial PA mais cara ~0,94, com tributos), `icmsRate` por UF (0,17–0,19), `pisRate` 0,0165, `cofinsRate` 0,076.
  - `TariffFlagConfig`: GREEN vigente; valores R$/100 kWh: verde 0 / amarela 1,885 / vermelha P1 4,463 / P2 7,877.

**Verificação:** `npx prisma migrate reset` limpo; seed roda 2× sem duplicar; `prisma generate` OK. Correção dos tipos/mocks quebrados acontece nas fases 2–4.

**Nota de implementação:** executado exatamente como planejado. Detalhes (11 distribuidoras calibradas, migração `20260709215523_rework_v2`, etc.) no log de implementação.

---

## Fase 2 — Backend: módulo Meter, ingestão por segundo, rollup por minuto ✅ Concluída (09/07/2026)

### 2.1 Novo módulo `backend/src/modules/meter/` (padrão controller/service/repository/schema/routes + testes)

- `POST /api/meters` — `{ name, targetType, propertyId|areaId|deviceId, protocol, host?, port?, topic?, address?, extra? }`. Valida: exatamente um FK coerente com `targetType`; alvo pertence ao usuário (via hierarquia); alvo sem medidor (unique violation → 409). Após criar, `IoTConnectionManager.start()`.
- `GET /api/meters` (paginado, escopo do usuário), `GET /api/meters/by-target?targetType=&targetId=` (para as details pages), `GET/PUT/DELETE /api/meters/:id` (PUT reinicia conexão; DELETE encerra).
- Remover o módulo REST `iot` (iot.controller/service/repository/schema/routes + mount aninhado em device); manter `iot-stream.routes.ts` e `iot-worker/`.

### 2.2 Pipeline de ingestão (`backend/src/modules/iot/iot-worker/`)

- **`IoTConnectionManager`**: chave `deviceId` → `meterId`; tipo de config passa a vir do Meter. `server.ts:restoreIoTConnections()` lê `prisma.meter.findMany()`.
- **`IoTDataProcessor`** — novo payload por leitura (~1/s): `{ deviceTimestamp?, voltage, current, powerW, powerFactor }`. Validação: números finitos, `voltage/current/powerW ≥ 0`, `powerFactor ∈ [0,1]`; inválido → log + descarte (padrão atual). Timestamp oficial = `new Date()` no recebimento; `deviceTimestamp` só em log de diagnóstico. **Cálculo de energia no backend**: `Δt = now − últimaAmostra` em s, com **clamp em [0, 5]s** (gap maior = medidor silencioso, não inventar energia; primeira amostra após boot/gap não acumula energia, só inicializa o relógio); `kWh = powerW × Δt / 3.6e6`. Cada amostra alimenta o buffer, notifica SSE (`reading`) e chama `alertEvaluator.evaluate(meterId, powerW, now)` (Fase 4).
- **`MinuteBuffer`** (substitui `ReadingBuffer`): por medidor, `minuteStart → { energyKwh, sumVoltageDt, sumCurrentDt, sumPowerDt, sumPfDt, totalDt, sampleCount }` (médias ponderadas por Δt) + `latest` por medidor. Métodos `add`, `drainCompletedBuckets(now)`, `drainAll()`.
- **`MinuteRollupScheduler`** (substitui `HourlyRollupScheduler`): mesmo padrão de align + `setInterval(60_000)`. Flush: para cada bucket completo, `upsert` em `MeterReading` por `(meterId, minuteStart)` com **merge ponderado via `secondsCovered`** (cobre restart no mesmo minuto). Sem custo gravado (calculado na agregação) e sem resolver hierarquia — flush bem mais simples que o atual. `Promise.allSettled`; bucket com falha volta ao buffer.
- **Shutdown** (`backend/src/server.ts`): manter padrão existente — `scheduler.stop()` + flush final com `drainAll()` (persiste minuto parcial).
- **Remover o módulo `consumption` de escrita** (POST/PUT/DELETE manuais, form schemas) — o módulo é reescrito como somente leitura na Fase 3. Remover `checkAndTrigger` do fluxo.

**Verificação:** Vitest (buffer, rollup com merge, processor com payload novo); subir backend + publicar MQTT fake e conferir linhas em `meter_readings` e evento SSE via `curl -N /api/iot/stream`.

**Notas de implementação (desvios do texto acima):**

- `GET /api/meters` **não** paginado nesta fase — a paginação universal (incluindo `meters`) é responsabilidade explícita da Fase 3.4; aplicar retroativamente lá.
- `alertEvaluator.evaluate(meterId, powerW, now)` **não** foi chamado do `IoTDataProcessor` (o evaluator só existe na Fase 4). Em vez disso, o processor expõe um `addSampleListener` genérico — a Fase 4 registra o `AlertEvaluator` como mais um listener, sem precisar mudar a API pública do processor.
- `checkAndTrigger` não existia mais para remover do fluxo — o modelo `Alert` já tinha sido reformulado na Fase 1 (sem `thresholdKwh`), então o `HourlyRollupScheduler` antigo (que chamava `checkAndTrigger`) foi substituído inteiro pelo `MinuteRollupScheduler`, que não conhece alertas.
- **Quebra em cadeia além do previsto**: dois módulos tinham *imports em runtime* (não só de tipo) para `consumption.repository.ts`, o que impedia `createApp()` de sequer inicializar (`Cannot find package`), derrubando toda a suíte de testes HTTP — não só os deste módulo: `export.routes.ts`/`export.service.ts` (exportação LGPD) e `report.routes.ts` (montado por `property.routes.ts`). Corrigido nesta fase (fora do escopo original, mas necessário para o boot da aplicação):
  - `ExportService`/`DataExportPayload` perderam `consumptionRecords`/`ConsumptionRepository` (a exportação de consumo agregado via `MeterReading` fica para quando a agregação existir — Fase 3+).
  - `dataExportPdf.ts` perdeu a seção de resumo de consumo (`buildConsumptionSummaryByProperty`/`drawConsumptionSummarySection`).
  - Módulo `report` inteiro **removido** (não só desmontado) — antecipação pontual da tarefa "Remover módulo `report`" da Fase 3.3, que já dependia de `ConsumptionRecord` e não tinha como sobreviver.
- Testes cobrindo os módulos ainda não corrigidos (`alert`, `distributor`, `property`, `area`/`device` — que dependem de fixtures de distribuidora/propriedade no formato antigo — e `simulation`) continuam falhando, como esperado pelo plano. Nenhuma regressão fora desse conjunto: suíte completa em 09/07/2026 = 373 passando / 249 falhando, todas as 249 dentro desses módulos já previstos como quebrados até a Fase 3/4.

---

## Fase 3 — Backend: tarifação, agregação e paginação

### 3.1 `backend/src/shared/tariff/tariff.service.ts` (novo)

- `energia = kWh × (tusdPerKwh + tePerKwh)`; `bandeira = kWh × (valorBandeira/100)`; `total = (energia + bandeira) / (1 − (icms + pis + cofins))` (**cálculo por dentro**).
- Em agregação **mensal/anual com alvo PROPERTY**: aplica piso de disponibilidade (`MONOPHASIC=30, BIPHASIC=50, TRIPHASIC=100` kWh) e soma CIP (`publicLightingFeeBrl`) **fora** da base de tributos. Para AREA/DEVICE: só energia + bandeira + tributos. Documentar a decisão no código. Converter `Decimal` do Prisma com `+valor` (padrão existente).
- Testes unitários (kWh < piso, bandeira verde, alíquotas ~27,25%).

### 3.2 Distribuidoras → catálogo somente leitura

- `backend/src/modules/distributor/`: remover create/update/delete e escopo por `userId`. Manter `GET /api/distributors` (paginado) e `GET /api/distributors/:id` com os novos campos.
- Mini-módulo `tariff-flag`: `GET /api/tariff-flag` + `PUT /api/tariff-flag` (autenticado; comentário "admin futuro" — projeto não tem RBAC).
- `backend/src/modules/property/`: schema zod ganha `electricalSystem`, `billingClass`, `publicLightingFeeBrl`; `distributorId` validado contra o catálogo.

### 3.3 Consumo agregado (reescrever `backend/src/modules/consumption/` como somente leitura)

- `GET /api/consumption?targetType=&targetId=&granularity=hour|day|month|year&from=&to=&page=&pageSize=`.
- Service: resolve o **medidor vinculado ao alvo** (sem rollup de subárvore — evita dupla contagem quando propriedade e devices têm medidores próprios; documentar); valida posse; 404 se alvo sem medidor.
- Repository com `$queryRaw`: `date_trunc(granularity, "minuteStart" AT TIME ZONE 'America/Sao_Paulo')`, `SUM(kwhConsumed)`, média de potência ponderada por `secondsCovered`, `GROUP BY bucket ORDER BY bucket DESC LIMIT/OFFSET` + query de `COUNT` para o total.
- Custo por bucket via TariffService (granularidade `year`: agrega mês a mês internamente para aplicar piso/CIP por mês).
- Resposta: `{ items: [{ bucketStart, kwhConsumed, costBrl, avgPowerW }], total, page, pageSize, granularity }`.
- Buckets conforme requisito: Hora = hh:00–hh:59; Dia = 0–24h; Mês = todos os dias do mês agregados; Ano = todos os meses.
- **Remover módulo `report`** (`GET /api/properties/:id/report`); módulo `simulation` fica intacto.

### 3.4 Paginação universal

- `backend/src/shared/pagination.ts`: zod (`page ≥ 1` default 1; `pageSize` 1–31 default 10) + helper de resposta `{ items, total, page, pageSize }`.
- Aplicar em: properties, areas, devices, alerts, alert-events, meters, distributors, consumption. Repositories ganham `skip/take` + `count`.
- **Exceção mantida**: export LGPD (`findAllByUser` tem comentário "sem paginação de propósito" — Art. 18) continua íntegro.

**Verificação:** Vitest dos services (tarifa, agregação, paginação); `curl` nos endpoints com `meter_readings` populadas.

---

## Fase 4 — Backend: alertas por potência, notificações efêmeras, SSE

### 4.1 `AlertEvaluator` (`backend/src/modules/alert/alert-evaluator.ts`, singleton no `server.ts`)

- Cache `meterId → Alert[]` (enabled) carregado no boot, invalidado por hooks do AlertService (create/update/delete/toggle — mesma técnica de injeção usada hoje).
- `evaluate(meterId, powerW, at)` a cada amostra: faixa `[ref×1000×(1−tol/100), ref×1000×(1+tol/100)]`.
- **Anti-flapping por contagem**: abre episódio após 3 amostras consecutivas fora; fecha após 5 consecutivas dentro (constantes nomeadas).
- Abrir → SSE `alert-firing {type:"start", alertId, alertName, meterId, startedAt}`. Fechar → persiste `AlertTriggerEvent` (duração, min/max/avg potência, samples), SSE `alert-firing {type:"end",…}`, e **só então** cria a notificação ("Alerta <nome> foi disparado. Clique aqui para ver") no NotificationStore → SSE `notification`.
- Alertas **não desarmam**: episódios repetem indefinidamente enquanto `enabled`. Alerta desabilitado/excluído durante firing → encerra o episódio persistindo o evento.
- `getFiringByUser(userId)` para hidratação REST do badge.

### 4.2 `NotificationStore` (`backend/src/shared/notifications/notification-store.ts`)

- Em memória, `Map<userId, Notification[]>`, cap 100 FIFO. `Notification = { id, alertId, alertName, meterId, targetType, targetPath (rota frontend pronta), message, createdAt }`.
- Módulo `notification`: `GET /api/notifications`, `DELETE /api/notifications/:id` (lida = excluída), `DELETE /api/notifications`. Sobrevive a reload, não a restart (requisito: não persistidas).

### 4.3 Módulo `alert` reescrito

- CRUD `{ name, meterId, referencePowerKw, tolerancePercent, enabled }` + `PATCH /api/alerts/:id/enabled`; lista paginada inclui `status: "firing"|"normal"` e dados do alvo. `GET /api/alerts/firing`. `GET /api/alert-events?alertId=&page=&pageSize=`.
- Remover `checkAndTrigger`, `PATCH /:id/read`, semântica one-shot. Generalizar `AlertNotifier` → `UserEventHub` (`backend/src/shared/sse/user-event-hub.ts`): `emit(userId, event, payload)`.

### 4.4 Contrato SSE (`backend/src/modules/iot/iot-stream.routes.ts`)

```text
connected     { meterCount }
reading       { meterId, voltage, current, powerW, powerFactor, receivedAt }
alert-firing  { type: "start"|"end", alertId, alertName, meterId, startedAt, endedAt? }
notification  { …Notification }
```

- `resolveUserDeviceIds` → `resolveUserMeterIds` (união dos 3 caminhos de posse) e **re-resolver o set a cada 60s** dentro da conexão (corrige o snapshot: medidor novo passa a transmitir sem reconectar).
- `server.ts`: wiring novo (UserEventHub, AlertEvaluator, NotificationStore, MinuteRollupScheduler, restore por Meter) — ponto único de integração, revisar com cuidado.

**Verificação:** Vitest do evaluator (histerese, episódio, disable durante firing) e do store; integração das rotas; `curl -N` simulando potência fora da faixa.

---

## Fase 5 — Frontend

### 5.1 Remoções

- Registro manual: `ConsumptionForm*`, `ConsumptionFormDialog`, `ConsumptionRowMenu`, botão "Registrar consumo", `useConsumptionMutations`.
- Relatórios por entidade: rotas `/…/relatorio`, `pages/report/*ReportPage`, botões "Gerar relatório" nas details pages; `ReportView` e satélites (reaproveitar `ReportChart`/padrões antes de excluir).
- Dashboard: `DashboardView`, `lib/dashboard/`, `useDashboard` → `DashboardPage` vira placeholder (`EmptyState` "em construção").
- CRUD de distribuidora: `/distribuidoras/nova`, `/distribuidoras/:id/editar`, forms → `DistributorsPage` vira catálogo somente leitura (tarifas, UF, tributos).
- `lib/sse/alertStream.ts` + `useAlertStream` → substituídos.

### 5.2 Novos componentes/hooks (reutilizando padrões existentes: Section wrapper, FormDialog, EmptyState, formatters, queryKeys)

- **`ui/Pagination.tsx`** + tipo `Paginated<T>`; adaptar todos os hooks de lista (`useProperties`, `useAreas`, `useDevices`, `useAlerts`, …) ao shape `{ items, total, page, pageSize }` e `queryKeys` com page.
- **SSE**: `lib/sse/appStream.ts` + `hooks/useAppStream.ts` + `contexts/RealtimeContext` (montado no `AppShell`): `readingsByMeterId` (última leitura), `firingAlerts` (hidratado por `GET /api/alerts/firing` + eventos), notificações (hidratadas por `GET /api/notifications`; toast sonner ao chegar).
- **`components/meter/`**: `MeterSection` (vincular/editar/remover medidor nas details pages, form de conexão), `RealTimeCard` (Tensão rms XXX,XXV / Corrente rms XXX,XXA / Potência ativa média XXXX,XXW; estado "sem leitura recente" se última > ~10 s; só aparece se o alvo tem medidor). Hooks `useMeterByTarget`, `useMeterMutations`.
- **`components/consumption/` reescrito**: `GranularityTabs` (details = Hora|Dia; relatórios = Hora|Dia|Mês|Ano; adaptação do `ConsumptionPeriodFilter`), `ConsumptionChart` (recharts BarChart, padrão `ReportChart`) **acima** da `ConsumptionTable` (somente leitura: período, kWh, custo, potência média + `Pagination`), orquestrados por `ConsumptionSection` (mantém padrão de 3 wrappers por target). Hook `useConsumption(targetType, targetId, granularity, page)`.
- **Header**: `NotificationDropdown` (evolução do `AlertBellBadge`: lista; clique na notificação → `navigate(targetPath)` + DELETE; ícone check ao lado marca como lida/exclui) + `WarningBadge` separado (âmbar, medidores atualmente em disparo via `firingAlerts`; some quando o consumo normaliza).
- **`pages/alert/AlertsPage` reescrita**: área (a) alertas criados — nome, alvo, kW de referência, tolerância %, toggle enabled, status firing/normal, editar/excluir + criação com seletor de medidor; área (b) histórico de disparos (`AlertTriggerEvent`) paginado — alerta (nome), início, fim, duração, min/max/avg kW.
- **`pages/report/ReportsPage`** (rota `/relatorios` — corrige o gap do menu): seletor cascata de alvo (propriedade → área → dispositivo), `GranularityTabs` com os 4 níveis, tabela paginada + banner placeholder "montagem de relatórios em breve".
- **`pages/simulation/SimulationPage`** placeholder + item "Simulação" (ícone `Calculator`) em `frontend/src/config/navigation.ts` + rota `/simulacao`.
- **Property form**: select de distribuidora (catálogo), `electricalSystem`, `billingClass`, CIP (R$). Atualizar `schemas/property.schema.ts` e services.

### 5.3 Rotas (`frontend/src/routes/AppRouter.tsx`)

Adicionar `/relatorios`, `/simulacao`; remover as 3 rotas `/…/relatorio` e as de CRUD de distribuidora.

**Verificação:** Vitest de components/hooks; Playwright do fluxo principal.

---

## Ordem de execução

1. Fase 1 (bloqueia tudo) → 2. Fase 2 → 3. Fases 3 e 4 (paralelizáveis; 4 depende da 2) → 4. Fase 5 (depende de 3 e 4; internamente Pagination/SSE primeiro).

Passe final: `npm run test` (backend e frontend), Playwright, `tsc`/lint.

## Verificação fim a fim

1. `prisma migrate reset` + seed → catálogo de distribuidoras visível em `/distribuidoras`.
2. Criar propriedade (distribuidora do catálogo, sistema elétrico, classe, CIP) → área → dispositivo.
3. Vincular medidor MQTT a um dispositivo; publicar payloads fake por segundo → `RealTimeCard` atualizando; após ~2 min, `meter_readings` com linhas por minuto e tabela Hora/Dia + gráfico nas details pages, com custo coerente com a fórmula por dentro.
4. Criar alerta (10 kW ± 2%) → publicar potência fora da faixa → `WarningBadge` acende; voltar ao normal → badge some, episódio no histórico da página de alertas, notificação no sino → clique navega ao medidor e a exclui.
5. Popular >31 buckets → paginação nas tabelas. Conferir `/relatorios` (4 granularidades) e placeholders de Dashboard e Simulação.

## Riscos e pontos de atenção

- **Volume**: ~525k linhas/medidor/ano; o unique `(meterId, minuteStart)` cobre as consultas; retenção/purge fica para depois (há `RetentionService` reutilizável).
- **Timezone**: buckets dia/mês/ano com `AT TIME ZONE 'America/Sao_Paulo'` (senão o "dia" vira 21h–21h). Testar virada de dia.
- **Dupla contagem**: agregação estritamente pelo medidor do alvo (sem somar subárvore).
- **Quebra em cadeia de testes/mocks** pela remoção de `ConsumptionRecord`/`IoTDeviceConfig` — orçar tempo nas fases 1–2.
- **`server.ts`** concentra o wiring novo — revisar shutdown/flush com atenção.
- Valores do seed são aproximações realistas (tarifas homologadas variam por reajuste anual) — documentar no seed.
