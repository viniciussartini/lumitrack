# Baseline de Desempenho — Épico #279 (Redução de custo unitário)

> Consolida, por sub-issue, a contagem de queries/requisições antes e depois de cada mudança — critério de aceite explícito das 4 issues do épico (#280, #281, #282, #283). Usa o instrumental de medição do épico #275 (`prisma.$on("query")`, `DEBUG_QUERY_LOGGING_ENABLED`). Cada seção é acrescentada ao concluir a sub-issue correspondente.

## #280 — Cache in-process de bandeira tarifária e catálogo de distribuidoras

**Metodologia:** instância isolada de `PrismaClient` com listener `$on("query")` contando queries reais, chamando `ConsumptionService.list()` diretamente (sem HTTP) contra 1 propriedade/1 medidor/1 leitura sintéticos em `lumitrack_test`. Duas chamadas sequenciais no mesmo processo — a segunda simula a próxima requisição servida pela mesma instância de `TariffFlagRepository`/`DistributorRepository` (o caso real: essas classes são instanciadas uma vez por rota no boot do servidor, não por requisição).

**Antes** (código em `staging`, `eb70cf9`, sem cache):

| Chamada | Queries |
|---|---|
| 1ª (cache não existe) | 6 |
| 2ª (mesmo processo) | 6 |

**Depois** (com o cache do #280):

| Chamada | Queries |
|---|---|
| 1ª (cache frio) | 6 |
| 2ª (mesmo processo) | 4 |

**Resultado:** -2 queries por requisição a partir da segunda, exatamente as duas eliminadas (`distributorRepository.findById` e `tariffFlagRepository.get()`) — confirma a expectativa do achado M-03 do laudo de 2026-08-22. O ganho é por processo, não por request: a primeira requisição depois de um boot/deploy ainda paga o custo cheio (cache frio), e o TTL de 5 min do catálogo de distribuidoras eventualmente expira mesmo sem escrita — comportamento esperado e documentado no código, não uma limitação do teste.

**Achado de implementação não previsto no plano original:** `TariffFlagRepository` e `DistributorRepository` são instanciados separadamente em 5 pontos de wiring diferentes (`consumption.routes.ts`, `simulation.routes.ts`, `tariff-flag.routes.ts`, `distributor.routes.ts`, `property.routes.ts`/`export.routes.ts` para o segundo) — todos sobre o mesmo `PrismaClient`/Postgres. Um cache por instância (`this.cache`) deixaria a invalidação feita por uma rota invisível às outras (ex.: a bandeira mudar via `TariffFlagSyncService` não seria vista pela instância usada por `consumption.routes.ts`). O cache foi implementado em nível de **módulo** (variável fora da classe), não de instância — corrige o problema sem tocar nos 5 pontos de wiring. Efeito colateral tratado: esse mesmo estado de módulo sobrevive entre `it()` de um mesmo arquivo de teste, então `cleanDatabase()` (`backend/src/shared/test/clean-database.ts`) agora também limpa os dois caches — sem isso, o primeiro `get()`/`findById()` bem-sucedido de uma suíte vazaria dado obsoleto para os testes seguintes mesmo após o banco ser limpo.

## #281 — resolveRootProperty / resolveMeterTarget em uma única query

**Achado crítico de implementação, não previsto no plano original:** a primeira versão (`include` aninhado simples, sem `relationLoadStrategy`) **não reduziu nenhuma query** — medido, não assumido. O Prisma, por padrão, resolve `include` fazendo **uma query por nível de relação** (a "query strategy"), não um `JOIN` SQL — para `device.findUnique({ include: { area: { include: { property: true } } } })` isso significa 3 `SELECT`s sequenciais nos bastidores do próprio Prisma, exatamente o mesmo custo de encadear `findById` manualmente. Confirmado com o listener `$on("query")`: antes e depois da primeira versão do código, `/api/consumption` com alvo DEVICE mediu **8 queries nos dois casos**.

**Correção:** habilitado o preview feature `relationJoins` do Prisma (`previewFeatures = ["relationJoins"]` em `schema.prisma`, `prisma generate` executado) e adicionado `relationLoadStrategy: "join"` nas 3 queries novas (`AreaRepository.findByIdWithProperty`, `DeviceRepository.findByIdWithProperty`, `MeterRepository.findByIdWithTarget`) — isso força um `JOIN` SQL real de uma única ida ao banco. Opt-in por query: nenhum outro `include` do projeto muda de comportamento, só estes 3 pontos novos pedem explicitamente a estratégia de join.

**Antes/depois — `/api/consumption`, alvo DEVICE (pior caso, 3 níveis: device→área→propriedade):**

| Momento | Queries |
|---|---|
| Antes (`resolveRootProperty` com 3 lookups sequenciais) | 8 |
| Depois, só `include` sem `relationLoadStrategy` (medido, descartado) | 8 (sem ganho) |
| Depois, com `relationLoadStrategy: "join"` | 6 |

**Antes/depois — `/api/alerts`, `AlertService.findAll`:** duas medições, porque o Prisma já faz batching automático de múltiplas chamadas `findUnique` concorrentes (via `Promise.all`) com a **mesma forma de query** — o achado do laudo (N+1, até 124 queries) só se manifesta por inteiro quando os alvos têm `targetType` **misto**, porque antes cada tipo batia numa tabela/forma de query diferente e o Prisma não conseguia agrupar entre tipos.

| Cenário | Antes | Depois |
|---|---|---|
| 5 alertas, todos alvo PROPERTY (mesma forma de query já batchava) | 4 | 3 |
| 6 alertas, `targetType` misto (2 PROPERTY, 2 AREA, 2 DEVICE) | 9 | 3 |

**Leitura:** o ganho real do #281 para `/api/alerts` não é eliminar o N+1 por si (isso é o #282), é dar a `resolveMeterTarget` **uma forma de query única para qualquer `targetType`** — isso é o que permite ao Prisma agrupar uma página inteira de alvos mistos numa única query, algo que a versão antiga (branch por tipo, 3 formas de query diferentes) nunca conseguia fazer sozinha. O caso de 5 alertas todos PROPERTY já era parcialmente batchado antes (dataloader do Prisma), por isso mostra um ganho menor (-1) — não é representativo do achado A-02 do laudo, que é sobre a mistura de tipos.

**Teste dedicado:** `backend/src/shared/targetResolution.test.ts` (novo) — 6 casos, cobrindo PROPERTY/AREA/DEVICE e "não encontrado" nos níveis estruturalmente alcançáveis.

## #282 — N+1 em AlertService.findAll + enabledCount no envelope paginado

**Achado honesto, medido antes de escrever qualquer texto de resultado:** `MeterRepository.findManyByIdsWithTarget` (o batch explícito via `findMany({ where: { id: { in: meterIds } } } })`) mede **exatamente a mesma contagem de queries que o #281 sozinho já entregava** para o cenário de 6 alertas com `targetType` misto — 3 nos dois casos. O motivo: o dataloader do Prisma já coalescia as chamadas concorrentes de `Promise.all` em uma única query desde que #281 deu a `resolveMeterTarget` uma forma de query uniforme (`findByIdWithTarget`, mesmo `include`/`relationLoadStrategy` para qualquer `targetType`). O batch explícito deste #282 **não é redundante apesar disso**: o dataloader é um comportamento interno do motor Prisma, não documentado como contrato estável entre versões — depender só dele para a correção do N+1 seria frágil (qualquer mudança futura no motor, ou uma quebra acidental da concorrência do `Promise.all` em uma refatoração, regrediria silenciosamente, sem nenhum teste acusando). `findManyByIdsWithTarget` torna a garantia **explícita e testável**, independente de como o Prisma decide otimizar chamadas concorrentes.

| Cenário | findAll antes (#275, código pré-#281) | findAll após #281 (dataloader implícito) | findAll após #282 (batch explícito) |
|---|---|---|---|
| 6 alertas, `targetType` misto | 9 | 3 | 3 |

## #283 — Endpoint batch de consumo (GET /api/consumption/summary)

**Metodologia — end-to-end contra o servidor de desenvolvimento real** (não só a suíte de testes): backend subido (`npm run dev`), 2 propriedades + 2 medidores criados via API real, 2 leituras inseridas direto via `psql`, endpoint chamado com `curl` autenticado. Prova que autorização por id, batching e cálculo de custo funcionam de ponta a ponta, não só contra o banco de teste isolado.

```
GET /api/consumption/summary?targetType=PROPERTY&ids=<A>,<B>&granularity=month
→ 200, items: [{ id: A, kwhConsumed: 40, costBrl: 22.22, ... }, { id: B, kwhConsumed: 10, costBrl: 16.67, ... }]

GET .../summary?ids=<A>,<id-inexistente>          → 200, items: [{ id: A, ... }]  (exclusão silenciosa)
GET .../summary?ids=                              → 422 (lote vazio)
GET .../summary (sem Authorization)               → 401
```

**Requisições HTTP — antes/depois, N alvos na mesma tela:** a prova mais direta vem da própria mudança do teste de `PropertyComparisonSection` — o teste antigo afirmava `expect(consumptionService.list).toHaveBeenCalledTimes(2)` para uma tela com 2 propriedades (uma chamada HTTP por propriedade, via `useQueries`); o teste novo, para o mesmo cenário de 2 propriedades, afirma `expect(consumptionService.summary).toHaveBeenCalledTimes(1)`. Generaliza para os 3 pontos de fan-out (`PropertyComparisonSection`, `AreasSection`, `DevicesSection`): de N requisições HTTP para 1, qualquer que seja N.

| Ponto de fan-out | Requisições antes (N alvos) | Requisições depois |
|---|---|---|
| `PropertyComparisonSection` | N | 1 |
| `AreasSection` (PropertyDetailsPage) | N | 1 |
| `DevicesSection` (AreaDetailsPage) | N | 1 |

**Achado de implementação, não previsto no plano original:** `meter_readings.meterId` é `String` (Postgres `text`), não `uuid` nativo — `WHERE "meterId" = ANY(${meterIds}::uuid[])` falhou em runtime com `operator does not exist: text = uuid` (`findMonthlyKwhForYears`, o precedente copiado para este cast, usa `::timestamp[]` porque compara contra uma coluna `timestamp`, não `uuid` — o padrão não se aplicava 1:1). Corrigido para `::text[]`, coerente com o tipo real da coluna. Pego pelos testes de integração (`consumption.service.test.ts`), não pelo type-check — reforça por que os testes rodam contra Postgres real, não mocks.

**`pageSize: 3` removido dos 3 componentes** (issue #283, critério de aceite explícito) — existia só para não colidir a `queryKey` com a do KPI (`DashboardKpiRow`); com `queryKeys.consumption.summary(...)` como chave própria, não tem mais razão de existir. O `.reduce()` client-side em `AreasSection` que escolhia manualmente o bucket mais recente entre até 3 retornados também saiu — `findLatestAggregatedForMeters` já garante 1 bucket por medidor, o mais recente, no próprio SQL (`DISTINCT ON` + `ORDER BY bucket DESC`).

**`GET /api/alerts/stats`:** 1 query (`alert.count`). Substitui o que antes era uma segunda página cheia de `findAll` (pageSize 31) só para contar `enabled` no cliente — pagando o N+1 completo do A-02 (até 124 queries antes de #281/#282) para produzir um número inteiro. Ganho: de "o N+1 inteiro de uma segunda página" para 1 query de `COUNT`.

**Teste dedicado:** caso novo em `alert.service.test.ts` com página de `targetType` misto (PROPERTY+AREA+DEVICE), provando que o `Map` de `resolveMeterTargets` associa o target certo a cada alerta — a montagem errada (target do alerta A aparecendo no alerta B) é exatamente o tipo de bug que um batch mal feito introduziria silenciosamente.
