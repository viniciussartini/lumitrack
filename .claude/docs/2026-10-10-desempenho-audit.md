# Auditoria de Desempenho — 2026-10-10

## 1. Sumário executivo

Varredura completa, somente leitura, do monorepo na branch `staging` (HEAD `b2f7edc`): `backend/`, `frontend/`, `iot-simulator/`, `deploy/`, `render.yaml`, `docker-compose.yml` e os Dockerfiles. O laudo de 2026-08-22 serviu de referência. Os caminhos citados são relativos à raiz do repositório.

**O trabalho das Fases 15 a 17 fechou a maior parte do laudo anterior.** De 31 achados, 16 estão resolvidos, 4 mudaram de forma e 11 continuam abertos (detalhe na seção 5). Entre os resolvidos:
- os índices de FK;
- o N+1 de `/api/alerts`;
- o fan-out HTTP de `/api/consumption`;
- a compressão HTTP e o cache de assets;
- o code-splitting (chunk inicial de 383 kB para 103 kB gzip, medido);
- o React Compiler;
- o upsert atômico;
- `COUNT(*) OVER()`;
- o cache in-process;
- o pool explícito;
- o `PollingLoop`;
- o backpressure do SSE;
- a coalescência do simulador.

Boa parte foi medida antes e depois, nos baselines de 24/08 a 31/08.

**O que é novo vem das Fases 25 a 30 e muda o perfil de custo da tabela mais quente:**

1. **Consultas "últimos N baldes" sem janela agregam o histórico inteiro do medidor** (até 365 dias, cerca de 525 mil linhas por medidor). Cada carga do Painel dispara de 4 a 5 dessas consultas. Como as linhas dos 11 medidores ficam intercaladas nas mesmas páginas, cada uma lê na prática a tabela inteira (achado novo A-01).
2. **`meter_readings` ficou cerca de 2 vezes mais larga** com as 22 colunas por fase da Fase 25. A estimativa de "~2 GiB/ano" registrada em `env.ts` e no baseline de 24/08 está desatualizada (estimativa nova: ~3,1 GiB/ano). Toda agregação lê o dobro de páginas. No staging (Neon com 0,5 GB), o teto chega em cerca de 2 meses de tempo acordado (A-02).
3. **O custo mensal do Grupo A e da Tarifa Branca em `list()` faz N+1 por mês.** O caminho em lote já existe (`calculateGroupAMonthlyCosts`), mas só o caminho anual o usa. Pedir 12 meses dispara de 36 a 48 consultas concorrentes num pool de 10 (A-03).
4. **O evento SSE `reading` ficou cerca de 3,7 vezes maior** (Fase 25). Ele vai para todas as abas, inclusive as em segundo plano, sem compressão: cerca de 29 MB por hora por aba aberta (M-01).
5. **Fase 30 (sessões ativas):** o caminho quente está bem resolvido. O `sessionId` vem na mesma query do `authenticate`, e a listagem sempre filtra por `userId` indexado com `take 100`. A exportação de dados, porém, ganhou mais uma leitura sem teto (`findAllForExport`), e o `LOGIN` auditado a cada refresh alimenta `audit_logs`. Isso agrava o antigo M-10, que agora é o M-03.

**Contagem: 3 Alto, 6 Médio, 19 Baixo.**

**Ressalva de método:** auditor somente leitura. Nenhum `EXPLAIN`, profiler ou build foi executado nesta sessão. Os números marcados como estimativa vêm do formato do código e dos baselines já registrados em `.claude/docs/2026-08-*-baseline-*.md`, que **antecedem a Fase 25** e precisam ser refeitos. Os achados com **[MEDIR ANTES]** são trade-offs, não erros.

---

## 2. Escopo e metodologia

- **Código lido:**
  - `backend/src/**`, com foco em consumption, meter, iot, alert, goal, demand, report, session, export, auth e retention;
  - `backend/prisma/schema.prisma` e as 42 migrações (atenção às 21 posteriores a 22/08);
  - `frontend/src/**`, com foco em contextos, SSE, hooks de query, Painel e `vite.config.ts`;
  - `iot-simulator/server/src/**`.
- **Infraestrutura lida:** `deploy/Caddyfile`, `deploy/demo-entrypoint.sh`, `render.yaml`, `docker-compose.yml`, `Dockerfile` e `backend/Dockerfile`.
- **Contexto usado:** laudo de 2026-08-22, baselines de 24/08, 26/08, 30/08 (frontend) e 31/08, ADR-0012, 0013, 0014, 0022, 0023, 0025 e o roadmap (Fases 25 a 31).
- **Premissas de carga extraídas do código:**
  - 11 medidores na demo, 1 amostra/s por medidor (`deviceRunner.ts:5`);
  - retenção de `meter_readings` de 365 dias (`env.ts:108`);
  - `DB_POOL_MAX=10` e `DB_POOL_CONNECTION_TIMEOUT_MS=5000` (`env.ts:223-228`);
  - `statement_timeout` de 15 s;
  - JWT web de 1 h com refresh proativo a 80% (`sessionRefresh.ts:9`);
  - SSE com `openWhenHidden: true`.

---

## 3. Achados

### 3.1 Impacto ALTO

---

**A-01 · Banco/Frontend: "últimos N baldes" sem janela agregam o histórico inteiro do medidor (NOVO)**

- **Área:** Backend e frontend / dados.
- **Local:**
  - Backend: `backend/src/shared/database/timeBucket.ts:19-25` (`rangeFilter` vira `Prisma.empty` sem `from`/`to`), `backend/src/modules/consumption/consumption.repository.ts:109-152` (`findAggregated`) e `:265-301` (`findLatestAggregatedForMeters`).
  - Frontend, chamadores sem `range`:
    - `frontend/src/hooks/queries/useConsumption.ts:39-57`;
    - `frontend/src/components/dashboard/DashboardKpiRow.tsx:54-56` (hora 3, dia 5, mês 1);
    - `frontend/src/components/dashboard/PeakHoursBand.tsx:25`;
    - `frontend/src/components/dashboard/ConsumptionHistorySection.tsx:54-63` (6 ou 12 meses);
    - `frontend/src/components/dashboard/PropertyComparisonSection.tsx:25-29` (summary mensal de todas as propriedades);
    - `frontend/src/hooks/useTargetConsumptionKpis.ts:31-32`;
    - `frontend/src/components/consumption/ConsumptionSection.tsx:339` e `:418`.
- **Evidência:**
  - Sem janela, a query faz `GROUP BY date_trunc(...)` sobre **todas** as linhas do medidor e só depois aplica `ORDER BY bucket DESC LIMIT 3`. O `COUNT(*) OVER()` obriga a materializar todos os grupos.
  - Para pegar as 3 últimas horas, o Postgres agrega cerca de 525.600 linhas (365 × 1.440).
  - O baseline de 24/08 (§3) mediu exatamente esse caso (granularidade hora, sem janela, 1 ano): **447 ms com `Parallel Seq Scan` de 5,7 M linhas**, porque as linhas dos 11 medidores são inseridas em rajada a cada minuto e ficam intercaladas nas mesmas páginas. Ler um medidor é ler a tabela inteira.
  - Isso foi medido **antes** de a linha dobrar de largura (A-02).
  - O `summary` sem janela faz o mesmo para N medidores de uma vez.
- **Custo por carga do Painel** (cache frio do TanStack): `DashboardKpiRow` gera 3 consultas (a mensal é compartilhada com `PeakHoursBand` pela mesma chave), o histórico de 6/12 meses gera 1 e a comparação entre propriedades gera 1. São cerca de 5 varreduras completas, além do custo do Grupo A (A-03).
- **Recomendação** (sem mudar contrato): todo pedido "latest" passa a mandar uma janela mínima suficiente.

  | Granularidade | Janela sugerida |
  |---|---|
  | hora | últimas 3 h |
  | dia | últimos 5 dias |
  | mês | mês corrente ou últimos N meses |
  | summary | período da granularidade |

  Alternativa: o backend impõe um piso por granularidade quando `from` está ausente. A query passa a usar o índice `(meterId, minuteStart)` como faixa, como já fazem `useMeterReadingHistory`, `useLatestMeterReading` e a tabela de consumo, que já mandam janela.
- **[MEDIR ANTES]** `EXPLAIN (ANALYZE, BUFFERS)` de `findAggregated` (hora, sem janela, 1 ano, schema pós-Fase 25) contra a mesma query com janela de 3 h. A estimativa é de centenas de ms para poucos ms, mas o número precisa ser medido de novo com a linha mais larga.

---

**A-02 · Armazenamento/I/O: `meter_readings` cerca de 2 vezes mais larga após a Fase 25; dimensionamento e baselines desatualizados (NOVO, evolução do antigo A-04)**

- **Área:** Backend / dados e infraestrutura.
- **Local:** `backend/prisma/schema.prisma:747-800`; `backend/prisma/migrations/20260927154349_grandezas_eletricas_por_fase/migration.sql:2-23` (22 colunas `DOUBLE PRECISION`); `backend/src/config/env.ts:105-108`; `.claude/docs/2026-08-24-baseline-desempenho.md:70-75`.
- **Evidência:**
  - O baseline mediu ~190,5 B/linha de tabela e ~370,5 B/linha com o índice único.
  - O simulador publica sempre as 21 grandezas (`iot-simulator/server/src/simulation/types.ts:17-49`), e o backend calcula o desequilíbrio. Na demo, as 22 colunas são preenchidas: cerca de 176 B a mais por linha.
  - Também entrou o índice `meter_readings_minuteStart_idx` (migração `20260825020345`).
  - Estimativa nova: ~366 B/linha de tabela e ~575 B/linha com índices. São ~8,7 MiB/dia e **~3,1 GiB/ano** com a retenção de 365 dias, contra os "~2 GiB/ano" escritos em `env.ts:105-107` e usados no RIPD §3.3.
- **Efeitos:**
  1. Toda agregação que precisa do heap (`kwhConsumed`, `avgPowerW`, `secondsCovered`) lê cerca de 2 vezes mais páginas. Isso multiplica A-01 e A-03.
  2. O expurgo do baseline de 31/08 (48 s para 5,7 M linhas) foi medido com a linha estreita, então a folga do `RETENTION_PURGE_STATEMENT_TIMEOUT_MS=120000` encolheu.
  3. **Staging (Neon, 0,5 GB):** cerca de 57 dias de tempo acordado enchem o banco.
- **Agravante hipotético [MEDIR ANTES]:** uma aba esquecida mantém o SSE aberto (`openWhenHidden: true`, `frontend/src/lib/sse/appStream.ts:238` e `:273`) e o refresh proativo a cada ~48 min. Se o Render contar isso como tráfego, o staging deixa de hibernar, o que reproduz por outro caminho o problema que a ADR-0013 removeu.
- **Recomendação** (em ordem de custo):
  1. Medir `pg_total_relation_size('meter_readings')` na VPS e no Neon e atualizar `env.ts`, RIPD e o baseline.
  2. Reavaliar o prazo de retenção separado por uso: as grandezas por fase só servem às séries e à comparação de períodos (até 92 dias).
  3. Se o número confirmar, aplicar a etapa 2 do antigo A-04: rollup horário/diário para kWh e potência média, com consultas de mês e ano lendo o rollup. Isso exige ADR (`03-arquitetura.md`).
  4. Opção estrutural: mover as 22 colunas para uma tabela irmã. Também exige ADR.

---

**A-03 · Backend/Dados: N+1 por mês no custo do Grupo A e da Tarifa Branca em `ConsumptionService.list()` e na comparação Branca (NOVO)**

- **Área:** Backend / dados.
- **Local:** `backend/src/modules/consumption/consumption.service.ts`:
  - `:313-334` (`Promise.all` sobre os baldes);
  - `:1318-1336` (`calculateBucketCost`, ramo mês + PROPERTY);
  - `:624-650` (`calculateMonthCost`);
  - `:835-854` (`calculateGroupAMonthCost`, que embrulha o lote com 1 mês só);
  - `:743-769` (`calculateGroupBWhiteMonthCost`);
  - `:1746-1759` (`compareBrancaToConvencional`, um `findKwhByPost` por mês).
- **Evidência:**
  - O lote `calculateGroupAMonthlyCosts` (`:1138-1241`) e `findKwhByPostGroupedByMonth` existem e são usados no caminho **anual** (`computeYearlyPropertyCosts`, `:518-583`).
  - Na granularidade **mensal**, cada balde chama o lote com um único mês. Cada mês do Grupo A custa `findKwhByPostGroupedByMonth` + `findReactiveEnergyByWindowGroupedByMonth` + `findByMeterAndPeriods` (+ `findOverlappingForProperty` no ACL). As duas primeiras varrem o mês em `meter_readings`.
  - Todos os meses rodam em paralelo: 12 meses dão de 36 a 48 queries concorrentes num pool de 10, com 5 s de espera por conexão.
  - A comparação Branca dispara até 24 `findKwhByPost` paralelos (`MAX_COMPARISON_MONTHS=24`).
- **Quem chama:**
  - `ConsumptionHistorySection` (6/12 meses) para propriedade do Grupo A ou Branca;
  - Análise com janela "ano";
  - `GoalConsumptionReader.yearCost` (`backend/src/modules/goal/goal-consumption.ts:176-207`), tanto pelo progresso de metas em R$ quanto pelo `GoalAlertScheduler` a cada 15 min;
  - relatório MONTHLY.
- **Recomendação:** em `list()`, quando `granularity === "month" && targetType === "PROPERTY"` e o grupo é A ou Branca, pré-calcular os custos de todos os baldes da página com uma chamada a `calculateGroupAMonthlyCosts` ou `calculateGroupBWhiteMonthlyCosts` e montar um `Map<monthMs, MonthCostResult>`, como já acontece no caminho anual. Em `compareBrancaToConvencional`, trocar o laço por um único `findKwhByPostGroupedByMonth`. O resultado passa de O(meses) round trips para O(1).
- **[MEDIR ANTES]:** `DEBUG_QUERY_LOGGING_ENABLED=true` e `GET /api/consumption?granularity=month&pageSize=12` numa propriedade do Grupo A. Hoje o `queryCounter` já cobre `/api/consumption`.

---

### 3.2 Impacto MÉDIO

---

**M-01 · SSE: evento `reading` cerca de 3,7 vezes maior, entregue a toda aba (inclusive em segundo plano) e sem compressão (NOVO)**

- **Área:** Backend e frontend / rede e render.
- **Local:**
  - `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:318-339` (a amostra carrega as 21 grandezas e mais `voltageUnbalance` sem arredondamento);
  - `backend/src/modules/iot/iot-stream.routes.ts:299-309` (filtro só por "medidor do usuário");
  - `backend/src/shared/middlewares/compressionFilter.ts:44-56` (SSE excluído da compressão);
  - `frontend/src/lib/sse/appStream.ts:238` e `:273`;
  - `frontend/src/contexts/RealtimeContext.tsx:63-65`.
- **Evidência** (estimativa pelo formato):
  - antes da Fase 25: ~200 B por leitura;
  - agora: ~700 a 750 B (26 campos numéricos, `meterId` e `receivedAt`).
  - Com 11 medidores a 1 Hz: ~8 KB/s, ~29 MB/h, **~0,7 GB/dia por aba aberta**.
  - O Painel só precisa de `powerW` do medidor da propriedade selecionada. As 21 grandezas só servem a `ElectricalQuantitiesGrid` de um alvo.
  - Cada mensagem também custa `JSON.parse` e um `setState` no navegador.
- **Recomendação** (da mais barata para a mais cara):
  1. Arredondar `voltageUnbalance` no backend (o simulador já arredonda as demais).
  2. Usar um evento `reading` compacto (os 4 campos atuais) por padrão e o detalhado só para o medidor que a tela de Grandezas pediu (por exemplo, `?detail=<meterId>` na abertura ou um evento de inscrição).
  3. Avaliar compressão no SSE com `res.flush()` após cada `write`. O middleware `compression` expõe `flush`; o dicionário do deflate entre mensagens comprime bem as chaves repetidas. É preciso validar contra a regressão que motivou o `shouldCompress`.
- **[MEDIR ANTES]:** bytes por minuto no DevTools (Network) com o Painel aberto, antes e depois.

---

**M-02 · `/api/consumption/summary`: N+1 de posse e medidor por id, custo sequencial por item e falha silenciosa sob saturação do pool (NOVO, resíduo do antigo A-03)**

- **Área:** Backend / dados.
- **Local:** `backend/src/modules/consumption/consumption.service.ts:362-376` (`resolveRootProperty` por id), `:384-390` (`findByTarget` por id), `:408-436` (`await` sequencial por item: distribuidora em cache e custo, que no Grupo A mensal são 3 ou 4 queries por item) e `:372-374` (`catch { return null }`).
- **Evidência:**
  - O fan-out **HTTP** foi resolvido (1 requisição por tipo de alvo). No **banco**, o lote continua sendo 2N queries concorrentes antes da agregação.
  - `MAX_SUMMARY_IDS=50` (`consumption.schema.ts:35`), então são até 100 queries disputando o pool de 10.
  - "Consumo de hoje" (`frontend/src/hooks/useTodayConsumption.ts:16`) dispara até 3 lotes (PROPERTY, AREA, DEVICE). O Painel ainda soma `AreaWeightSection` e `PropertyComparisonSection`.
  - **Risco de corretude induzido por desempenho:** se a aquisição de conexão estourar os 5 s, o `catch` engole o erro e o alvo some do resultado como se não tivesse medidor ("-"), sem log.
- **Recomendação:**
  - Resolver a posse em lote: `property.findMany({ where: { id: { in } } })` ou o equivalente com `include` para área e dispositivo, filtrando `userId` na própria query.
  - Resolver os medidores com `meter.findMany({ where: { [targetFk]: { in: ids } } })`.
  - Agrupar o custo do Grupo A por propriedade.
  - No `catch`, distinguir `NotFoundError` (silencioso) de qualquer outro erro, que deve ser logado ou propagado.

---

**M-03 · Exportação de dados: leitura sem teto agravada pela Fase 30 e pela conta de demonstração compartilhada (antigo M-10, PERSISTENTE e AGRAVADO)**

- **Área:** Backend / memória e event loop.
- **Local:**
  - `backend/src/shared/audit/audit.repository.ts:48-53` (`findByUserId` sem `take`);
  - `backend/src/modules/session/session.repository.ts:91-111` (`findAllForExport` sem `take`, novo);
  - `backend/src/modules/export/export.service.ts:125-149` (11 queries em `Promise.all`, uma a mais que `DB_POOL_MAX=10`);
  - `backend/src/modules/export/export.controller.ts:39-49` (PDF gerado de forma síncrona na requisição);
  - `backend/src/modules/auth/auth.controller.ts:271-279` (`LOGIN` auditado a **cada refresh**).
- **Evidência:**
  - Cada sessão web ativa gera uma linha `LOGIN` por hora (refresh), retida por 730 dias. Uma aba aberta o dia todo acumula cerca de 24 linhas por dia.
  - A conta de demonstração é compartilhada por todos os visitantes (`DEMO_ACCOUNT_EMAILS`), e `GET /me/data-export` é GET, então não passa por `blockDemoWrite`.
  - A exportação da demo carrega, numa única requisição, todo o audit log de todos os visitantes (incluindo `ACCESS_DENIED` de cada escrita bloqueada) e todos os tokens dos últimos 30 a 37 dias, e gera o PDF no mesmo processo do pipeline IoT.
  - `findByUserId` ordena por `createdAt` só com o índice `userId`, o que obriga uma ordenação em memória.
- **Recomendação:**
  - Limitar a janela do audit log no export (por exemplo, 12 meses, com nota no documento).
  - Dar à exportação da conta demo o mesmo tratamento que `SessionService.list` já dá (`session.service.ts:42`): conteúdo representativo.
  - Usar `take` e `orderBy` em `findAllForExport`.
  - Considerar índice composto `(userId, createdAt)` em `audit_logs`.
- **[MEDIR ANTES]:** `SELECT count(*) FROM audit_logs WHERE "userId" = <demo>` e o mesmo em `refresh_tokens` na VPS.
- **Fora do escopo, encaminhar para a auditoria de conformidade:** a exportação da demo devolve dispositivo e IP mascarado das sessões de **outros** visitantes.

---

**M-04 · SSE: revalidação por polling de 60 s por conexão, agora também como único mecanismo de corte de sessão encerrada (antigo M-08, PERSISTENTE)**

- **Área:** Backend / dados e tempo real.
- **Local:** `backend/src/modules/iot/iot-stream.routes.ts:39`, `:46-59`, `:69-78` e `:223-260`; `backend/src/modules/session/session.repository.ts:155-170`.
- **Evidência:** cada conexão roda, por minuto, `findActiveToken` e `resolveUserMeterIds` (o `OR` de 3 relações, agora com índices). Com C abas abertas, são 2C queries por minuto permanentes. A Fase 30 adicionou o encerramento de sessão (`revokeSessions`), e o stream de uma sessão encerrada continua entregando dados por até 60 s, porque nada avisa o stream.
- **Recomendação:** invalidação por evento. `SessionService.revoke`/`revokeOthers` e o CRUD de medidor publicam no `UserEventHub` um evento interno (por exemplo, `session-revoked` com `sessionId`, ou `meters-changed`), e o stream reage na hora. Com isso, o tick só precisa revalidar a expiração e pode ficar mais longo.

---

**M-05 · IoT: MQTT reconecta depois de conectado, mas uma falha na conexão inicial no boot não é retentada (antigo M-13, MUDADO)**

- **Área:** IoT / disponibilidade de dado.
- **Local:** `backend/src/modules/iot/iot-worker/protocols/MqttConnection.ts:61`, `:85-90` e `:120-128`; `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:257-263`; `deploy/demo-entrypoint.sh:58-63`.
- **Evidência:**
  - `reconnectPeriod: 1000` resolveu a queda **depois** do primeiro CONNACK.
  - Se a conexão inicial falhar (o broker do simulador não respondeu nos 30 s do entrypoint), `failInitialConnect` encerra o client e rejeita, e o `IoTConnectionManager.start` só registra "Falha ao conectar". Nada tenta de novo: o medidor fica sem dado até um restart.
  - O comentário do entrypoint continua afirmando que o client "reconecta sozinho quando o broker subir".
- **Recomendação:** no `IoTConnectionManager.start`, agendar uma nova tentativa com o mesmo `reconnectBackoff` dos adaptadores de polling, ou corrigir o comentário do entrypoint. Também vale um backoff no `reconnectPeriod`: hoje são 1 s fixo e um `logger.warn` por tentativa enquanto o broker estiver fora.

---

**M-06 · Frontend: o contexto de leituras é um único mapa, e todo consumidor re-renderiza a cada leitura de qualquer medidor (antigo A-06, MUDADO)**

- **Área:** Frontend / render.
- **Local:** `frontend/src/contexts/RealtimeContext.tsx:63-65`, `:146` e `:173`; `frontend/src/hooks/useLiveMeterReading.ts:42-43`; `frontend/src/components/electrical/ElectricalQuantitiesGrid.tsx:47`.
- **Evidência:**
  - Resolvido: React Compiler (`frontend/vite.config.ts:17-20`), contextos separados e `setTimeout` exato em vez do `setInterval` de 2 s. A medição de 30/08 caiu de 64 para 4 renders no `Header`, de 189 para 9 no `RealtimeChartCard` e de 124 para 64 no `MeterSection`.
  - Essa medição usou **1 medidor**. Com 11 medidores, `readingsByMeterId` muda até 11 vezes por segundo, e cada consumidor de `useLiveMeterReading` ou do grid re-renderiza a cada mudança, mesmo exibindo um medidor só. Isso vale também para abas em segundo plano.
- **Recomendação:** store externo com `useSyncExternalStore(subscribe, () => store.get(meterId))`, para que só o consumidor daquele medidor re-renderize. Alternativa mais barata: agrupar as leituras num único `setState` por quadro (`requestAnimationFrame`).
- **[MEDIR ANTES]:** repetir o Profiler da Fase 17 com 11 medidores emitindo.

---

### 3.3 Impacto BAIXO

---

**B-01 · `staleTime` uniforme para dados quase estáticos (antigo B-01, PERSISTENTE).** Local: `frontend/src/hooks/queries/useDistributors.ts:11` e `frontend/src/hooks/queries/useTariffFlag.ts`. Os dois herdam 30 s. Distribuidoras são catálogo de seed, e a bandeira é sincronizada 1 vez a cada 24 h. Recomendação: horas ou `Infinity`.

**B-02 · `AlertEvaluator.evaluate` sem `await` pode duplicar episódio (antigo B-03, PERSISTENTE).** Local: `backend/src/server.ts:138-140` e `backend/src/modules/alert/alert-evaluator.ts:198-200` e `:205-250` (`state.firing = false` só na linha 246, depois de dois `await`). O risco cresce quando o pool satura (A-03, M-02). Recomendação: marcar `firing=false` de forma síncrona antes dos `await`.

**B-03 · `getFiringByUser` percorre todos os episódios, que nunca são podados (antigo B-04, PERSISTENTE).** Local: `backend/src/modules/alert/alert-evaluator.ts:52-53` e `:120-133`. Recomendação: índice `Map<userId, Set<alertId>>` só dos episódios em disparo.

**B-04 · Expurgo de `auth_tokens`, `refresh_tokens` e `password_resets` sem índice de apoio (antigo B-05, PARCIAL).**
- Local: `backend/src/modules/auth/auth.repository.ts:243-255`, `:264-276` e `:577-589`.
- `alert_trigger_events` e `mfa_backup_codes` ganharam índice (`20260825212852`); estas três tabelas não.
- Com a Fase 30, cada refresh grava um `auth_token` e um `refresh_token` novos, então o volume por usuário cresce com abas abertas, embora fique limitado a 30 dias.
- Medir antes de indexar.

**B-05 · Mapas em memória sem poda (antigo B-06, PERSISTENTE).** Local: `backend/src/shared/notifications/notification-store.ts:25`, `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:248`, `backend/src/modules/iot/iot-worker/MinuteBuffer.ts:131-132` e `backend/src/modules/iot/iot-worker/IoTConnectionManager.ts:266-276` (o `stop` não limpa `lastSampleAt`/`latest`). Recomendação: limpar no `stop(meterId)`.

**B-06 · Teto de `pageSize` 31 usado como "tudo" (antigo B-09, PERSISTENTE).** Local: `backend/src/shared/pagination.ts:7-10`. Recomendação: teto próprio maior para `/api/consumption` e `/api/meter-readings`.

**B-07 · `findAllConnectionConfigs` sem `select` (antigo B-10, PERSISTENTE).** Local: `backend/src/modules/meter/meter.repository.ts:488-489`. A cada boot traz todas as colunas de todos os medidores. No staging hibernável, o boot acontece a cada despertar.

**B-08 · `ReactQueryDevtools` importado de forma estática (antigo B-11, PERSISTENTE).** Local: `frontend/src/App.tsx:7` e `:29-31`. Conferir no `dist/stats.html` se saiu do bundle; se não saiu, usar import dinâmico.

**B-09 · Chave do TanStack Query inclui o ISO da janela (antigo B-12, PERSISTENTE).** Local: `frontend/src/hooks/queries/useConsumption.ts:46`. A virada de hora cria uma query nova e mostra skeleton. O padrão correto já existe em `queryKeys.meterReadings.history` (`frontend/src/lib/queryClient.ts:153-158`).

**B-10 · `findMonthlyKwhForYears` com predicado não sargável (resíduo do antigo A-04, PERSISTENTE).** Local: `backend/src/modules/consumption/consumption.repository.ts:221-247` (linha 237, `date_trunc('year', ...) = ANY(...)`). O custo caiu com a retenção de 365 dias. Recomendação: trocar por `"minuteStart" >= $min AND < $max`.

**B-11 · Cada refresh grava 4 linhas, incluindo um `LOGIN` auditado (NOVO, Fase 30).** Local: `backend/src/modules/auth/auth.controller.ts:271-279` e `backend/src/modules/auth/auth.repository.ts:440-478`. São `auth_token` novo, `refresh_token` novo, `update` do anterior e `audit_logs`, por aba e por hora, inclusive em abas ocultas. Alimenta M-03. Avaliar se o refresh precisa mesmo virar `LOGIN` na trilha (é uma decisão de produto e de conformidade).

**B-12 · Cópia de array a cada inserção: O(k²) no agrupamento (NOVO).** Local: `backend/src/modules/session/session-export.ts:44-47` e `backend/src/modules/goal/GoalAlertScheduler.ts:137-141`. `[...(map.get(k) ?? []), item]` copia a lista inteira a cada token ou meta. O padrão `push` já existe em `ConsumptionService.groupRowsByMs` (`consumption.service.ts:894-903`).

**B-13 · `METER_TARGET_INCLUDE` traz a Property inteira (NOVO).** Local: `backend/src/modules/meter/meter.repository.ts:60-64`. São usados só `id`, `userId`, `name`, `tariffGroup` e `distributorId`. A consulta roda a cada minuto no `DemandRollupScheduler` e em toda listagem de alertas. Recomendação: `select` enxuto.

**B-14 · Expurgo sequencial sem isolamento e `DELETE` único em `meter_readings` (NOVO).**
- Local: `backend/src/shared/retention/retention.service.ts:60-88` e `backend/src/modules/meter/meter-reading.repository.ts:458-465`.
- Um timeout no expurgo de `meter_readings` aborta os 4 expurgos seguintes (alertas, MFA, histórico de bandeira, relatórios).
- O `DELETE` em uma só transação ficou mais caro com a linha mais larga (A-02).
- Recomendação: `try` por etapa e expurgo em lotes (por exemplo, por dia).

**B-15 · `index.html` sem `Cache-Control` no Caddy (NOVO, resíduo do antigo A-05).** Local: `deploy/Caddyfile:37-49`. Os assets têm `immutable` (correto). O `index.html` fica sujeito ao cache heurístico do navegador e pode apontar para chunks de um deploy anterior. Recomendação: `Cache-Control: no-cache` no fallback da SPA.

**B-16 · Modbus/EtherNet-IP/PROFINET fazem 4 leituras sequenciais por amostra (NOVO).** Local: `backend/src/modules/iot/iot-worker/protocols/ModbusTcpConnection.ts:144-147`, com o mesmo padrão em `ModbusRtuConnection.ts`, `EthernetIpConnection.ts` e `ProfinetConnection.ts`. Com registradores contíguos, uma leitura em bloco basta. Irrelevante até a Fase 31 ou hardware real.

**B-17 · Reconexão SSE cross-origin com intervalo fixo de 2 s e listener de abort acumulado (NOVO).** Local: `frontend/src/lib/sse/appStream.ts:56-66` e `:264-286`. Não há backoff com o backend fora do ar, e cada `wait()` adiciona um listener `abort` ao mesmo `signal` sem removê-lo. Recomendação: backoff exponencial e `{ once: true }` com remoção.

**B-18 · Descarte de leitura inválida loga o payload inteiro em `warn` (resíduo do antigo M-06).** Local: `backend/src/modules/iot/iot-worker/IoTDataProcessor.ts:273-275`. Os adaptadores de polling agora emitem as 4 grandezas (resolvido), mas os valores crus sem escala (`ModbusTcpConnection.ts:128-133`) ainda caem aqui a cada poll com hardware real. Recomendação: amostragem ou `debug`.

**B-19 · Relatório gerado de forma síncrona e armazenado em bytes, também pela conta demo (NOVO, Fase 27).** Local: `backend/src/modules/report/report.routes.ts:53` (sem `blockDemoWrite`) e `backend/src/modules/report/report.service.ts:47`, `:52` e `:195-216`. Os tetos são bons (5 MB, 100 manuais, 92 dias). A conta demo compartilhada pode ocupar até 100 × tamanho real no Postgres, o que importa no Neon de 0,5 GB. **[MEDIR ANTES]** tamanho típico de um PDF. Confirmar se emitir pela demo é intencional.

---

## 4. Pontos fortes confirmados (não "otimizar" por engano)

- **Lote de verdade onde importa:** `resolveMeterTargets` (`meter-target.ts:73-85`), `findManyByIdsWithTarget` no `DemandRollupScheduler` e `calculateGroupAMonthlyCosts` e `findKwhByPostGroupedByMonth` no caminho anual.
- **Upsert atômico em SQL** (`meter-reading.repository.ts:194-248`), sem corrida de leitura seguida de escrita.
- **`COUNT(*) OVER()`** com fallback correto para página fora do intervalo (`consumption.repository.ts:109-152`).
- **Cache in-process com invalidação ou TTL documentado** para bandeira, distribuidora e catálogo tarifário.
- **Pool explícito** com `statement_timeout` de 15 s e um teto separado para o expurgo via `SET LOCAL` (`withPurgeTimeout.ts`).
- **SSE:** backpressure com desconexão de consumidor lento e serialização única por amostra via `WeakMap` (`iot-stream.routes.ts:160-183` e `:279-309`).
- **`PollingLoop`** com guarda de reentrância, timeout e reconexão com backoff; `MqttConnection` com `reconnectPeriod` depois de conectado.
- **Simulador:** coalescência via `setImmediate` e um único snapshot serializado por broadcast.
- **Fase 30, sessões ativas:**
  - o `sessionId` vem na mesma query do `authenticate` (`auth.repository.ts:56-68`), sem query extra por requisição;
  - a listagem é sempre filtrada por `userId` indexado, com `take: 100` (`session.repository.ts:40-79`);
  - o encerramento usa 2 `updateMany` numa transação;
  - a conta demo recebe lista fixa;
  - **não falta índice em `sessionId`**, porque toda query também filtra por `userId`. Não adicionar.
- **Fase 29:** curva de demanda O(1.440) com `Map` (`demandRollup.ts:82-102`); árvore de cadastro limitada a 100 propriedades e montada em lote.
- **Fase 27:** listagem de relatórios sem `content` (`METADATA_SELECT`) e tetos de tamanho, quantidade, baldes e episódios.
- **Fase 28:** `GoalAlertScheduler` processa um grupo de cada vez para não disputar o pool e tem guarda `running` contra sobreposição.
- **Frontend:**
  - React Compiler ligado;
  - rotas lazy e `manualChunks` (chunk inicial de 103 kB gzip, medido);
  - `refetchOnWindowFocus: false` justificado;
  - `useLiveMeterReading` com `setTimeout` exato;
  - `useLatestMeterReading` e `useMeterReadingHistory` com janela limitada.
- **Infraestrutura:** `compression` com filtro de SSE robusto (por caminho **e** por `Content-Type`); Caddy com `encode zstd gzip` e `immutable` em `/assets/*`; `pg_stat_statements` configurado no compose.

---

## 5. Situação dos achados de 2026-08-22

| Achado anterior | Estado | Evidência atual |
|---|---|---|
| A-01 índices de FK | **Resolvido** | migração `20260825020345`; `schema.prisma:636-637`, `:653`, `:670`, `:870` |
| A-02 N+1 em `/api/alerts` | **Resolvido** | `alert.service.ts:108-122` (lote); `countEnabled` em `:132-134` |
| A-03 fan-out de `/api/consumption` | **Mudado** | HTTP resolvido (`summary`); N+1 no banco continua dentro do `summary` (M-02) |
| A-04 `meter_readings` sem retenção | **Mudado** | etapa 1 feita (365 dias + índice `minuteStart`); linha 2 vezes mais larga e varreduras sem janela (A-01, A-02); `findMonthlyKwhForYears` em B-10 |
| A-05 sem compressão nem cache de assets | **Resolvido** | `app.ts:162`; `Caddyfile:20-21` e `:47-48` (resíduo em B-15) |
| A-06 re-render a 1 Hz | **Mudado** | compiler e contextos separados (medido); resíduo com muitos medidores (M-06) |
| M-01 upsert com 2 queries e corrida | **Resolvido** | `meter-reading.repository.ts:194-248` |
| M-02 `countBuckets` duplicado | **Resolvido** | `consumption.repository.ts:109-152` |
| M-03 sem cache de bandeira e distribuidora | **Resolvido** | `tariff-flag.repository.ts:60-88`; `distributor.repository.ts:52-91`; `tariff-catalog.repository.ts:24-40` |
| M-04 sem code-splitting | **Resolvido** | `AppRouter.tsx` (lazy); `vite.config.ts:55-64`; baseline de 30/08 |
| M-05 polling sem reentrância nem timeout | **Resolvido** | `pollingLoop.ts`; `reconnectBackoff.ts` |
| M-06 payload não-MQTT sempre descartado | **Resolvido** (desempenho) | `ModbusTcpConnection.ts:134-150`; resíduo em B-18 |
| M-07 `JSON.stringify` por cliente e sem backpressure | **Resolvido** | `iot-stream.routes.ts:160-183` e `:279-309` |
| M-08 polling de 60 s por conexão | **Persistente** | M-04 deste laudo |
| M-09 snapshot O(D²·C) no simulador | **Resolvido** | `store.ts:102-109`; `status.routes.ts:19-36` |
| M-10 exportação sem teto | **Persistente e agravado** | M-03 deste laudo |
| M-11 3 round trips em `resolveRootProperty` | **Resolvido** | `targetResolution.ts:28-48`; `meter-target.ts:60-66` |
| M-12 pool sem configuração | **Resolvido** | `prisma.ts:21-35`; `env.ts:223-261` |
| M-13 `reconnectPeriod: 0` | **Mudado** | M-05 deste laudo (falta retry da conexão inicial) |
| B-01 `staleTime` uniforme | **Persistente** | B-01 |
| B-02 `useLiveMeterReading` a cada 2 s | **Resolvido** | `useLiveMeterReading.ts:67-80` |
| B-03 corrida do `AlertEvaluator` | **Persistente** | B-02 |
| B-04 `getFiringByUser` | **Persistente** | B-03 |
| B-05 índices de expurgo | **Parcial** | B-04 |
| B-06 mapas sem poda | **Persistente** | B-05 |
| B-07 gráficos sem memo | **Resolvido** | compiler (`RealtimeChartCard` de 189 para 9 renders) |
| B-08 2 listagens para o KPI de alertas | **Resolvido** | `alert.service.ts:132-134` |
| B-09 `pageSize` 31 | **Persistente** | B-06 |
| B-10 `findMany()` sem `select` | **Persistente** | B-07 |
| B-11 devtools estático | **Persistente** (a verificar) | B-08 |
| B-12 chave com ISO da janela | **Persistente** | B-09 |

**Regressão de fato:** nenhuma no código que já existia. Os problemas novos vieram de **funcionalidade nova** (Fases 25, 27, 28, 29 e 30) e do uso de caminhos que já existiam (consultas "latest" sem janela) sobre uma tabela que ficou maior e mais larga.

---

## 6. Onde é obrigatório medir antes de otimizar

| Eixo | Instrumento (já existe no projeto) | Decide |
|---|---|---|
| Banco | `EXPLAIN (ANALYZE, BUFFERS)` de `findAggregated` hora sem janela × com 3 h, **na massa pós-Fase 25** (`npm run perf:generate-baseline-data`, o gerador precisa preencher as 22 colunas) | A-01, A-02 |
| Banco | `pg_total_relation_size('meter_readings')` + `count(*)` na VPS e no Neon, repetido após 7 dias | A-02 (substitui a estimativa de ~3,1 GiB/ano) |
| Banco | `DEBUG_QUERY_LOGGING_ENABLED=true` em `GET /api/consumption?granularity=month&pageSize=12` (Grupo A) e em `/api/consumption/summary` com 50 ids | A-03, M-02 |
| Pool | `getPoolStats()` (debug) durante uma carga do Painel de propriedade do Grupo A | A-03, M-02 (espera de conexão) |
| Banco | `count(*)` de `audit_logs` e `refresh_tokens` do usuário demo | M-03 |
| Expurgo | refazer o `EXPLAIN` do `DELETE` de 31/08 com a linha larga | B-14, folga do timeout de 120 s |
| Rede | DevTools → Network: bytes por minuto do `/api/iot/stream` com o Painel aberto | M-01 |
| Render | Profiler da Fase 17 com **11** medidores emitindo | M-06 |
| Infraestrutura | logs do Render: o staging hiberna com uma aba esquecida aberta? | A-02 (agravante) |
| Bundle | `ANALYZE=true npm run build` (último baseline em 30/08, antes das Fases 23 a 30) | B-08, regressão de bundle |

**Não precisam de medição** (são erro ou configuração ausente): A-03 (o caminho em lote já existe e não é usado), M-02 (`catch` silencioso), M-05 (sem retry da conexão inicial), B-02 (corrida), B-12 (O(k²)), B-14 (falta de isolamento entre etapas), B-15 e B-17.

---

## 7. Ordem de ataque sugerida

1. **Barato e de maior alavanca:** A-01. Mandar janela nos pedidos "latest" do Painel e do summary é uma mudança só no frontend, sem contrato novo, e corta de 4 a 5 varreduras da tabela inteira por carga.
2. **Usar o lote que já existe:** A-03, com `list()` mensal e a comparação Branca reaproveitando `calculateGroup*MonthlyCosts` e `findKwhByPostGroupedByMonth`.
3. **Fechar o N+1 que sobrou do lote:** M-02 (posse e medidor em `findMany` com `in`, e `catch` que não engole erro de pool).
4. **Medir e decidir o armazenamento:** A-02. Primeiro o número real; depois, a retenção diferenciada ou o rollup (ADR).
5. **Rede do tempo real:** M-01 (evento compacto e `voltageUnbalance` arredondado) e, junto, M-04 (evento de sessão encerrada e de medidores alterados no `UserEventHub`).
6. **Robustez:** M-05, B-02, B-14.
7. **Exportação:** M-03 (janela no audit log, tratamento da demo, `take` nas sessões).
8. **Restante dos Baixos**, oportunisticamente, junto de mudanças nos mesmos arquivos.

---

## 8. Referências

- `.claude/docs/2026-08-22-desempenho-audit.md`: laudo anterior, base das seções 3 e 5.
- `.claude/docs/2026-08-24-baseline-desempenho.md` (§3 a §4), `2026-08-26-baseline-desempenho-countbuckets-pool.md`, `2026-08-30-fase17-baseline-frontend.md` e `2026-08-31-baseline-desempenho-statement-timeout.md`: números de referência, todos **anteriores à Fase 25**.
- ADR-0013 (fim do keep-alive; a hibernação do staging é premissa do A-02), ADR-0014 (ambientes permanentemente demo), ADR-0022 (grandezas por fase), ADR-0023 (relatório em bytes no Postgres) e ADR-0025 (sessões ativas).
- `.claude/project_context/03-arquitetura.md`: rollup e tabela nova exigem ADR (A-02).
- `.claude/project_context/06-code-quality-standards.md` §Eficiência: N+1, `Map`/`Set`, "meça antes de otimizar".
- `.claude/docs/roadmap.md`, Fases 25 a 31.
