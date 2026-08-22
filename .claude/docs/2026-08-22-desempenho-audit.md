# Auditoria de Desempenho — 2026-08-22

## 1. Sumário executivo

Varredura completa e somente-leitura do monorepo (`backend/`, `frontend/`, `iot-simulator/`, `deploy/`, `render.yaml`, `docker-compose.yml`), sem restrição a diff — motivada pela leva de mudanças de go-live e pela demo pública já no ar (Render + Neon, ADR-0010) e pelo caminho self-hosted (Oracle + Caddy, ADR-0008).

**O código melhorou de verdade desde o laudo de 2026-08-05.** Seis achados foram fechados, três deles estruturais (buffer de potência O(n²) no navegador, `split("")` do RS-485, provider duplicado de TanStack Query). O gráfico "ao vivo" deixou de acumular 86 mil pontos no cliente e passou a ler baldes já agregados do servidor (`useMeterReadingHistory` + `buildDenseWindowBuckets`, ≤ 60 pontos). A política de cache do TanStack passou a ser única e documentada, com `refetchOnWindowFocus: false` justificado exatamente pelo fan-out que este laudo volta a apontar.

O que **não** mudou é justamente o que o deploy transformou de risco teórico em custo diário:

1. **Índices de FK continuam ausentes** (`properties.userId`, `areas.propertyId`, `devices.areaId`, `alerts.userId`, `properties.distributorId`). O Prisma não os cria no PostgreSQL. São as colunas mais filtradas do sistema — e o SSE as consulta por conexão a cada 60 s.
2. **O N+1 de `/api/alerts` e o fan-out de `/api/consumption`** seguem intactos, agora em três níveis de hierarquia (painel → propriedades, propriedade → áreas, área → dispositivos).
3. **`meter_readings` não tem retenção nem rollup** — e o keep-alive (UptimeRobot 12×/h + Actions 6×/h, ADR-0011) mantém a demo acordada 24/7, com 11 medidores publicando 1 amostra/s. Isso são ~15.840 linhas/dia, ~475 mil linhas/mês, crescendo para sempre num Neon free de 0,5 GB.
4. **Achado novo de infraestrutura: não há compressão HTTP em lugar nenhum.** Nem `compression` no Express, nem `encode` no `Caddyfile`. Todo JSON da API e todo o bundle estático do caminho self-hosted trafegam sem gzip/brotli — e o bundle não tem code-splitting, então `/login` baixa `recharts` + `react-markdown` inteiros.

**Contagem: 6 Alto · 13 Médio · 12 Baixo.** Seis achados do laudo anterior estão **resolvidos** (seção 5).

**Ressalva metodológica (inalterada e importante):** continua sem APM, tracing ou métricas de produção (`07-decisoes-em-aberto.md`). Nenhum `EXPLAIN`, profiler ou build de bundle foi executado — auditor read-only. Achados marcados **[MEDIR ANTES]** são trade-offs, não erros; `06-code-quality-standards.md` é explícito que para dados pequenos o código mais simples vence. A seção 6 lista o instrumental mínimo.

---

## 2. Escopo e metodologia

- Leitura estática de `backend/src/**` (237 arquivos), `frontend/src/**` (152 `.tsx` + hooks/libs), `iot-simulator/server/src/**`, `backend/prisma/schema.prisma` e **todas as 17 migrações SQL**.
- Infraestrutura lida: `docker-compose.yml`, `deploy/Caddyfile`, `deploy/demo-entrypoint.sh`, `render.yaml`, `.github/workflows/keep-alive.yml`.
- Contexto: `CLAUDE.md`, laudo `.claude/docs/2026-08-05-desempenho-audit.md` (para diferenciar regressão de dívida herdada), ADR-0008/0010/0011.
- **Premissas de carga usadas** (extraídas do código, não estimadas): 1 amostra/s por medidor (`iot-simulator/server/src/simulation/deviceRunner.ts`, `TICK_INTERVAL_MS = 1000`); **11 medidores** na demo (`demoBootstrap.ts`, `DEMO_DEVICES`); poll de 5 s default nos protocolos request/response; `pageSize` máximo 31 (`backend/src/shared/pagination.ts`), 30 na tabela de consumo (`frontend/src/types/consumption.types.ts`); SSE com `openWhenHidden: true`.

---

## 3. Achados

### 3.1 Impacto ALTO

---

**A-01 · Banco — índices ausentes nas FKs mais filtradas (herdado A-06, não corrigido)**

- **Área:** Backend / dados
- **Local:** `backend/prisma/schema.prisma` — `Property.userId`/`Property.distributorId` (linhas 334-364), `Area.propertyId` (366-379), `Device.areaId` (381-395), `Alert.userId` (509-527)
- **Evidência:** varredura completa das migrações confirma que **nenhum** `CREATE INDEX` cobre essas colunas. Os únicos índices existentes são `alerts_meterId_idx`, `alert_trigger_events_alertId_startedAt_idx`, os de `audit_logs`, `tariff_flag_history_createdAt_idx`, `mfa_backup_codes_userId_idx`, `refresh_tokens_userId_idx`, `auth_tokens_userId_idx` e os `UNIQUE`. O Prisma Migrate cria a *constraint* de FK mas **não** o índice no PostgreSQL (difere do MySQL).
- **Por que subiu de prioridade desde agosto:** os caminhos que dependem dessas colunas agora rodam em regime permanente na demo acordada 24/7:
  - `resolveUserMeterIds` (`backend/src/modules/iot/iot-stream.routes.ts:42-55`) faz `OR` de **três** relações aninhadas (`property.userId`, `area.property.userId`, `device.area.property.userId`) — executado **na abertura de cada conexão SSE e a cada 60 s enquanto ela viver** (`:163-188`).
  - `MeterRepository.findAllByUser`/`findAllByUserPaginated` (`meter.repository.ts:145-183`) repetem o mesmo `OR` de três níveis.
  - `resolveRootProperty` (`backend/src/shared/targetResolution.ts`) e `resolveMeterTarget` (`backend/src/modules/meter/meter-target.ts`) atravessam a mesma cadeia em todo request de consumo e de alerta.
  - As cascatas `ON DELETE CASCADE` (User → Property → Area → Device → Meter → MeterReading) fazem seq scan por linha removida sem esses índices.
- **Recomendação:** migração puramente aditiva — `@@index([userId])` em `Property` e `Alert`; `@@index([propertyId])` em `Area`; `@@index([areaId])` em `Device`; `@@index([distributorId])` em `Property`. Sem impacto de contrato, reversível.
- **[MEDIR ANTES]** com poucas centenas de linhas o planner escolhe seq scan de qualquer forma. `EXPLAIN (ANALYZE, BUFFERS)` em `resolveUserMeterIds` com volume realista antes de dar por concluído — mas o custo do índice também é próximo de zero, e a cascata já justifica.

---

**A-02 · Backend/Dados — N+1 em `AlertService.findAll` (1 a 4 queries por alerta), amplificado por SSE (herdado A-03, não corrigido)**

- **Área:** Backend / dados
- **Local:** `backend/src/modules/alert/alert.service.ts:86-89` → `:44-57` → `backend/src/modules/meter/meter-target.ts:26-70`
- **Evidência:** `findAll` faz `Promise.all(result.items.map((alert) => this.withStatusAndTarget(alert)))`, e cada `withStatusAndTarget` chama `resolveMeterTarget`, que executa `meterRepository.findById` seguido de **1 a 3 lookups sequenciais** (device → area → property). Um alerta de alvo `DEVICE` custa 4 round trips serializados. Uma página de 31 alertas: até **124 queries**, com 4 níveis de latência encadeada por item.
- **Amplificação em três camadas (todas confirmadas no código atual):**
  1. `frontend/src/pages/alert/AlertsPage.tsx:35` e `:39` disparam **duas** listagens — `useAlerts(page, 10)` e `useAlerts(1, 31)`. A segunda existe só para contar `enabled` (`:62-64`).
  2. `frontend/src/contexts/RealtimeContext.tsx:78-85`: **todo** evento `alert-firing` (tanto `start` quanto `end`) invalida `queryKeys.alerts.all`, refazendo as duas listagens → ~150 queries por episódio de alerta, em cada aba aberta.
  3. `resolveMeterTarget` roda de novo em `alert.service.ts:66` (create) e no fechamento de cada episódio (`alert-evaluator.ts:233`), este último dentro do pipeline de ingestão.
- **Recomendação:** substituir por **uma** query com `include` aninhado no `Meter` (`property`, `area: { include: { property } }`, `device: { include: { area: { include: { property } } } }`), ou `findMany({ where: { id: { in: meterIds } } })` em lote + `Map<meterId, target>` — O(n) round trips → O(1). Para o KPI, expor `enabledCount` no envelope paginado (ou `GET /api/alerts/stats`) em vez de baixar 31 itens hidratados.

---

**A-03 · Frontend + Backend — fan-out de `/api/consumption` em três níveis de hierarquia (herdado A-04, não corrigido)**

- **Área:** Frontend + Backend / dados
- **Local:**
  - `frontend/src/components/dashboard/PropertyComparisonSection.tsx:38-56` (1 requisição por **propriedade**)
  - `frontend/src/pages/property/PropertyDetailsPage.tsx:310-322` (1 por **área**)
  - `frontend/src/pages/area/AreaDetailsPage.tsx:316-328` (1 por **dispositivo**)
  - Backend: `backend/src/modules/consumption/consumption.service.ts:57-89`
- **Evidência:** cada requisição custa, no backend, uma cadeia majoritariamente **sequencial**: `resolveRootProperty` (1 query para `PROPERTY`, 2 para `AREA`, **3 para `DEVICE`**) + `meterRepository.findByTarget` + `distributorRepository.findById` + `tariffFlagRepository.get()` + `findAggregated` + `countBuckets` — **6 a 8 idas ao banco, duas delas varreduras agregadas sobre `meter_readings`**, a maior tabela do sistema.
- **Custo:** o caso pior é a página de área com N dispositivos: `N × 8` queries, das quais `N × 2` são `GROUP BY` completos. O painel com 10 propriedades soma ~14 requisições HTTP concorrentes (4 do `DashboardKpiRow`/`RealtimeSection` + 10 da comparação).
- **Desperdício explícito no código:** `PropertyComparisonSection.tsx:30-37` documenta que `pageSize: 3` existe *apenas* para não colidir a `queryKey` com a do KPI — o backend agrega e devolve 3 baldes onde só `items[0]` é usado.
- **Recomendação:** endpoint batch — `GET /api/consumption/summary?targetType=AREA&ids=a,b,c&granularity=month` — resolvendo tudo em 1 requisição e 1 query SQL com `GROUP BY "meterId", bucket`. Ganho intermediário e barato: cache in-process de `TariffFlagConfig` e do catálogo de distribuidoras (M-03), que já elimina 2 das 8 queries **de cada uma** das N chamadas (efeito multiplicativo).

---

**A-04 · Banco/Armazenamento — `meter_readings` sem retenção nem rollup, com a demo acordada 24/7 (herdado M-03, elevado a Alto pelo contexto de produção)**

- **Área:** Backend / dados + infraestrutura
- **Local:** `backend/prisma/schema.prisma:438-456`; `backend/src/shared/retention/retention.service.ts:40-52`
- **Evidência:** `RetentionService.purgeExpiredData` expurga **apenas** `auth_tokens`, `password_resets`, `audit_logs` e `refresh_tokens`. `meter_readings` não é tocado por nada.
  - Cardinalidade real da demo: `DEMO_DEVICES` tem **11 dispositivos** (`iot-simulator/server/src/simulation/demoBootstrap.ts:48-175`), cada um publicando 1 amostra/s (`deviceRunner.ts:5`). O `MinuteRollupScheduler` grava 1 linha por medidor por minuto → **11 × 1.440 = 15.840 linhas/dia ≈ 475.000 linhas/mês**, indefinidamente.
  - **O keep-alive fecha o círculo:** o ADR-0011 tornou o UptimeRobot o ping primário (a cada 5 min) e manteve o Actions como redundância (`cron: "7,17,27,37,47,57 * * * *"`). Ou seja, a instância do Render **nunca hiberna**, e o pipeline IoT roda 24/7 — o que antes era "acumula só enquanto alguém está usando" virou acúmulo contínuo. O banco é um Neon free (0,5 GB).
- **Custo secundário:** as agregações `hour`/`day`/`month`/`year` (`consumption.repository.ts:57-79`) varrem todas as linhas do intervalo a cada requisição, multiplicado pelo fan-out do A-03. E `findMonthlyKwhForYears` (`:113-126`) usa `date_trunc('year', ...) = ANY(...)` — expressão **não-sargável**, que força varredura de todas as leituras do medidor mesmo com índice.
- **Recomendação, em duas etapas de custo bem diferentes:**
  1. **Barato e imediato:** adicionar `meterReading` ao `RetentionService` com um `DATA_RETENTION_METER_READING_DAYS` (ex.: 90 dias) — mesmo padrão dos outros quatro, `deleteMany({ where: { minuteStart: { lt: threshold } } })`, coberto pelo índice `meter_readings_meterId_minuteStart_key` só parcialmente (avaliar um índice em `minuteStart` isolado para o expurgo). Resolve o problema de armazenamento sem componente novo.
  2. **Estrutural, só com número na mão:** tabela de rollup por hora/dia, preenchida incrementalmente pelo próprio `MinuteRollupScheduler`. Introduz componente/tabela novo → exige **ADR** (regra do `03-arquitetura.md`).
- **[MEDIR ANTES]** para a etapa 2: medir `findAggregated` com granularidade `hour` sobre 1 ano de dados de 1 medidor. Se couber no orçamento de latência, é YAGNI — a etapa 1 sozinha resolve.

---

**A-05 · Infraestrutura — nenhuma compressão HTTP e nenhum cache de assets em produção (achado NOVO)**

- **Área:** Infraestrutura / frontend
- **Local:** `deploy/Caddyfile:10-33`; `backend/src/app.ts:118-172`; `backend/package.json` (dependências)
- **Evidência:**
  - **Backend:** `createApp` monta `helmet`, `cors`, `cookieParser`, `pinoHttp`, rate limiters e `express.json()` — **não há `compression`**, e o pacote não está sequer no `package.json`. Toda resposta JSON da API sai sem gzip/brotli. Payloads de agregação (30 baldes × 4 campos), listagens paginadas e o export LGPD completo (que pode ter milhares de audit logs) trafegam crus.
  - **Caddy (caminho self-hosted, ADR-0008):** o `Caddyfile` tem `root`/`try_files`/`file_server` e um bloco `header` com diretivas de segurança, mas **nenhuma diretiva `encode zstd gzip`** e **nenhum `Cache-Control` para `/assets/*`**. O Caddy não comprime por padrão. Consequência: o bundle inteiro do Vite — que inclui `recharts` e `react-markdown` (ver M-04) — é servido descomprimido, e os arquivos com hash no nome são revalidados a cada carregamento (304 por asset) em vez de servidos do cache com `immutable`.
- **Custo:** JS/CSS text-based comprimem tipicamente 3-4×. Numa aplicação sem code-splitting, isso é a diferença mais barata de conseguir no first paint — e é uma linha de configuração.
- **Recomendação:**
  1. `Caddyfile`: adicionar `encode zstd gzip` no bloco do site e um `@static path /assets/*` com `header @static Cache-Control "public, max-age=31536000, immutable"` (seguro: Vite gera nomes com hash de conteúdo).
  2. Backend: `compression()` **antes** das rotas, com `filter` que exclua `/api/iot/stream` — comprimir SSE quebra o streaming (o buffer de compressão segura o chunk). Ou, alternativamente, deixar a compressão só no Caddy (`reverse_proxy` + `encode` no bloco pai cobre `/api/*` também) — o que é a opção mais simples e evita o risco no SSE por completo.
  3. Na demo do Render, o site estático já é comprimido pela plataforma, mas as respostas de `/api/*` vêm do serviço Docker e não são — o `compression` no Express (com o filtro do SSE) é o que cobre esse caminho.
- **Nota:** não requer medição prévia. É configuração ausente, não trade-off.

---

**A-06 · Frontend/Render — `RealtimeContext` re-renderiza toda a árvore consumidora a 1 Hz, inclusive em abas de fundo (herdado A-02, parcialmente aberto)**

- **Área:** Frontend / render
- **Local:** `frontend/src/contexts/RealtimeContext.tsx:71-76` e `:122`; `frontend/vite.config.ts:14`
- **Evidência:**
  - `onReading` faz `setReadingsByMeterId(prev => ({ ...prev, [id]: reading }))` a cada amostra, e o provider entrega `value={{ readingsByMeterId, isConnected }}` — **objeto literal recriado a cada render**. Todo consumidor de `useRealtime()` re-renderiza a 1 Hz × nº de medidores do usuário, inclusive quem só lê `isConnected` (`Header.tsx`).
  - Consumidores arrastados: `useLiveMeterReading` → `RealtimeSection` → `DashboardKpiRow` + `RealtimeChartCard` → `RealtimePowerChart` (recharts); `AreaDetailsPage` e `DeviceDetailsPage` inteiras.
  - **`openWhenHidden: true`** (`frontend/src/lib/sse/appStream.ts:205` e `:240`) mantém o stream — e portanto os re-renders — rodando com a aba em segundo plano. É uma decisão de produto justificada no comentário, mas o custo de render é pago mesmo sem ninguém olhando.
  - **O React Compiler continua desligado:** `vite.config.ts` usa `react()` sem `babel-plugin-react-compiler`, e o plugin não está no `package.json`. Busca por `memo(`/`useCallback`/`useMemo` em `frontend/src` (excluindo testes) retorna **7 ocorrências no app inteiro**, em 5 arquivos. O código foi escrito assumindo o compilador (comentários em `useMeterReadingHistory.ts:54-55` citam explicitamente "as regras do React Compiler") e colhe zero benefício dele.
- **O que já melhorou:** o achado irmão A-01 do laudo anterior (buffer de potência O(n) por amostra, 86k pontos) foi **resolvido** — a série vem do servidor com ≤ 60 baldes. O que sobra é o custo de reconciliação, não de agregação.
- **Recomendação, em ordem de custo/benefício:**
  1. Habilitar `babel-plugin-react-compiler` no `vite.config.ts`. O código já é compiler-clean por lint (`eslint-plugin-react-hooks` v7 nas configs) — memoiza o `value` do provider e os componentes automaticamente, sem reescrita.
  2. Separar `RealtimeConnectionContext` (`isConnected`, muda raramente) de `RealtimeReadingsContext`.
  3. Para muitos medidores: store externo + `useSyncExternalStore(subscribe, () => store.get(meterId))` — só o card daquele medidor re-renderiza.
- **[MEDIR ANTES]** React DevTools Profiler com "why did this render", 60 s no Painel, antes e depois de (1).

---

### 3.2 Impacto MÉDIO

---

**M-01 · IoT/Dados — `upsertMinute` gasta 2 queries por medidor por minuto e tem corrida de read-modify-write (herdado M-01)**

- **Local:** `backend/src/modules/meter/meter-reading.repository.ts:30-79`; chamado em `backend/src/modules/iot/iot-worker/MinuteRollupScheduler.ts:93-95`
- **Evidência:** `findUnique` → `create` **ou** `update`. `Promise.allSettled` sobre todos os snapshots faz N medidores custarem **2N round trips**, todos no mesmo instante (o scheduler alinha o flush ao segundo `:00`, `MinuteRollupScheduler.ts:37-50`). Na demo: 22 queries em rajada a cada minuto cheio.
- **Recomendação:** um único `INSERT ... ON CONFLICT ("meterId","minuteStart") DO UPDATE SET ...` com a média ponderada expressa em SQL, usando o índice único já existente. Reduz a 1 statement e **elimina a corrida** — hoje dois flushes concorrentes podem perder energia.
- **[MEDIR ANTES]** logar `snapshots.length` e a duração de `persist` por flush. Com 11 medidores é irrelevante; a partir de algumas centenas vira o gargalo do minuto.

---

**M-02 · Backend/Dados — `countBuckets` duplica a agregação completa só para paginar (herdado M-02, agravado)**

- **Local:** `backend/src/modules/consumption/consumption.repository.ts:81-98`, disparado em paralelo com `findAggregated` em `consumption.service.ts:86-89`
- **Evidência:** a subquery de `countBuckets` repete **exatamente** o mesmo `WHERE` + `date_trunc` + `GROUP BY` de `findAggregated`, só para contar os grupos. Custo de I/O e agregação dobrado em toda listagem de consumo — a query mais cara do sistema, multiplicada pelo fan-out do A-03.
- **Agravante novo:** a paginação numerada (`frontend/src/components/ui/Pagination.tsx` + `lib/paginationRange.ts`) **exige** `total` exato para desenhar a faixa `« ‹ 1 … n › »`, então a saída "devolver `hasMore` em vez de `total`" deixou de ser viável sem regressão funcional.
- **Recomendação:** `COUNT(*) OVER ()` como coluna adicional em `findAggregated` — uma varredura só, preserva o `total` exato e a numeração de páginas.

---

**M-03 · Backend/Cache — leituras quase-estáticas relidas do banco a cada requisição (herdado M-04)**

- **Local:** `backend/src/modules/consumption/consumption.service.ts:71-80`; `backend/src/modules/tariff-flag/tariff-flag.repository.ts:49-52`; `backend/src/modules/distributor/distributor.repository.ts:51-54`
- **Evidência:** `tariffFlagRepository.get()` lê um **singleton de linha única** (`where: { id: 1 }`) em toda chamada de `/api/consumption`; `distributorRepository.findById` lê um registro de um **catálogo global somente-leitura, populado por seed**. Ambos entram na cadeia serializada de `await` antes das agregações.
- **Recomendação:** cache em memória de processo. A bandeira tem invalidação natural e barata: só muda via `TariffFlagRepository.update` (admin) ou pelo `TariffFlagSyncScheduler` (1×/24h) — exatamente o padrão de invalidação seletiva que o `AlertEvaluator` já usa. Distribuidoras: TTL de minutos. Remove 2 das ~8 queries de **cada uma** das N chamadas do A-03.
- **Nota de arquitetura:** é o gatilho "mesma leitura cara repetida muitas vezes → cache" do `03-arquitetura.md`. Cache in-process não introduz componente de infra novo (não é Redis) — cabe sem violar a trava anti-over-engineering.

---

**M-04 · Frontend/Bundle — nenhum code-splitting; `recharts` e a stack markdown no chunk inicial (herdado M-10)**

- **Local:** `frontend/src/routes/AppRouter.tsx:1-24`; `frontend/vite.config.ts` (sem `build.rollupOptions.manualChunks`)
- **Evidência:** as 22 páginas são importadas estaticamente. Busca por `React.lazy|lazy\(|Suspense` em `frontend/src` retorna **zero** ocorrências. Consequência: `/login` e `/` (rotas públicas, primeiro contato — e a demo pública existe justamente para primeiro contato) baixam também:
  - `recharts` — usado só em `ConsumptionChart.tsx` e `RealtimePowerChart.tsx`;
  - `react-markdown` + `remark-gfm` — usados só em `LegalDocumentPage.tsx` e `AboutPage.tsx`.
  - `@tanstack/react-query-devtools` é importado estaticamente em `App.tsx:7` com guarda `import.meta.env.DEV &&` só no JSX. O Rollup normalmente elimina a branch morta e depois o import, mas isso depende de `sideEffects` do pacote e não deve ser assumido sem verificar.
- **Interação com A-05:** sem compressão **e** sem splitting, o custo de rede do primeiro carregamento é o produto dos dois problemas. Corrigir A-05 primeiro (uma linha) rende mais por esforço.
- **Recomendação:** `React.lazy` por rota, com `Suspense` no `AppShell` reaproveitando o skeleton já existente; `manualChunks` separando `recharts` e a stack markdown; import dinâmico do devtools.
- **[MEDIR ANTES]** rodar `rollup-plugin-visualizer` no build atual e registrar o baseline (gzip do chunk inicial). Sem esse número, "o bundle está grande" é palpite.

---

**M-05 · IoT — polling sem guarda de reentrância, sem timeout, sem backoff e sem reconexão (herdado M-05)**

- **Local:** `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:78` (Modbus TCP), `:207` (Modbus RTU), `:313` (EtherNet/IP), `:489` (PROFINET)
- **Evidência:** os quatro adaptadores usam `setInterval(() => { void (async () => { ... await read() ... })() }, intervalMs)`. `setInterval` **não espera** a promise anterior: leitura mais lenta que o intervalo (PLC lento, rede degradada, TCP em retransmissão) faz as execuções se acumularem — promises pendentes sem limite, requisições enfileiradas no mesmo socket, memória crescendo proporcional ao atraso. Nenhuma leitura tem timeout próprio.
- **Agravante:** no `catch` grava-se `logger.error({ ..., err }, "Erro na leitura")` a cada intervalo. Com um PLC caído: 12 objetos de erro serializados por minuto por medidor, indefinidamente, sem backoff, sem reconexão (`connected` continua `true`).
- **Recomendação:** laço auto-agendado (`setTimeout` reagendado **após** a conclusão), flag `inFlight`, timeout por leitura via `Promise.race`, backoff exponencial no erro e teto de erros consecutivos que dispare reconexão. O mesmo esqueleto serve para os quatro.

---

**M-06 · IoT — payload dos adaptadores não-MQTT nunca passa na validação: 100% de descarte + 1 `log.warn` por poll (herdado M-06)**

- **Local:** `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:64-76` e `:112-115` vs. `ModbusTcpConnection.ts:99-103` (`{register, value, timestamp}`), e os análogos em Modbus RTU, EtherNet/IP e PROFINET
- **Evidência:** `isValidPayload` exige `voltage`, `current`, `powerW` e `powerFactor`. Nenhum dos quatro adaptadores emite esses campos. Todo poll cai em `log.warn({ meterId, payload: rawData }, "Leitura inválida descartada")`, serializando o payload inteiro a cada 5 s por medidor.
- **Impacto de desempenho:** volume de log e serialização puramente desperdiçados. **Impacto funcional (fora do escopo, mas decisivo para priorizar):** nenhum dado é ingerido por Modbus, EtherNet/IP ou PROFINET — só MQTT funciona ponta a ponta.
- **Recomendação:** mapear registros/tags para as grandezas elétricas dentro de cada adaptador (a config `extra` do `Meter` já existe para carregar o mapa). Enquanto isso não existir, rebaixar o log de descarte para `debug` ou aplicar sampling (1 a cada 100).

---

**M-07 · SSE — `JSON.stringify` por listener e `res.write()` sem tratamento de backpressure (herdado M-07)**

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:137-141`
- **Evidência:**
  ```ts
  const readingUnsub = processor.addSampleListener((sample) => {
      if (!userMeterIds.has(sample.meterId)) return
      const payload = JSON.stringify(sample)   // uma vez POR CLIENTE
      res.write(`event: reading\ndata: ${payload}\n\n`)
  })
  ```
  `IoTDataProcessor.process` itera todos os listeners (`IoTDataProcessor.ts:153-160`); com C clientes do mesmo usuário, a **mesma** amostra é serializada C vezes. O retorno de `res.write()` é ignorado — com cliente lento, o Node acumula o buffer do socket em memória sem limite, e `openWhenHidden: true` mantém abas de fundo conectadas indefinidamente.
- **Recomendação:** serializar a amostra **uma vez** no `IoTDataProcessor` e reusar a string em todos os listeners; observar o retorno de `res.write()` e, quando `false`, pular amostras até `drain` — para dado ao vivo, descartar é melhor que enfileirar.

---

**M-08 · SSE — re-resolução de posse por conexão a cada 60 s (herdado M-08)**

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:163-188` + `:42-55` + `:64-73`
- **Evidência:** cada conexão SSE roda, por minuto, **duas** queries: `isSessionStillValid` (lookup em `auth_tokens`, indexado, barato) e `resolveUserMeterIds` (o `OR` de 3 relações aninhadas, hoje **sem índices** — A-01). C abas abertas = 2C queries/min permanentes, mesmo com a aba ociosa e mesmo que o usuário nunca crie ou remova medidores.
- **Recomendação:** invalidação em vez de polling — o `MeterService` já notifica o `IoTConnectionManager` em create/update/delete; publicar o mesmo sinal no `UserEventHub` e recarregar o `Set` só nesse evento. Se manter o polling for a escolha KISS (a revalidação de sessão do #184 continua precisando de um tick), ao menos desacoplar os dois intervalos: sessão a cada 60 s (barato, indexado), medidores a cada 5 min ou por evento.

---

**M-09 · Simulador — snapshot completo re-serializado por evento: O(D² × C) por segundo (herdado M-09)**

- **Local:** `iot-simulator/server/src/api/routes/status.routes.ts:20-25`; `iot-simulator/server/src/simulation/store.ts:186-195` e `:104-110`
- **Evidência:** cada `DeviceRunner` publica 1 amostra/s e chama `store.recordSample`, que emite `changed` (`store.ts:194`). Cada `changed` faz **cada cliente SSE** executar `store.snapshot()` — que materializa todas as redes com spread de todos os devices (`[...network.devices.values()]`) — e `JSON.stringify` do resultado inteiro. Com D devices ligados e C clientes: **D eventos/s × O(D) × C = O(D²·C) por segundo**. Com os 11 devices da demo e 2 abas do painel do simulador abertas: ~242 materializações completas por segundo.
- **Nota adicional:** `SimulationStore extends EventEmitter` com o limite padrão de 10 listeners — a 11ª aba SSE emite `MaxListenersExceededWarning`.
- **Recomendação:** coalescer as notificações numa janela (`setInterval` de 250 ms que emite no máximo um snapshot) e serializar **uma vez** por janela, reusando a string para todos os clientes. Preserva o contrato "snapshot completo" que o comentário em `status.routes.ts:8-9` declara como requisito.

---

**M-10 · Backend/Memória — export LGPD sem limite e PDF gerado sincronamente na requisição (herdado M-12)**

- **Local:** `backend/src/shared/audit/audit.repository.ts:47-52` (`findByUserId` sem `take`); `backend/src/modules/export/export.service.ts:61-70`; `backend/src/modules/export/export.controller.ts:26-36`
- **Evidência:** `findByUserId` carrega **todos** os audit logs do titular (retenção default ~2 anos) materializados em memória junto com propriedades, áreas, dispositivos e alertas — e `generateDataExportPdf` itera linha a linha escrevendo no `PDFDocument`. Tudo no caminho da requisição HTTP, bloqueando o event loop do processo único, que na demo é o **mesmo processo** que roda o pipeline IoT.
- **Recomendação:** limitar a janela do audit log no export (ex.: 12 meses, com nota no documento) ou paginar/streamar a geração. Histórico completo obrigatório → job assíncrono com download posterior (gatilho de ADR pelo `03-arquitetura.md`).
- **[MEDIR ANTES]** contar quantos `AuditLog` uma conta ativa acumula em 12 meses no ambiente real. Dezenas: não-problema. Milhares (login/logout de sessões curtas geram muitos): bloqueio de segundos.

---

**M-11 · Backend/Dados — `resolveRootProperty` e `resolveMeterTarget` fazem até 3 round trips sequenciais para o que é uma query só**

- **Local:** `backend/src/shared/targetResolution.ts:21-47`; `backend/src/modules/meter/meter-target.ts:26-70`
- **Evidência:** para `targetType === "DEVICE"`: `deviceRepository.findById` → `areaRepository.findById(device.areaId)` → `propertyRepository.findById(area.propertyId)`, cada uma aguardando a anterior. Três latências de rede encadeadas onde um `findUnique({ where: { id }, include: { area: { include: { property: true } } } })` resolve em uma. Chamado no caminho de **toda** requisição de `/api/consumption` e `/api/meter-readings`, e (via `resolveMeterTarget`) por alerta listado.
- **Interação:** é o multiplicador escondido do A-02 e do A-03 — não é um problema separado, é o que torna os dois piores do que parecem.
- **Recomendação:** uma query por nível de alvo com `include` aninhado, encapsulada no repository. O contrato público das funções (`Promise<PropertyResponse>` / `Promise<MeterTargetInfo | null>`) não muda.

---

**M-12 · Infraestrutura — pool de conexões do Prisma/pg sem configuração explícita (achado NOVO)**

- **Local:** `backend/src/shared/database/prisma.ts:17-19`
- **Evidência:** `new PrismaPg({ connectionString: env.DATABASE_URL })` — nenhum `max`, `idleTimeoutMillis` ou `connectionTimeoutMillis`. O `pg` default é `max: 10`. Isso encontra três consumidores concorrentes que o código já garante:
  - a rajada sincronizada do `MinuteRollupScheduler` no segundo `:00` (2 queries × N medidores, todas disparadas juntas — M-01);
  - o polling por conexão SSE a cada 60 s (M-08);
  - o fan-out de `/api/consumption` (A-03), que abre N requisições HTTP concorrentes, cada uma com 6-8 queries.
  Numa demo Neon free (limite de conexões conservador) ou numa VM Oracle Always Free, isso é exatamente o perfil que produz esperas no pool difíceis de diagnosticar — aparecem como latência, não como erro.
- **Recomendação:** dimensionar explicitamente (`max` compatível com o limite do provedor, `connectionTimeoutMillis` para falhar rápido em vez de enfileirar) e registrar o número escolhido junto do racional. Se o Neon exigir pooling externo (PgBouncer/`-pooler` endpoint), documentar no `DEPLOY.md`.
- **[MEDIR ANTES]** instrumentar espera de aquisição do pool (`pg` expõe `totalCount`/`idleCount`/`waitingCount`) e observar durante um flush. Sem esse número, qualquer valor de `max` é chute — mas *nenhum* valor explícito é pior que um chute informado.

---

**M-13 · IoT — MQTT com `reconnectPeriod: 0` contradiz a premissa documentada do entrypoint da demo (achado NOVO)**

- **Local:** `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:52`; `deploy/demo-entrypoint.sh:59-63`
- **Evidência:** `const opts: Record<string, unknown> = { reconnectPeriod: 0 }` **desabilita** a reconexão automática do cliente MQTT. O comentário do entrypoint da demo afirma o oposto:
  > *"O cliente MQTT do backend reconecta sozinho quando o broker subir, então subir o backend assim mesmo degrada a demo por alguns segundos em vez de deixá-la fora do ar por inteiro."*
  Na prática, se o simulador não ficar pronto nos 30 s de `READINESS_TIMEOUT_SECONDS` (ou se o broker cair depois), o backend sobe/segue com o medidor permanentemente desconectado até um restart manual — sem log de erro recorrente indicando isso.
- **Impacto:** não é latência, é **ausência total de dado** — que se manifesta como um painel que parece funcionar mas nunca atualiza. É o modo de falha mais caro de diagnosticar.
- **Recomendação:** definir `reconnectPeriod` (ex.: 5000) e tratar os eventos `reconnect`/`offline`/`close` para refletir `connected` corretamente, ou — se o `0` for deliberado (reconexão gerenciada pelo `IoTConnectionManager`) — implementar essa reconexão de fato e corrigir o comentário do entrypoint, que hoje documenta um comportamento que não existe.

---

### 3.3 Impacto BAIXO

---

**B-01 · Frontend — `staleTime` uniforme para dados quase-estáticos (herdado B-02)**

- **Local:** `frontend/src/hooks/queries/useDistributors.ts:10-14`; `frontend/src/hooks/queries/useTariffFlag.ts:6-10`
- **Evidência:** ambos herdam o default de 30 s. O catálogo de distribuidoras é somente-leitura populado por seed; a bandeira vigente muda ~1×/mês e é sincronizada 1×/24h pelo `TariffFlagSyncScheduler`. `useTariffFlag` é montado no `DashboardKpiRow`, que fica na tela mais visitada.
- **Recomendação:** `staleTime: Infinity` (ou horas) para distribuidoras, ~1h para a bandeira. Com `refetchOnWindowFocus: false` já ativo, o ganho é menor que no laudo anterior — mas continua eliminando refetches em cascata a cada remontagem.

---

**B-02 · Frontend — `useLiveMeterReading` re-renderiza a cada 2 s independente de dado novo (herdado B-06)**

- **Local:** `frontend/src/hooks/useLiveMeterReading.ts:27-30`
- **Evidência:** `setInterval(() => setNow(Date.now()), 2_000)` força um render a cada 2 s em todo componente que usa o hook, mesmo sem leitura nova e mesmo quando `isStale` não muda de valor. Somado ao A-06, é uma segunda fonte constante de renders — e roda em três páginas.
- **Recomendação:** derivar `isStale` de um `setTimeout` agendado para o instante exato em que a leitura expiraria (`receivedAt + 10s`), reagendado a cada leitura — zero renders enquanto o dado estiver fresco.

---

**B-03 · Backend/Concorrência — `AlertEvaluator.evaluate` disparado sem `await`, permitindo episódio duplicado (herdado B-07)**

- **Local:** `backend/src/server.ts:81-83` (`void alertEvaluator.evaluate(...)`); `backend/src/modules/alert/alert-evaluator.ts:198-250`
- **Evidência:** o listener não aguarda a promise. Duas amostras próximas podem entrar concorrentemente em `evaluateAlert` para o mesmo `alertId` e ambas satisfazer `insideStreak >= CLOSE_AFTER_CONSECUTIVE_INSIDE` antes de `state.firing = false` ser aplicado (linha 246, **depois** de dois `await`) — resultando em dois `AlertTriggerEvent` gravados, duas resoluções de `resolveMeterTarget` (2-4 queries cada) e duas notificações.
- **Recomendação:** marcar `state.firing = false` de forma síncrona antes dos `await` de `closeEpisode`, ou serializar por medidor com um mutex leve.

---

**B-04 · Backend — `getFiringByUser` varre todos os episódios em memória, que nunca são podados (herdado B-08)**

- **Local:** `backend/src/modules/alert/alert-evaluator.ts:120-133` e `:52-53`
- **Evidência:** itera o `Map` `episodes` inteiro — que acumula uma entrada por alerta **de todos os usuários** já avaliado desde o boot. A entrada nunca é removida quando o episódio fecha (só quando o alerta é desabilitado/excluído via `invalidateMeter`). `GET /api/alerts/firing` é chamado na hidratação do badge e reinvalidado a cada evento `alert-firing` (`RealtimeContext.tsx:78-81`).
- **Impacto:** O(total de alertas do sistema) por chamada, no processo único. Trivial hoje, cresce linearmente com a base.
- **Recomendação:** índice auxiliar `Map<userId, Set<alertId>>` mantido apenas com os episódios em `firing`.

---

**B-05 · Backend — queries de expurgo sem índice de suporte (herdado B-04)**

- **Local:** `backend/src/modules/auth/auth.repository.ts:164-174`, `:178-185`, `:340-350`
- **Evidência:** `deleteMany` com `OR` sobre `revokedAt`/`expiresAt`/`usedAt` — nenhuma dessas colunas é indexada. Seq scan garantido. Roda 1×/24h em tabelas pequenas e já expurgadas.
- **Impacto:** aceitável hoje. Vira problema se `auth_tokens` crescer (sessões curtas com muitos logins), e vira problema **imediatamente** se o expurgo de `meter_readings` da recomendação A-04 for adicionado sem índice em `minuteStart`.

---

**B-06 · Backend/Memória — mapas em memória sem poda por usuário/medidor**

- **Local:** `backend/src/shared/notifications/notification-store.ts:24`; `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:88`; `backend/src/modules/iot/iot-worker/MinuteBuffer.ts:95`
- **Evidência:** `NotificationStore.byUser` cresce com o número de usuários que já receberam alguma notificação e só encolhe via `removeAll` explícito (o "marcar todas como lidas" recém-adicionado, que depende de ação do usuário). `IoTDataProcessor.lastSampleAt` e `MinuteBuffer.latest` são chaveados por `meterId` e nunca limpos — o comentário em `IoTDataProcessor.ts:85-87` argumenta corretamente que o volume é limitado ao nº de medidores, mas entradas de medidores **removidos** permanecem para sempre.
- **Impacto:** limitado (cap de 100 notificações/usuário; nº de medidores é pequeno). É vazamento lento em processo de longa duração, não um problema atual.
- **Recomendação:** limpar `lastSampleAt`/`latest` no `IoTConnectionManager.stop(meterId)`. Para `NotificationStore`, um TTL ou poda no `findAllByUser` resolveria sem estrutura nova.

---

**B-07 · Frontend — `RealtimePowerChart`/`ConsumptionChart` sem `React.memo`, reconciliados a 1 Hz**

- **Local:** `frontend/src/components/realtime/RealtimePowerChart.tsx:70-117`; `frontend/src/components/realtime/RealtimeChartCard.tsx:36-37`
- **Evidência:** `RealtimeChartCard` é filho de `RealtimeSection`, que re-renderiza a 1 Hz por causa do A-06. O `useMemo` interno acerta (o array `buckets` só muda no refetch de 30 s), mas o `LineChart` do recharts é reconciliado a cada render mesmo com props idênticas — recharts monta uma árvore SVG considerável.
- **Recomendação:** cai por si com o React Compiler (A-06, recomendação 1). Sem ele, `React.memo` nos dois gráficos é uma linha.
- **Ponto positivo já presente:** `isAnimationActive={false}` no gráfico de alta frequência (`RealtimePowerChart.tsx:110`) — correto, manter.

---

**B-08 · Frontend — `AlertsPage` dispara duas listagens só para computar um KPI**

- **Local:** `frontend/src/pages/alert/AlertsPage.tsx:35`, `:39`, `:62-64`
- **Evidência:** `useAlerts(page, 10)` para a tabela **e** `useAlerts(1, 31)` só para contar `enabled` no cliente. A segunda paga o N+1 completo do A-02 (até 124 queries) para produzir um número inteiro.
- **Recomendação:** expor `enabledCount` no envelope paginado de `/api/alerts` — resolve o KPI com zero requisições extras e zero queries extras.

---

**B-09 · Backend — teto de `pageSize` 31 usado como sinônimo de "tudo" (herdado B-03)**

- **Local:** `backend/src/shared/pagination.ts:7-10`
- **Evidência:** o teto de 31 é deliberado e documentado. O efeito colateral persiste: `AlertsPage.tsx:39`, `:46`, `DashboardPage.tsx:37` e `ConsumptionHistorySection.tsx:17` usam "31" como "traga tudo". A tabela de consumo (`CONSUMPTION_PAGE_SIZE = 30`) com janela de hora (60 minutos) sempre gasta 2 páginas.
- **Recomendação:** manter o teto para listas de recursos; permitir um teto maior (ex.: 366) especificamente para `/api/consumption` e `/api/meter-readings`, que devolvem baldes agregados leves, não linhas de recurso.

---

**B-10 · Backend — `findAllConnectionConfigs` faz `findMany()` sem `select`**

- **Local:** `backend/src/modules/meter/meter.repository.ts:255-258`
- **Evidência:** `this.prisma.meter.findMany()` traz todas as colunas de todos os medidores do sistema no boot, quando `toConnectionConfig` usa 7 campos. Roda uma vez por boot — mas a demo do Render reinicia com frequência (deploys, hibernação forçada).
- **Recomendação:** `select` explícito com os campos de `MeterConnectionConfig`. Custo de mudança: uma linha.

---

**B-11 · Frontend — `ReactQueryDevtools` importado estaticamente**

- **Local:** `frontend/src/App.tsx:7` e `:25-27`
- **Evidência:** import estático com guarda `import.meta.env.DEV &&` só no JSX. A eliminação depende do `sideEffects` do pacote. Verificar no bundle antes de assumir que sumiu (o `main.tsx:8-12` documenta que a duplicação anterior já foi corrigida — este é o resíduo).

---

**B-12 · Frontend — `resolveConsumptionWindow` com granularidade `hour` invalida a `queryKey` na virada de hora**

- **Local:** `frontend/src/lib/consumptionWindow.ts:59-65`; `frontend/src/hooks/queries/useConsumption.ts:43-45`
- **Evidência:** a `queryKey` inclui `from.toISOString()|to.toISOString()`. Para `hour`, esses valores mudam na virada de hora — o TanStack Query trata como query **nova** (não refetch), reintroduzindo `isLoading` e um skeleton no meio da sessão, além de deixar a entrada antiga ocupando cache até o `gcTime`.
- **Impacto:** cosmético e raro (1×/hora). Registrado por completude — a solução do `useMeterReadingHistory` (chavear só por alvo e recalcular a janela dentro do `queryFn`, `queryClient.ts:118-121`) já é o padrão correto e existe no projeto.

---

## 4. Pontos fortes confirmados

Registrados para que não sejam "otimizados" por engano:

- **Agregação empurrada para o SQL, com defesa em profundidade.** `consumption.repository.ts` e `meter-reading.repository.ts` fazem `date_trunc` + `SUM` + média ponderada no Postgres, via `Prisma.sql` parametrizado, com **whitelist explícita** do argumento de `date_trunc` e da direção do `ORDER BY` (mapas fechados `TRUNC_UNIT`/`ORDER_DIRECTION`). Segurança e performance na mesma decisão.
- **Índice composto correto para a tabela quente.** `@@unique([meterId, minuteStart])` cobre exatamente o predicado das agregações (`meterId = ? AND minuteStart >= ? AND minuteStart < ?`).
- **`localTsExpr()`/`rangeFilter` extraídos para `shared/database/timeBucket.ts`** — a mesma expressão de fuso compartilhada pelos dois repositórios que agregam `meter_readings`, sem divergência possível.
- **Paginação universal aplicada.** Todos os repositórios de listagem usam `skip`/`take` + `count` em `Promise.all`. As exceções sem paginação (`findAllByUser`) estão restritas ao export LGPD e documentadas no código.
- **Estruturas de dados adequadas no caminho quente.** `MinuteBuffer` usa `Map<meterId, Map<minuteMs, bucket>>` (O(1)); `AlertEvaluator` usa cache `Map` com invalidação seletiva por medidor; `IoTDataProcessor` e `UserEventHub` usam `Set` para listeners; `resolveUserMeterIds` devolve `Set` e o filtro do SSE usa `.has()`; `buildDenseWindowBuckets` monta um `Map` de lookup em vez de `find` aninhado.
- **`select` enxuto nos caminhos por requisição.** `AuthRepository.findActiveToken` traz 4 campos + `user.role` — resolve autenticação e RBAC numa query só, com justificativa escrita.
- **Repositories instanciados uma vez no setup das rotas**, não por requisição (`consumptionRoutes` e análogos).
- **Formatadores `Intl` em escopo de módulo**, nunca dentro do render (`lib/formatters/consumption.ts`, `RealtimePowerChart.tsx:14`, `DashboardKpiRow.tsx:28`).
- **`refetchOnWindowFocus: false` com justificativa escrita e correta** (`lib/queryClient.ts:24-33`) — cita nominalmente o fan-out do A-03 como motivo e marca quando revisitar.
- **`stop_grace_period: 30s` no compose e encaminhamento de sinal no `demo-entrypoint.sh`** — o `flushAll()` do `MinuteBuffer` no shutdown não é perdido em hibernação/deploy.
- **`bcrypt.compare` em laço já mitigado** — `auth.service.ts` faz short-circuit para códigos TOTP de 6 dígitos antes de comparar backup codes.

---

## 5. Resolvido desde o laudo de 2026-08-05

| Achado anterior | Estado | Evidência |
|---|---|---|
| **A-01** buffer de potência O(n)/amostra, 86k pontos, `useMemo` que nunca acerta | **Resolvido** | `usePowerHistory.ts` não existe mais; substituído por `useMeterReadingHistory` (servidor agrega) + `buildDenseWindowBuckets` (≤ 60 baldes, `Map` de lookup) |
| **A-05** `Rs485Connection` com `split("")` (amplificação ~1000×) | **Resolvido** | `ModbusTcpConnection.ts:764` agora `split("\n")`, com comentário registrando a correção |
| **M-11** dois `QueryClientProvider` aninhados com config divergente | **Resolvido** | `main.tsx:7-12` documenta a remoção; provider único em `App.tsx` |
| **B-01** índices redundantes com o `UNIQUE` da mesma coluna | **Resolvido** | migração `20260807195559_remove_redundant_token_indexes` derruba os três |
| **B-05** dependência `profibus` morta em produção | **Resolvido** | fora do `backend/package.json` |
| **M-11 (efeito)** `refetchOnWindowFocus: true` amplificando o fan-out | **Resolvido** | `lib/queryClient.ts:41` → `false`, com justificativa |

**Não regrediu nada.** Os achados que permanecem são exatamente os mesmos, sem agravamento estrutural — o que mudou foi o *contexto*: a aplicação está no ar, acordada 24/7, com dado real acumulando.

---

## 6. Onde é obrigatório medir antes de otimizar

`06-code-quality-standards.md` é explícito: *"meça antes de otimizar; para dados pequenos e limitados, prefira o código mais simples"*. Continua sem instrumental de medição (`07-decisoes-em-aberto.md`).

| Eixo | Instrumento | Custo | O que decide |
|---|---|---|---|
| Banco | `pg_stat_statements` + `EXPLAIN (ANALYZE, BUFFERS)` nas 2 queries de `consumption.repository.ts` com volume real | baixo | A-01 (índices), M-02 (count duplicado), A-04 (rollup vs. só expurgo) |
| Banco | `prisma.$on('query')` em staging, contando queries por requisição de `/api/alerts` e `/api/consumption` | baixo | Confirma numericamente A-02, A-03, M-11 |
| Banco | Tamanho real de `meter_readings` no Neon (`pg_total_relation_size`) e taxa de crescimento/dia | trivial | A-04 — transforma a projeção deste laudo em número medido |
| Pool | `pool.totalCount`/`idleCount`/`waitingCount` do `pg` logados durante um flush do minuto | baixo | M-12 |
| Frontend | React DevTools Profiler, 60 s no Painel, "why did this render" | zero | A-06, B-02, B-07 |
| Frontend | `rollup-plugin-visualizer` no build atual (baseline gzip do chunk inicial) | baixo | M-04 |
| Rede | `curl -H "Accept-Encoding: gzip,br" -I` contra a demo e contra o self-hosted | trivial | A-05 — confirma em 30 s |
| IoT | `snapshots.length` + duração de `MinuteRollupScheduler.persist` por flush | baixo | M-01 |
| IoT | Contador de payloads descartados por protocolo em `IoTDataProcessor` | baixo | M-06 (quantifica o desperdício) |

**Achados que NÃO precisam de medição prévia** — são configuração ausente ou erro, não trade-off: **A-05** (compressão/cache), **M-13** (`reconnectPeriod: 0` contradizendo a documentação), **M-05** (reentrância de `setInterval`), **M-07** (backpressure ignorado), **M-01** (corrida do read-modify-write), **B-03** (episódio duplicado), **B-08** (KPI via segunda listagem), **B-10** (`select` faltando).

---

## 7. Ordem de ataque sugerida

1. **Uma linha cada, ganho imediato, zero risco:** A-05 (`encode` no Caddy + `Cache-Control` em `/assets/*` + `compression` no Express com filtro de SSE) e M-13 (`reconnectPeriod` + corrigir o comentário do entrypoint que hoje mente).
2. **Aditivo e reversível:** A-01 (índices de FK) e A-04 **etapa 1** (expurgo de `meter_readings` no `RetentionService` + índice de suporte). Estes dois são o que impede o custo de crescer com o tempo — e o keep-alive fez o tempo correr 24/7.
3. **Reduzir o custo unitário que tudo mais multiplica:** M-03 (cache in-process de bandeira e distribuidoras) e M-11 (`include` aninhado em vez de 3 round trips).
4. **Eliminar a multiplicação:** A-02 (batch de `resolveMeterTarget` + `enabledCount` no envelope, que já mata B-08) e A-03 (endpoint de resumo em lote). Maior ganho por linha alterada no backend.
5. **Frontend:** habilitar o React Compiler (A-06 — o código já é compiler-clean, resolve de quebra B-02 e B-07) e depois code-splitting por rota (M-04), agora com o baseline do visualizer na mão.
6. **Robustez do worker IoT:** M-05, M-06, M-07 — hoje a integração não-MQTT não ingere dado nenhum, então o custo atual é desperdício puro.
7. **Só com número na mão:** M-01, M-02, M-12, M-09, M-10, A-04 etapa 2 (rollup materializado — exige ADR).

---

## 8. Referências

- `.claude/docs/2026-08-05-desempenho-audit.md` — laudo anterior; base da coluna "herdado" e da seção 5.
- `.claude/project_context/03-arquitetura.md` — gatilhos para introduzir cache/fila/réplica e exigência de ADR (A-04 etapa 2, M-10).
- `.claude/project_context/06-code-quality-standards.md` §"Eficiência e complexidade" — Big-O em caminho quente, N+1, `Map`/`Set`, "meça antes de otimizar".
- `.claude/project_context/07-decisoes-em-aberto.md` — ausência de observabilidade de produção (bloqueia a etapa de medição da seção 6).
- `.claude/docs/adr/0010-demo-publica-free-tier-render-neon.md` — limites do free tier que tornam A-04 e M-12 concretos.
- `.claude/docs/adr/0011-keep-alive-monitor-externo-uptimerobot.md` — a mudança que fez a demo nunca hibernar (evidência central do A-04).
- `.claude/docs/adr/0008-hospedagem-brasil-oracle-always-free.md` — topologia do caminho self-hosted servido pelo `Caddyfile` do A-05.
- Prisma: comportamento de índices em colunas de chave estrangeira no PostgreSQL (base do A-01).
