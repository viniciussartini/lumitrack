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
