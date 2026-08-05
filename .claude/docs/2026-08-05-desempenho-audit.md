# Auditoria de Desempenho — 2026-08-05

## 1. Sumário executivo

Auditoria somente-leitura do monorepo LumiTrack (`backend/`, `frontend/`, `iot-simulator/`), cobrindo backend/dados, frontend (bundle, render, TanStack Query), complexidade algorítmica e a integração IoT recém-migrada para `ethernet-ip` v2.

O código é, no geral, disciplinado: paginação existe em praticamente todos os repositórios, as agregações pesadas já foram empurradas para SQL (`date_trunc` + `GROUP BY`), o buffer de minuto usa `Map` aninhado com acesso O(1), e há caches em memória deliberados (`AlertEvaluator`, `NotificationStore`). Não há listas longas sem virtualização — o teto de `pageSize` 31 torna virtualização desnecessária hoje (e isso é correto pelo YAGNI).

Os problemas concentram-se em **três eixos**, todos ligados à alta frequência do pipeline IoT (~1 amostra/s/medidor) e ao fan-out de requisições nas telas agregadoras:

1. **Frontend em tempo real** — o buffer de potência é O(n) por amostra sobre até 86.400 pontos, e o `RealtimeContext` re-renderiza toda a árvore consumidora a 1 Hz porque o `value` não é memoizado e o React Compiler não está habilitado (apesar do lint já exigir suas regras).
2. **N+1 e fan-out de requisições** — `AlertService.findAll` dispara 2-4 queries por alerta; o Painel e as páginas de detalhe disparam uma requisição HTTP de consumo por propriedade/área, cada uma custando ~6 round trips + 2 varreduras agregadas.
3. **Índices ausentes em FKs** — o Prisma **não** cria índice para colunas FK no PostgreSQL; `properties.userId`, `areas.propertyId`, `devices.areaId` e `alerts.userId` são exatamente as colunas mais filtradas do sistema.

Além disso, há um bug de amplificação severa no adaptador RS-485 (`split("")` em vez de `split("\n")`) e um descasamento de contrato entre os adaptadores não-MQTT e o validador de payload que faz 100% das leituras Modbus/EtherNet-IP/PROFINET serem descartadas com um `log.warn` por poll.

**Contagem:** 6 Alto · 12 Médio · 8 Baixo.

**Ressalva metodológica:** não há APM, tracing nem métricas de produção (`07-decisoes-em-aberto.md`). Vários achados abaixo estão marcados com **[MEDIR ANTES]** — para dados pequenos e limitados, a solução mais simples continua vencendo (KISS, `06-code-quality-standards.md`). A seção 5 lista o instrumental mínimo para transformar palpite em medição.

---

## 2. Escopo e metodologia

- Leitura estática de `backend/src/**`, `frontend/src/**`, `iot-simulator/server|ui/src/**`, `backend/prisma/schema.prisma` e todas as migrações SQL.
- Contexto lido antes: `CLAUDE.md`, `03-arquitetura.md`, `04-tech-stack.md`, `06-code-quality-standards.md`, `07-decisoes-em-aberto.md`, `.claude/docs/roadmap.md`.
- **Sem execução**: nenhum `EXPLAIN`, profiler ou build de bundle foi rodado (auditor read-only). Estimativas de impacto são analíticas (Big-O, contagem de round trips, cardinalidade projetada), não medidas.
- Premissa de carga usada: 1 amostra/s por medidor (confirmada em `iot-simulator/server/src/simulation/deviceRunner.ts:5`), poll default de 5s nos protocolos request/response, `pageSize` máximo 31.

---

## 3. Achados

### 3.1 Impacto ALTO

---

**A-01 · Frontend/Complexidade — buffer de potência O(n) por amostra e gráfico sem downsampling**

- **Local:** `frontend/src/hooks/usePowerHistory.ts:36-45`; `frontend/src/components/dashboard/RealtimePowerChart.tsx:76-89`
- **Evidência:** a cada leitura SSE (1/s) o hook executa `prev.filter(...)` seguido de `[...pruned, {t, kw}]` — duas passagens O(n) e uma cópia integral do array. `MAX_WINDOW_MS = 24h` significa que `n` cresce até **86.400 pontos**. Como o array retornado é sempre novo, o `useMemo` do gráfico (dependência `[history, timeWindow]`) **nunca acerta**: refaz `filter` + `map` sobre os 86k pontos a cada segundo e entrega o resultado ao recharts, que desenha um `<path>` SVG com essa quantidade de vértices (mesmo com a janela de "1h" selecionada — o corte acontece depois, mas o buffer inteiro já foi copiado).
- **Custo:** O(n) por amostra → O(n²) ao longo da sessão; ~86k alocações/s de objetos `{label, kw}` em pico, mais pressão de GC e layout/paint de SVG.
- **Recomendação:** buffer circular de capacidade fixa (`Float64Array` ou array pré-alocado com índice) + agregação em baldes (5s para 1h, 1min para 24h) → no máximo ~300-720 pontos plotados. Manter a série agregada estável entre renders (mutação de um ref + `useSyncExternalStore`) para o `useMemo` do gráfico voltar a acertar. Considerar também throttle do repaint (máx. 2 Hz).
- **[MEDIR ANTES]** confirmar com React DevTools Profiler o custo real de commit do `RealtimePowerChart` após ~10 min de página aberta; o problema é estruturalmente certo, mas a prioridade entre "buffer" e "recharts" depende do perfil.

---

**A-02 · Frontend/Render — `RealtimeContext` sem memoização re-renderiza toda a árvore consumidora a 1 Hz**

- **Local:** `frontend/src/contexts/RealtimeContext.tsx:80-84` e `:130`
- **Evidência:** `onReading` faz `setReadingsByMeterId(prev => ({...prev, [id]: reading}))` a cada amostra, e o provider entrega `value={{ readingsByMeterId, isConnected }}` — **objeto literal recriado a cada render**. Todo consumidor de `useRealtime()` re-renderiza a 1 Hz × nº de medidores, inclusive quem só precisa de `isConnected`:
  - `frontend/src/components/layout/Header.tsx:28` (só usa `isConnected`)
  - `frontend/src/hooks/useLiveMeterReading.ts:23` → arrasta `RealtimeSection`, `PropertyDetailsPage`, `MeterSection`
  - `frontend/src/pages/area/AreaDetailsPage.tsx:77` e `frontend/src/pages/device/DeviceDetailsPage.tsx:58` (páginas inteiras)
- **Agravante:** o app tem **zero** `React.memo`/`useCallback`/`useMemo` de memoização fora de `ThemeContext.tsx` (busca em `frontend/src` retorna 3 ocorrências, todas nesse arquivo), **e o React Compiler não está habilitado** — `frontend/vite.config.ts:7` usa `react()` sem `babel-plugin-react-compiler`, que também não está no `package.json`. O `eslint.config.js:21` já aplica `reactHooks.configs.recommended` (v7, com as regras do compilador) e vários comentários no código citam "o compilador do React" (`usePowerHistory.ts:24-28`) — ou seja, o código foi escrito para o compilador, mas colhe zero benefício dele.
- **Recomendação, em ordem de custo/benefício:**
  1. Habilitar `babel-plugin-react-compiler` no `vite.config.ts` (o código já é compiler-clean por lint) — memoiza o `value` do provider e os componentes automaticamente.
  2. Separar em dois contextos: `RealtimeConnectionContext` (`isConnected`, muda raramente) e `RealtimeReadingsContext`.
  3. Para o caso de muitos medidores, trocar o estado React por um store externo lido via `useSyncExternalStore(subscribe, () => store.get(meterId))` — só o card daquele medidor re-renderiza.
- **[MEDIR ANTES]** Profiler com "Record why each component rendered" durante 60s no Painel, antes e depois de (1).

---

**A-03 · Backend/Dados — N+1 em `AlertService.findAll` (2-4 queries por alerta), amplificado pelo SSE**

- **Local:** `backend/src/modules/alert/alert.service.ts:78` (`Promise.all(result.items.map(...))`) → `:39-48` → `backend/src/modules/meter/meter-target.ts:26-70`
- **Evidência:** `resolveMeterTarget` faz `meterRepository.findById` e depois **1 a 3 lookups sequenciais adicionais** (device → area → property). Uma página de 31 alertas custa até **124 queries**, com 4 níveis de latência serializada por item.
- **Amplificação em três camadas:**
  1. `frontend/src/pages/alert/AlertsPage.tsx:35` e `:39` disparam **duas** listagens (`page,10` e `1,31`) — a segunda existe só para contar `enabled` (`:64-66`).
  2. `frontend/src/contexts/RealtimeContext.tsx:86-93`: cada evento `alert-firing` (start **e** end) invalida `queryKeys.alerts.all`, refazendo as duas listagens → ~150 queries por evento de alerta.
  3. `resolveMeterTarget` roda de novo em `alert.service.ts:57` (create) e no fechamento de cada episódio (`alert-evaluator.ts:213`).
- **Recomendação:** substituir por uma única query com `include` aninhado no `Meter` (`property`, `area: { include: { property } }`, `device: { include: { area: { include: { property } } } }`), ou um `findMany({ where: { id: { in: meterIds } } })` batch + `Map<meterId, target>` — passando de O(n) round trips para O(1). Para o KPI, expor `GET /api/alerts/stats` (ou incluir `enabledCount` no envelope paginado) em vez de baixar 31 itens hidratados.

---

**A-04 · Frontend + Backend — fan-out de requisições de consumo (N requisições HTTP × ~8 queries cada)**

- **Local:** `frontend/src/components/dashboard/PropertyComparisonSection.tsx:38-56`; `frontend/src/pages/property/PropertyDetailsPage.tsx:311-334`; `frontend/src/pages/area/AreaDetailsPage.tsx:319`
- **Evidência:** `useQueries` dispara **uma requisição `GET /api/consumption` por propriedade** (até 31 no Painel, conforme `DashboardPage.tsx:37`) e **por área** nas páginas de detalhe. Cada requisição, no backend (`backend/src/modules/consumption/consumption.service.ts:76-102`), custa: `resolveRootProperty` (1-3 queries sequenciais) + `findByTarget` + `distributorRepository.findById` + `tariffFlagRepository.get()` + `findAggregated` + `countBuckets` — **6 a 8 idas ao banco, das quais 2 são varreduras agregadas sobre `meter_readings`**.
- **Custo:** abrir o Painel com 20 propriedades ≈ 20 conexões HTTP concorrentes e **~160 queries**, das quais 40 são `GROUP BY` sobre a maior tabela do sistema. Nota: o comentário em `PropertyComparisonSection.tsx:30-37` explica que `pageSize: 3` existe apenas para não colidir a `queryKey` com o KPI — ou seja, o backend agrega e devolve 3 buckets onde só 1 é usado.
- **Recomendação:** endpoint batch (`GET /api/consumption/summary?targetType=PROPERTY&ids=a,b,c&granularity=month`) resolvendo tudo em 1 requisição e 1 query SQL com `GROUP BY meterId, bucket`. Alternativa mais barata a curto prazo: cache do `TariffFlagConfig` e do catálogo de distribuidoras (ver M-04), que já elimina 2 das 8 queries por chamada.

---

**A-05 · IoT — `Rs485Connection` faz `split("")` (por caractere) em vez de `split("\n")`**

- **Local:** `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:626`
- **Evidência:**
  ```ts
  // Rs485Connection (linha 626) — QUEBRADO
  const lines  = this.buffer.split("")
  // Rs232Connection (linha 525) — correto, mesmo padrão declarado no comentário
  const lines  = this.buffer.split("\n")
  ```
  `split("")` decompõe a string em **caracteres individuais**. O laço seguinte (`:628-641`) chama `this.dataHandler(...)` uma vez **por caractere recebido**, cada chamada disparando `JSON.parse` (que falha), o pipeline completo do `IoTDataProcessor` e um `log.warn` com o payload serializado.
- **Custo:** a 9600 baud ≈ **960 invocações do pipeline por segundo por medidor RS-485**, contra ~1/s esperada — amplificação de ~1000×, em CPU, alocação e volume de log. É também um bug funcional (nenhuma linha JSON é jamais montada).
- **Recomendação:** `split("\n")`, alinhando com `Rs232Connection`. Aproveitar para limitar o crescimento de `this.buffer` em ambos (um dispositivo que nunca envie `\n` faz o buffer crescer sem limite — vetor de exaustão de memória): descartar/truncar acima de um teto nomeado (ex.: 64 KB).

---

**A-06 · Banco — índices ausentes nas FKs mais filtradas (Prisma não indexa FK no PostgreSQL)**

- **Local:** `backend/prisma/schema.prisma:317-347` (`Property.userId`, `Property.distributorId`), `:349-362` (`Area.propertyId`), `:364-378` (`Device.areaId`), `:492-510` (`Alert.userId`); confirmado nas migrações — `rg "CREATE INDEX" backend/prisma/migrations` não retorna nenhum índice para essas colunas.
- **Evidência:** o Prisma Migrate cria a *constraint* de FK mas **não** o índice para PostgreSQL (comportamento documentado; difere do MySQL/InnoDB). As colunas listadas são exatamente as mais quentes:
  - `properties.userId` → `property.repository.ts:42` e `:53,59` (listagem + count), `resolveRootProperty`, export LGPD.
  - `areas.propertyId` / `devices.areaId` → `area.repository.ts:20,31,36`, `device.repository.ts:19,30,35`, e os filtros de relação aninhada `{ property: { userId } }` / `{ area: { property: { userId } } }`.
  - `alerts.userId` → `alert.repository.ts:22,28,37` (há `alerts_meterId_idx`, mas **não** `alerts_userId_idx`).
  - `resolveUserMeterIds` (`iot-stream.routes.ts:40-49`) e `MeterRepository.findAllByUser*` (`:79-105`) fazem `OR` de **três** relações aninhadas — sem esses índices, cada avaliação vira seq scan encadeado. Isso roda por conexão SSE aberta **e a cada 60s por conexão** (`iot-stream.routes.ts:103-107`).
  - Cascatas `ON DELETE CASCADE` (usuário, propriedade, área) também dependem desses índices para não fazer seq scan por linha removida.
- **Recomendação:** `@@index([userId])` em `Property` e `Alert`; `@@index([propertyId])` em `Area`; `@@index([areaId])` em `Device`; `@@index([distributorId])` em `Property`. Migração aditiva, sem impacto de contrato.
- **[MEDIR ANTES]** com poucas centenas de linhas o planner escolhe seq scan de qualquer jeito e o ganho é nulo — mas o custo do índice também é. `EXPLAIN (ANALYZE, BUFFERS)` em `resolveUserMeterIds` com volume realista antes de considerar concluído.

---

### 3.2 Impacto MÉDIO

---

**M-01 · IoT/Dados — `upsertMinute` gasta 2 queries por medidor por minuto, sem atomicidade**

- **Local:** `backend/src/modules/meter/meter-reading.repository.ts:18-66`; chamado em `backend/src/modules/iot/iot-worker/MinuteRollupScheduler.ts:93-95`
- **Evidência:** `findUnique` seguido de `create` **ou** `update` — read-modify-write em duas viagens. O `Promise.allSettled` sobre todos os snapshots faz N medidores custarem **2N round trips**, todos disparados no mesmo instante (o scheduler alinha o flush ao segundo `:00`, `MinuteRollupScheduler.ts:37-50`) — pico de concorrência sincronizado no pool de conexões.
- **Recomendação:** um único `INSERT ... ON CONFLICT ("meterId","minuteStart") DO UPDATE SET ...` com a média ponderada expressa em SQL (`(excluded.avgVoltage * excluded."secondsCovered" + "meter_readings".avgVoltage * "meter_readings"."secondsCovered") / NULLIF(total,0)`), usando o índice único já existente (`meter_readings_meterId_minuteStart_key`). Reduz para 1 statement e resolve de quebra a corrida do read-modify-write (dois flushes concorrentes hoje podem perder energia).
- **[MEDIR ANTES]** logar `snapshots.length` e a duração do `persist` por flush: com < 50 medidores isto é irrelevante; a partir de algumas centenas vira o gargalo do minuto.

---

**M-02 · Backend/Dados — `countBuckets` duplica a agregação completa só para paginar**

- **Local:** `backend/src/modules/consumption/consumption.repository.ts:80-101` (chamado em paralelo com `findAggregated` em `consumption.service.ts:99-102`)
- **Evidência:** a subquery de `countBuckets` repete exatamente o mesmo `WHERE` + `date_trunc` + `GROUP BY` de `findAggregated`, apenas para contar os grupos. Custo de I/O e agregação **dobrado** em toda listagem de consumo — e essa é a query mais cara do sistema (varre `meter_readings`).
- **Recomendação:** `COUNT(*) OVER ()` como coluna adicional em `findAggregated` (uma varredura só), ou abandonar o total exato: `take = pageSize + 1` e devolver `hasMore`. A UI (`Pagination.tsx`) usa `total` para numerar páginas — se manter a numeração for requisito, `COUNT(*) OVER ()` é a opção sem regressão funcional.

---

**M-03 · Banco/Memória — `meter_readings` sem retenção nem downsampling**

- **Local:** `backend/prisma/schema.prisma:421-439`; `backend/src/shared/retention/retention.service.ts:40-52` (expurga apenas `auth_tokens`, `password_resets`, `audit_logs`, `refresh_tokens`)
- **Evidência:** uma linha por medidor por minuto = **525.600 linhas/medidor/ano**. As agregações `hour`/`day`/`month`/`year` (`consumption.repository.ts:58-71`) varrem todas as linhas do intervalo a cada requisição — e o `date_trunc('year', ...) = ANY(...)` de `findMonthlyKwhForYears` (`:121`) é uma expressão **não-sargável**, forçando varredura de todas as leituras do medidor.
- **Recomendação:** tabela de rollup materializada por hora e por dia (preenchida pelo mesmo `MinuteRollupScheduler`, incremental), com o minuto expurgado após N dias. Isso troca a varredura por leitura indexada nas granularidades `day`/`month`/`year`. Como introduz um componente/tabela novo, deve virar **ADR** com o requisito medido que a motivou (regra de `03-arquitetura.md`).
- **[MEDIR ANTES]** medir hoje o tempo de `findAggregated` com granularidade `hour` sobre 1 ano de dados de 1 medidor. Se ficar abaixo do orçamento de latência, é YAGNI — só o expurgo (barato) já resolve o problema de armazenamento.

---

**M-04 · Backend/Cache — leituras quase-estáticas relidas do banco a cada requisição**

- **Local:** `backend/src/modules/consumption/consumption.service.ts:86-95`; `backend/src/modules/tariff-flag/tariff-flag.repository.ts:48-51`
- **Evidência:** `tariffFlagRepository.get()` lê um **singleton de linha única** (`id = 1`) em toda chamada de `/api/consumption`; `distributorRepository.findById` lê um registro de um **catálogo global, somente leitura, populado por seed** (`schema.prisma:281-311`). Ambos entram na cadeia serializada de 4-6 `await` antes das agregações.
- **Recomendação:** cache em memória de processo. A bandeira tem invalidação natural: só muda via `TariffFlagRepository.update` (admin) ou pelo `TariffFlagSyncScheduler` (1×/24h) — mesmo padrão de invalidação seletiva que o `AlertEvaluator` já usa. Distribuidoras: TTL de minutos. Isso remove 2 das ~8 queries de cada uma das N requisições do A-04 (efeito multiplicativo).
- **Nota de arquitetura:** este é exatamente o gatilho "mesma leitura cara repetida muitas vezes → cache" de `03-arquitetura.md:26`; um cache in-process não introduz componente de infra novo (não é Redis), então cabe sem violar a trava anti-over-engineering.

---

**M-05 · IoT — polling sem guarda de reentrância, sem timeout e sem reconexão (inclui EtherNet/IP v2)**

- **Local:** `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:70-87` (Modbus TCP), `:181-198` (Modbus RTU), `:273-284` (**EtherNet/IP**), `:423-439` (PROFINET)
- **Evidência:** todos usam `setInterval(async () => { ... await read() ... }, intervalMs)`. `setInterval` **não espera** a promise anterior: se a leitura demorar mais que o intervalo (PLC lento, rede degradada, TCP em retransmissão), as execuções se acumulam — promises pendentes sem limite, requisições CIP/Modbus enfileiradas no mesmo socket e crescimento de memória proporcional ao atraso. No caminho EtherNet/IP (`:279`), `await this.plc.read(tag)` da API v2 não tem timeout próprio configurado.
- **Agravante:** no `catch` (`:282`) grava-se `logger.error({ ..., err }, ...)` a cada intervalo. Com um PLC caído, são 12 objetos de erro serializados por minuto por medidor, indefinidamente, sem backoff e sem tentativa de reconexão (`connected` continua `true`; nada reabre a conexão).
- **Recomendação:** trocar por laço auto-agendado — `setTimeout` reagendado **após** a conclusão da leitura — com flag `inFlight`, timeout por leitura (`Promise.race`), backoff exponencial no erro e um teto de erros consecutivos que dispare reconexão. Aplicar aos 4 adaptadores (o mesmo esqueleto serve para todos).

---

**M-06 · IoT — payload dos adaptadores não-MQTT nunca passa na validação: 100% descarte + 1 `log.warn` por poll**

- **Local:** `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:64-74` e `:111-113` vs. `ModbusTcpConnection.ts:83` (`{register, value, timestamp}`), `:194` (`{port, value, timestamp}`), `:280` (`{tag, value, timestamp}` — **EtherNet/IP**), `:435` (`{db, data, timestamp}`)
- **Evidência:** `isValidPayload` exige `voltage`, `current`, `powerW` e `powerFactor`. Nenhum dos quatro adaptadores acima emite esses campos. Consequência: **todo poll cai em `log.warn({ meterId, payload: rawData }, "Leitura inválida descartada")`**, serializando o payload inteiro a cada 5s por medidor.
- **Impacto de desempenho:** volume de log e serialização puramente desperdiçados, proporcionais ao nº de medidores nesses protocolos. **Impacto funcional (fora do escopo desta auditoria, mas relevante para priorizar):** nenhum dado é ingerido por Modbus, EtherNet/IP ou PROFINET — só MQTT funciona ponta a ponta hoje.
- **Recomendação:** mapear registros/tags para as grandezas elétricas dentro de cada adaptador (a config `extra` já existe no `Meter` para carregar o mapa). Enquanto isso não existir, rebaixar o log de descarte para `debug` ou aplicar sampling (ex.: 1 a cada 100) para não pagar serialização em regime permanente.

---

**M-07 · SSE — `JSON.stringify` por listener e ausência de tratamento de backpressure**

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:87-91`
- **Evidência:**
  ```ts
  const readingUnsub = processor.addSampleListener((sample) => {
      if (!userMeterIds.has(sample.meterId)) return
      const payload = JSON.stringify(sample)   // uma vez POR CLIENTE
      res.write(`event: reading\ndata: ${payload}\n\n`)
  })
  ```
  O `IoTDataProcessor.process` itera todos os listeners (`IoTDataProcessor.ts:144-151`); com C clientes do mesmo usuário, a **mesma** amostra é serializada C vezes. Além disso, o retorno de `res.write()` é ignorado: com cliente lento, o Node acumula o buffer do socket em memória sem limite (`openWhenHidden: true` no cliente, `appStream.ts:112`, mantém a conexão viva em abas de fundo).
- **Recomendação:** serializar a amostra **uma vez** no `IoTDataProcessor` (ou memoizar por `sample`) e reusar a string em todos os listeners; observar o retorno de `res.write()` e, quando `false`, pular amostras até `drain` (para dados ao vivo, descartar é melhor que enfileirar).

---

**M-08 · SSE — re-resolução de posse por conexão a cada 60 s**

- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:103-107` + `:39-52`
- **Evidência:** cada conexão SSE roda `resolveUserMeterIds` (a query `OR` de 3 relações aninhadas, hoje **sem índices** — ver A-06) uma vez por minuto, mesmo com a aba ociosa e mesmo que o usuário nunca crie/remova medidores. C abas abertas = C queries/min permanentes.
- **Recomendação:** invalidação em vez de polling — o `MeterService` já notifica o `IoTConnectionManager` em create/update/delete; publicar o mesmo sinal no `UserEventHub` e recarregar o `Set` só nesse evento. Se manter o polling for a escolha KISS, ao menos elevar o intervalo (5 min) e compartilhar o resultado entre conexões do mesmo `userId`.

---

**M-09 · Simulador — snapshot completo re-serializado por evento: O(D² × C) por segundo**

- **Local:** `iot-simulator/server/src/api/routes/status.routes.ts:20-25`; `iot-simulator/server/src/simulation/store.ts:183-192` e `:101-107`
- **Evidência:** cada `DeviceRunner` publica 1 amostra/s (`deviceRunner.ts:5,45-47`) e chama `store.recordSample`, que emite `changed`. Cada `changed` faz **cada cliente SSE** executar `store.snapshot()` — que materializa todas as redes e faz spread de todos os devices (`[...network.devices.values()]`) — e `JSON.stringify` do resultado inteiro. Com D devices ligados e C clientes: **D eventos/s × O(D) de snapshot × C clientes = O(D²·C) por segundo**. Com 30 devices e 2 abas abertas isso já é 1.800 materializações completas por segundo.
- **Nota adicional:** `SimulationStore extends EventEmitter` com o limite padrão de 10 listeners — a 11ª aba SSE emite `MaxListenersExceededWarning`.
- **Recomendação:** coalescer as notificações numa janela (ex.: `setInterval` de 250 ms que emite no máximo um snapshot) e serializar **uma vez** por janela, reusando a string para todos os clientes. Alternativa: enviar delta por device em vez do snapshot (o comentário em `status.routes.ts:8-9` indica que "snapshot completo" foi requisito explícito — coalescer preserva o contrato e resolve o custo).

---

**M-10 · Frontend/Bundle — nenhum code-splitting; `recharts` e a stack markdown no bundle inicial**

- **Local:** `frontend/src/routes/AppRouter.tsx:1-23`; `frontend/vite.config.ts` (sem `build.rollupOptions.manualChunks`)
- **Evidência:** as 18 páginas são importadas estaticamente; busca por `React.lazy|lazy(|Suspense` em `frontend/src` retorna **zero** ocorrências. Consequência: `/login` (rota pública, primeiro contato) baixa também `recharts` (usado só em `ConsumptionChart.tsx` e `RealtimePowerChart.tsx`) e `react-markdown` + `remark-gfm` (usados só em `LegalDocumentPage.tsx:3-4` e `AboutPage.tsx:1-2`) — as duas dependências mais pesadas do `package.json`.
- **Sobre o `ReactQueryDevtools`:** importado estaticamente em `main.tsx:5` **e** `App.tsx:7`, com guarda `import.meta.env.DEV &&` só no JSX. O Rollup normalmente elimina a branch morta e depois o import — mas isso depende de `sideEffects` do pacote e não deve ser assumido sem verificar.
- **Recomendação:** `React.lazy` por rota (`Suspense` no `AppShell` reaproveitando o skeleton existente), `manualChunks` separando `recharts` e a stack markdown, e import dinâmico do devtools. Ganho esperado maior nas rotas públicas.
- **[MEDIR ANTES]** rodar `rollup-plugin-visualizer` no build atual e registrar o baseline (tamanho do chunk inicial, gzip). Sem esse número, "o bundle está grande" é palpite — e é justamente o tipo de otimização que a trava do `06` manda não fazer no escuro.

---

**M-11 · Frontend — dois `QueryClientProvider` aninhados com configurações divergentes**

- **Local:** `frontend/src/main.tsx:16-34` vs. `frontend/src/App.tsx:25` (+ `frontend/src/lib/queryClient.ts:27-39`)
- **Evidência:** `main.tsx` cria um `QueryClient` (`staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`) e monta um provider; `App.tsx` monta **outro** provider, aninhado, com o `queryClient` de `lib/queryClient.ts` (`refetchOnWindowFocus: true`, `gcTime: 5min`, `mutations.retry: 0`). Como o provider mais interno vence via contexto, **toda a configuração de `main.tsx` é código morto** — e o comportamento efetivo é o oposto do documentado no comentário de `main.tsx:10-14` quanto a `refetchOnWindowFocus`. O `ReactQueryDevtools` também é renderizado duas vezes em dev.
- **Impacto:** confusão sobre a política de cache real (`refetchOnWindowFocus: true` significa que voltar à aba refaz **todas** as queries montadas — incluindo o fan-out do A-04) + duas instâncias de `QueryClient` alocadas.
- **Recomendação:** manter um único provider (o de `App.tsx`, que usa a instância documentada) e remover o de `main.tsx`. Revisar conscientemente se `refetchOnWindowFocus: true` é desejável dado o custo por foco no Painel.

---

**M-12 · Backend/Memória — export LGPD sem limite e PDF gerado de forma síncrona na requisição**

- **Local:** `backend/src/shared/audit/audit.repository.ts:49-54` (`findByUserId` sem `take`); `backend/src/modules/export/export.service.ts:55-65`; `backend/src/modules/export/export.controller.ts:26-33`; `backend/src/shared/pdf/dataExportPdf.ts:171`
- **Evidência:** `findByUserId` carrega **todos** os audit logs do titular (retenção default ~2 anos — `DATA_RETENTION_AUDIT_LOG_DAYS`), materializados em memória junto com propriedades, áreas, dispositivos e alertas; depois `generateDataExportPdf` itera linha a linha (`for (const entry of payload.auditLogs)`) escrevendo no `PDFDocument`. Tudo isso no caminho da requisição HTTP, bloqueando o event loop do processo único.
- **Recomendação:** limitar a janela do audit log no export (ex.: 12 meses, com nota no documento) ou paginar/streamar a geração; se o requisito legal exigir o histórico completo, mover para job assíncrono com download posterior — o gatilho "trabalho lento bloqueando a resposta → fila" de `03-arquitetura.md:21`, que exigiria ADR.
- **[MEDIR ANTES]** contar quantos `AuditLog` uma conta ativa acumula em 12 meses no ambiente real. Se forem dezenas, é não-problema; se forem milhares (login/logout de sessões curtas geram muitos), vira bloqueio de segundos.

---

### 3.3 Impacto BAIXO

---

**B-01 · Banco — índices redundantes com o `UNIQUE` da mesma coluna**

- **Local:** `backend/prisma/schema.prisma:189` (`auth_tokens.token`), `:212` (`refresh_tokens.token`), `:227` (`password_resets.token`)
- **Evidência:** as três colunas têm `@unique` **e** `@@index` na mesma coluna isolada. O `UNIQUE` já cria um índice B-tree; o segundo é puro custo de escrita e espaço, sem nenhum caminho de consulta adicional atendido. Confirmado nas migrações (`..._init/migration.sql:179,182` e `..._add_refresh_token/migration.sql:18,24`).
- **Recomendação:** remover os três `@@index` redundantes. Ganho pequeno, mas o `auth_tokens` recebe uma inserção por login e é lido em toda requisição autenticada.

---

**B-02 · Frontend/UX — `staleTime` uniforme para dados quase-estáticos**

- **Local:** `frontend/src/hooks/queries/useDistributors.ts:14-17`; `frontend/src/hooks/queries/useTariffFlag.ts`
- **Evidência:** herdam o default de 30 s + `refetchOnWindowFocus: true`. O catálogo de distribuidoras é somente-leitura e populado por seed (`schema.prisma:281-286`); a bandeira vigente muda ~1×/mês (sincronizada 1×/24h pelo `TariffFlagSyncScheduler`).
- **Recomendação:** `staleTime: Infinity` (ou horas) para distribuidoras e `staleTime` de ~1h para a bandeira. Elimina refetches em cascata a cada troca de aba — inclusive dentro do Painel, onde `useDistributors(1, 31)` é chamado em `PropertyDetailsPage.tsx:66`.

---

**B-03 · Backend — teto de `pageSize` 31 força múltiplas idas para séries longas**

- **Local:** `backend/src/shared/pagination.ts:7-10`
- **Evidência:** o teto de 31 é deliberado e documentado ("cobre o pior caso de um mês dia a dia"). O efeito colateral é que uma série anual em granularidade `day` exige 12 requisições — cada uma pagando as ~8 queries do A-04. Também obriga workarounds na UI (`AlertsPage.tsx:39`, `DashboardPage.tsx:37`, `PropertyDetailsPage.tsx:66` usam "31" como sinônimo de "tudo").
- **Recomendação:** manter o teto para listas de recursos, mas permitir um teto maior (ex.: 366) especificamente para `/api/consumption`, que devolve buckets agregados leves — não linhas de recurso.

---

**B-04 · Backend — queries de expurgo sem índice de suporte**

- **Local:** `backend/src/modules/auth/auth.repository.ts:86-96`, `:100-110`, `:265-275`
- **Evidência:** `deleteMany` com `OR` sobre `revokedAt`/`expiresAt`/`usedAt` — nenhuma dessas colunas é indexada. Seq scan garantido.
- **Impacto:** roda 1×/24h em tabelas pequenas e já expurgadas. Aceitável hoje; só vira problema se `auth_tokens` crescer muito (sessão curta com muitos logins).

---

**B-05 · Backend — `profibus` como dependência de produção sem nenhum import**

- **Local:** `backend/package.json:50` (`"profibus": "^0.0.0"`); `ModbusTcpConnection.ts:336-357` (`ProfibusConnection` é um stub que só lança em `connect()`)
- **Evidência:** nenhum arquivo importa o pacote. Peso de install, superfície de `npm audit` e ruído no Dependabot sem contrapartida. Versão `0.0.0` reforça que é placeholder.
- **Recomendação:** remover do `package.json` (o stub que documenta o contrato pode continuar).

---

**B-06 · Frontend — `useLiveMeterReading` re-renderiza a cada 2 s independente de dado novo**

- **Local:** `frontend/src/hooks/useLiveMeterReading.ts:29-32`
- **Evidência:** `setInterval(() => setNow(Date.now()), 2_000)` força um render a cada 2 s em todo componente que usa o hook, mesmo sem leitura nova e mesmo quando `isStale` não mudou de valor. Somado ao A-02, é uma segunda fonte constante de renders.
- **Recomendação:** derivar `isStale` de um `setTimeout` agendado para o instante exato em que a leitura expiraria (`receivedAt + 10s`), reagendado a cada leitura — zero renders enquanto o dado estiver fresco.

---

**B-07 · Backend/Concorrência — `AlertEvaluator.evaluate` disparado sem `await`, permitindo trabalho duplicado**

- **Local:** `backend/src/server.ts:80-82` (`void alertEvaluator.evaluate(...)`); `backend/src/modules/alert/alert-evaluator.ts:97-111` e `:181-230`
- **Evidência:** o listener não aguarda a promise. Duas amostras próximas podem entrar concorrentemente em `evaluateAlert` para o mesmo `alertId` e ambas satisfazer `insideStreak >= CLOSE_AFTER_CONSECUTIVE_INSIDE` antes de `state.firing = false` ser aplicado (linha 226, **depois** de dois `await`) — resultando em dois `AlertTriggerEvent` gravados, duas resoluções de `resolveMeterTarget` (2-4 queries cada) e duas notificações.
- **Recomendação:** serializar por medidor (fila/mutex leve por `meterId`) ou marcar `state.firing = false` de forma síncrona antes dos `await` de `closeEpisode`.

---

**B-08 · Backend — `getFiringByUser` varre todos os episódios em memória**

- **Local:** `backend/src/modules/alert/alert-evaluator.ts:117-125`
- **Evidência:** itera o `Map` `episodes` inteiro — que acumula uma entrada por alerta **de todos os usuários** já avaliado desde o boot (a entrada nunca é removida quando o episódio fecha, só quando o alerta é desabilitado). `GET /api/alerts/firing` é chamado na hidratação do badge e reinvalidado a cada evento `alert-firing` (`RealtimeContext.tsx:87-89`).
- **Impacto:** O(total de alertas do sistema) por chamada — trivial hoje, cresce linearmente com a base e é executado no processo único.
- **Recomendação:** índice auxiliar `Map<userId, Set<alertId>>` mantido apenas com os episódios `firing`.

---

## 4. Pontos fortes confirmados

Registrados para que não sejam "otimizados" por engano:

- **Paginação universal aplicada** — todos os repositórios de listagem usam `skip/take` + `count` em `Promise.all` (`shared/pagination.ts`, `property/area/device/alert/meter/alert-trigger-event`). As exceções (`findAllByUser` sem paginação) estão restritas ao export LGPD e documentadas no código.
- **Agregação empurrada para o SQL** — `consumption.repository.ts` faz `date_trunc` + `SUM` + média ponderada no Postgres, não em JS, e usa `Prisma.sql` parametrizado com whitelist explícita de `date_trunc` (segurança + performance).
- **Índice composto correto para a tabela quente** — `@@unique([meterId, minuteStart])` cobre exatamente o predicado das agregações (`meterId = ? AND minuteStart >= ? AND minuteStart < ?`).
- **Estruturas de dados adequadas no caminho quente** — `MinuteBuffer` usa `Map<meterId, Map<minuteMs, bucket>>` (O(1)); `AlertEvaluator` usa cache `Map` com invalidação seletiva por medidor; `IoTDataProcessor` usa `Set` para listeners; `resolveUserMeterIds` devolve `Set` e o filtro do SSE usa `.has()` O(1); `dataExportPdf.ts:93,119` monta `Map` de lookup em vez de `find` aninhado (evita O(n²) na geração do PDF); `SimulationStore` mantém índice reverso `deviceIndex` documentado como O(1).
- **Não há listas longas sem virtualização** — e, com o teto de `pageSize` 31, virtualização seria over-engineering. Correto pelo YAGNI.
- **`isAnimationActive={false}`** já aplicado no gráfico de alta frequência (`RealtimePowerChart.tsx:121`).
- **`bcrypt.compare` em laço já mitigado** — `auth.service.ts:432-440` documenta e implementa o short-circuit para códigos TOTP de 6 dígitos, evitando até 10 comparações bcrypt (~100-300 ms cada) no caso comum de erro.
- **Risco de re-render em alta frequência já antecipado** no roadmap (`.claude/docs/roadmap.md:128`) — os achados A-01/A-02 confirmam e quantificam essa preocupação.

---

## 5. Onde é obrigatório medir antes de otimizar

`06-code-quality-standards.md:36` é explícito: *"meça antes de otimizar; para dados pequenos e limitados, prefira o código mais simples"*. Hoje **não existe instrumental de medição** (sem APM/tracing — `07-decisoes-em-aberto.md`). Antes de tratar M-03 (rollup materializado), M-01 (reescrita em SQL) e M-10 (code-splitting), instrumentar:

| Eixo | Instrumento | Custo | O que decide |
|---|---|---|---|
| Banco | `pg_stat_statements` + `EXPLAIN (ANALYZE, BUFFERS)` nas 2 queries de `consumption.repository.ts` com 1 ano de dados | baixo | A-06 (índices), M-02 (count duplicado), M-03 (rollup) |
| Banco | `prisma.$on('query')` em staging, contando queries por requisição de `/api/alerts` e `/api/consumption` | baixo | Confirma numericamente A-03 e A-04 |
| Frontend | React DevTools Profiler, 60 s no Painel, "why did this render" | zero | A-01, A-02, B-06 |
| Frontend | `rollup-plugin-visualizer` no build atual (baseline gzip do chunk inicial) | baixo | M-10 |
| IoT | Log de `snapshots.length` e duração de `MinuteRollupScheduler.persist` por flush | baixo | M-01 |
| IoT | Contador de payloads descartados por protocolo em `IoTDataProcessor` | baixo | M-06 (quantifica o desperdício) |

Achados que **não** precisam de medição prévia (são erros, não trade-offs): **A-05** (`split("")`), **M-11** (provider duplicado), **B-01** (índice redundante), **B-05** (dependência morta), **M-05** (reentrância de `setInterval`) e **M-07** (backpressure ignorado).

---

## 6. Ordem de ataque sugerida

1. **Correções sem trade-off, custo baixo:** A-05, M-11, B-01, B-05.
2. **Índices (aditivo, reversível) + cache in-process:** A-06, M-04 — reduzem o custo unitário que A-03 e A-04 multiplicam.
3. **Eliminar a multiplicação:** A-03 (batch de `resolveMeterTarget`) e A-04 (endpoint de resumo) — maior ganho por linha alterada no backend.
4. **Frontend em tempo real:** habilitar o React Compiler (A-02) e reescrever o buffer de potência (A-01) — maior ganho por linha alterada no frontend.
5. **Robustez do worker IoT:** M-05, M-06, M-07 — hoje a integração não-MQTT não ingere dado nenhum, então o custo é desperdício puro.
6. **Só depois, com número na mão:** M-01, M-02, M-03, M-10, M-12.

---

## 7. Referências

- `.claude/project_context/03-arquitetura.md` — gatilhos para introduzir cache/fila/réplica e exigência de ADR.
- `.claude/project_context/06-code-quality-standards.md` §"Eficiência e complexidade" — Big-O em caminho quente, N+1, `Map`/`Set`, "meça antes de otimizar".
- `.claude/project_context/07-decisoes-em-aberto.md` — ausência de observabilidade de produção (bloqueia a etapa de medição).
- `.claude/docs/roadmap.md:128` — risco de performance de re-render em alta frequência de eventos SSE, já registrado.
- Prisma: comportamento de índices em colunas de chave estrangeira no PostgreSQL (base do achado A-06).
