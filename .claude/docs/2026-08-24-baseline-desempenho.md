# Baseline de Desempenho — Fase 15 (Instrumentação)

> Entregável da issue de instrumentação (épico #275, Fase 15). Consolida o que a issue pedia: massa sintética, `EXPLAIN (ANALYZE, BUFFERS)`, contador de query por requisição, estatísticas de pool e o tamanho real de `meter_readings`. Metodologia primeiro, números depois — cada número abaixo diz onde veio e o que decide.

## 1. O que este documento cobre, e o que fica para depois

Esta issue **constrói o instrumental de medição**; ela não corrige nenhum achado do laudo de desempenho de 2026-08-22. As issues seguintes do épico #275 (índices de FK, retenção) e do épico #279 (cache, `resolveMeterTarget`, N+1 de alertas, endpoint batch) são quem usa este instrumental para medir antes/depois de cada mudança.

**Duas medições da issue original não foram possíveis nesta sessão, por falta de acesso — registradas como pendência, não como concluídas:**

- **`pg_stat_statements` na VPS de produção** — habilitar a extensão exige superusuário do Postgres + reiniciar o servidor com `shared_preload_libraries` (não dá para fazer de dentro da aplicação nem com o usuário `lumitrack_admin` local, que não é superusuário). O código está pronto (`docker-compose.yml` + `deploy/enable-pg-stat-statements.sql`, ver §5) — falta a ação de deploy na VPS, documentada em `.claude/docs/DEPLOY.md` §10.
- **`pg_total_relation_size('meter_readings')` e taxa de crescimento/dia na VPS real** — esta sessão não tem acesso à VPS de produção. §4 mede o equivalente num banco sintético local como *prova de método*; o número real da VPS precisa ser coletado por quem tem acesso a ela (comando pronto, ver §4).

## 2. Metodologia — massa sintética

`backend/scripts/generate-performance-baseline-data.ts` (novo, `npm run perf:generate-baseline-data`) gera leituras de minuto no mesmo perfil da demonstração (`iot-simulator/server/src/simulation/demoBootstrap.ts`): 1 amostra/minuto por medidor. Roda contra `PERFORMANCE_BASELINE_DATABASE_URL` — nunca `DATABASE_URL` — com dois guards que recusam rodar se a variável estiver ausente ou for igual ao banco de desenvolvimento (testado manualmente: ambos os casos abortam com `exit 1` antes de tocar o banco).

**Execução real desta sessão** (banco descartável `lumitrack_perf_baseline`, Postgres 16 local, schema migrado via `prisma migrate deploy`):

```
npm run perf:generate-baseline-data -- --months=12 --meters=11
```

11 medidores × 12 meses × 1.440 leituras/dia = **5.702.400 linhas**, geradas em ~14 minutos (54s a 100s por medidor — o tempo por medidor cresceu à medida que a tabela ficou maior, esperado com `createMany` em lotes de 5.000 sobre uma tabela crescendo). Cardinalidade idêntica à projeção do laudo de 2026-08-22 (11 × 1.440 = 15.840 linhas/dia).

**Diferença consciente em relação ao ambiente real:** hardware local, não o da VPS — os tempos absolutos abaixo não transferem 1:1 para produção. O que transfere é o **formato do plano** (seq scan vs. index scan, linhas filtradas, uso de paralelismo) — é isso que orienta a decisão de índice/retenção, não o milissegundo exato.

## 3. `EXPLAIN (ANALYZE, BUFFERS)` — `findAggregated` e `countBuckets`

Medidor `5227abeb-3ba8-4086-9cb2-7e7208f4114c`, 518.400 leituras (1 ano), consultado com `granularity=hour`, sem filtro de intervalo (`from`/`to`), primeira página (`LIMIT 30 OFFSET 0`) — a consulta mais comum do painel.

### `findAggregated` (a query real de `consumption.repository.ts`)

```
Limit (actual time=301.745..306.201 rows=30) 
  Buffers: shared hit=3552 read=129136 written=267, temp read=1158 written=2682
  -> GroupAggregate (actual time=110.085..114.540 rows=30)
     -> Gather Merge (Workers Planned: 2, Workers Launched: 2)
        -> Sort (Sort Method: external merge  Disk: ~7MB por worker)
           -> Parallel Seq Scan on meter_readings (actual time=6.072..87.863 rows=172800 loops=3)
              Filter: ("meterId" = '5227abeb-...')
              Rows Removed by Filter: 1728000
Execution Time: 447.040 ms
```

**Leitura:** `Parallel Seq Scan` varre a tabela inteira (5,7M linhas, 3 workers) e descarta **1.728.000 linhas por worker** que não são do medidor pedido — só ~9% das linhas da tabela pertencem a ele (1 de 11 medidores). O `ORDER BY` força um `Sort` que estoura para disco (`external merge`, ~7MB/worker) porque o resultado intermediário não cabe em memória de trabalho antes do `LIMIT`.

**Achado que não estava na hipótese do laudo, e importa para a Fase 15:** a tabela já tem um índice que cobre `meterId` — o `UNIQUE(meterId, minuteStart)` que sustenta o `@@unique([meterId, minuteStart])` do schema (índice `meter_readings_meterId_minuteStart_key`). O planner **decide não usá-lo** aqui, porque `findAggregated` precisa de colunas fora do índice (`kwhConsumed`, `avgPowerW`, `secondsCovered`) — usar o índice exigiria um heap fetch por linha, mais caro que um seq scan nessa seletividade (~9%). **Consequência prática:** um índice adicional em `meterId` isolado (equivalente ao que já existe via o índice único) não muda este plano — a query continua sendo gargalo de **tamanho de tabela**, não de índice ausente. Isso pesa a favor da etapa 1 do A-04 (expurgo/retenção, issues #236/#267) como a intervenção que efetivamente reduz o custo desta query — reduzir `meterId` de "9% de 5,7M" para "9% de uma tabela bem menor" ajuda tanto o seq scan quanto qualquer decisão futura de índice.

### `countBuckets` (a segunda query, M-02)

```
Aggregate (actual time=142.715..142.716 rows=1)
  Buffers: shared hit=1 read=4289 written=1592
  -> HashAggregate (Planned Partitions: 4, Memory Usage: 2329kB)
     -> Index Only Scan using meter_readings_meterId_minuteStart_key on meter_readings
        (actual time=2.354..116.481 rows=518400)
        Index Cond: ("meterId" = '5227abeb-...')
        Heap Fetches: 0
Execution Time: 151.690 ms
```

**Leitura:** ao contrário de `findAggregated`, `countBuckets` só precisa de `meterId`/`minuteStart` (ambos no índice único) — o planner usa `Index Only Scan`, sem tocar a tabela (`Heap Fetches: 0`). Mais barata (152ms) que `findAggregated` (447ms), mas ainda uma segunda varredura completa das 518.400 linhas do medidor só para contar quantos baldes existem — exatamente o achado M-02: `COUNT(*) OVER()` na própria `findAggregated` eliminaria essa segunda passada por completo (issue própria, #284, fora do épico #275/#279 por ser P2 "só com número na mão" — agora com o número na mão: **151ms por página carregada**, span de latência que some sozinho).

## 4. Tamanho e crescimento de `meter_readings`

**No banco sintético local** (5.702.400 linhas, 12 meses × 11 medidores):

```
 total_size | table_size |  count
------------+------------+---------
 2015 MB    | 1036 MB    | 5702400
```

`total_size` inclui os índices (a diferença de ~979MB entre `total_size` e `table_size` é majoritariamente o índice único `meterId+minuteStart`, quase do tamanho da própria tabela — outro dado a favor de expurgo em vez de mais índice: cada índice novo em `meter_readings` custa proporcionalmente caro). Dividindo pelas 5.702.400 linhas: **~190,5 bytes/linha só de tabela, ~370,5 bytes/linha com o índice único** (a diferença, ~180 bytes/linha, é o próprio índice). 15.840 linhas/dia (perfil dos 11 medidores da demo) custam **~5,6 MiB/dia** de armazenamento total nesse formato (~2,9 MiB/dia só de tabela) — **≈ 2 GiB/ano para os 11 medidores da demo**, um teto conhecido e estável: a ADR-0014 fixou os ambientes como permanentemente sintéticos, então esse número não escala com adoção de usuário real; ele só cresce com o tempo corrido.

> **Correção (issue #236):** a versão original desta seção, escrita na sessão de #276, dividiu errado e registrou "~86 bytes/linha... ~2,7 MB/dia" — a conta certa dá ~190,5/~370,5 bytes/linha e ~5,6 MiB/dia (quase o dobro). Corrigido aqui porque a decisão de retenção de #236 usa este número.

**Na VPS de produção — comando pronto, execução pendente (sem acesso desta sessão):**

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_size_pretty(pg_total_relation_size('meter_readings')) AS total_size,
          pg_size_pretty(pg_relation_size('meter_readings')) AS table_size,
          count(*) FROM meter_readings;"
```

A produção subiu em 2026-08-23 (ADR-0012/13.7) — a essa altura tem só 1-2 dias de dado real, insuficiente para medir taxa de crescimento com confiança; repetir esta consulta depois de 1-2 semanas de operação dá o número real para decidir o prazo de retenção em #236.

## 5. `pg_stat_statements` — configurado, habilitação pendente de deploy

`docker-compose.yml`: serviço `postgres` ganhou `command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "pg_stat_statements.track=all"]` e um segundo init script, `deploy/enable-pg-stat-statements.sql` (idempotente, mesmo padrão de `create-app-role.sql`). Validado com `docker compose config` (exit 0, `command:` e os dois volumes de init aparecem corretamente na configuração resolvida).

**Não habilitável nesta sessão:** `shared_preload_libraries` exige superusuário do Postgres e reinício do servidor — o Postgres local desta sessão roda com o usuário `lumitrack_admin`, que não é superusuário (`rolsuper = f`), e não há acesso de root/systemd à instância para reiniciá-la com a flag. Em Docker (VPS ou dev com compose), o próprio `command:` do serviço resolve isso ao recriar o container — passo documentado em `.claude/docs/DEPLOY.md` §10 (dois comandos: recriar o container, depois `CREATE EXTENSION`).

## 6. Contagem de queries por requisição (`prisma.$on('query')` + `AsyncLocalStorage`)

Implementado em `backend/src/shared/database/queryCounter.ts`, ligado em `shared/database/prisma.ts` (o listener sempre existe fora de produção; só incrementa o contador quando há uma requisição rastreada) e montado em `app.ts` como middleware, restrito a `/api/alerts` e `/api/consumption`, atrás de `DEBUG_QUERY_LOGGING_ENABLED` — `env.ts` recusa essa flag `true` em produção (testado em `env.test.ts`).

**Verificado por teste unitário** (`queryCounter.test.ts`, 5 casos): ignora caminhos fora do escopo, conta corretamente incrementos durante a requisição, casa por prefixo (`/api/consumption/summary` conta como `/api/consumption`), não lança fora de contexto, e **isola contextos concorrentes** (duas requisições simultâneas com contagens diferentes não se misturam — a garantia central de usar `AsyncLocalStorage` em vez de uma variável de módulo).

**Não exercitado com requisição HTTP real nesta sessão** — a instrumentação existe e está correta por construção (testes unitários), mas o número real de queries por página de `/api/alerts`/`/api/consumption` só tem valor quando comparado antes/depois de uma mudança concreta. Fica para quem implementar cada issue do épico #279 (N+1 de alertas, endpoint batch, cache): ligar `DEBUG_QUERY_LOGGING_ENABLED=true` localmente, bater na rota, e comparar a contagem logada antes e depois da mudança.

## 7. Estatísticas do pool de conexões

`shared/database/prisma.ts` agora constrói o `pg.Pool` explicitamente (antes delegado inteiramente ao `PrismaPg`, que não expunha o pool criado) e exporta `getPoolStats()`. `MinuteRollupScheduler` recebe esse provedor por injeção de dependência (`PoolStatsProvider`, default `() => null` — mantém os testes unitários existentes livres de qualquer conexão real de banco) e loga `{ totalCount, idleCount, waitingCount }` em nível `debug` depois de cada flush com baldes para persistir.

**Verificado por teste unitário** (`MinuteRollupScheduler.test.ts`, 2 casos novos): não consulta o pool quando não há baldes a persistir (evita ruído a cada 60s sem dado novo); consulta exatamente uma vez após persistir. Valores reais de saturação (`totalCount`/`idleCount`/`waitingCount`) exigem processo rodando com IoT real conectado — observável em produção/staging com `LOG_LEVEL=debug`, insumo direto da issue de pool explícito (#285).

## 8. `EXPLAIN` de `resolveUserMeterIds` antes/depois dos índices de FK (issue #278)

Migração `20260825020345_add_fk_indexes_desempenho` (aditiva, 6 `CREATE INDEX`): `Property.userId`, `Property.distributorId`, `Area.propertyId`, `Device.areaId`, `Alert.userId`, `MeterReading.minuteStart` (suporte ao expurgo de #267). Aplicada em `lumitrack_dev`, `lumitrack_test` e `lumitrack_test_http`.

**Metodologia:** ao contrário de §3 (onde o volume vem da massa sintética de `meter_readings`), aqui o gargalo não é tamanho de `meter_readings` — é a ausência de índice em tabelas que, na produção real, são pequenas (uma linha por propriedade/área/dispositivo físico, não por leitura). Para tornar o filtro por `userId` seletivo o bastante para o planner mostrar diferença, um banco descartável à parte foi populado via SQL direto (bulk insert, mais rápido que `createMany` em lote para este volume): **20.001 usuários, 20.001 propriedades (1:1), 20.001 medidores** (`targetType=PROPERTY`), mais um usuário-alvo isolado com 1 propriedade e 1 medidor — a mesma consulta 3-way `OR` de `resolveUserMeterIds` (`iot-stream.routes.ts:42-55`), traduzida para SQL equivalente, filtrando pelo usuário-alvo. **Antes/depois isolado com `DROP INDEX`/`CREATE INDEX` na mesma massa de dados** — controla a variável única que importa (presença do índice), sem re-gerar dado entre as duas medições.

**Antes (sem os 3 índices que sustentam a cadeia property→area→device):**

```
Seq Scan on meters m (actual time=7.808..7.811 rows=1)
  Rows Removed by Filter: 20000
  Buffers: shared hit=1823
  SubPlan 1 -> Seq Scan on properties (Rows Removed by Filter: 20000, Buffers: shared hit=445)
  SubPlan 2 -> Nested Loop -> Seq Scan on properties (Buffers: shared hit=445) -> Seq Scan on areas
  SubPlan 3 -> Nested Loop -> Nested Loop -> Seq Scan on properties (Buffers: shared hit=445) -> Seq Scan on areas -> Seq Scan on devices
Execution Time: 7.892 ms
```

**Depois (com os 3 índices):**

```
Seq Scan on meters m (actual time=2.215..2.216 rows=1)
  Rows Removed by Filter: 20000
  Buffers: shared hit=504
  SubPlan 1 -> Index Scan using "properties_userId_idx" (Buffers: shared hit=4)
  SubPlan 2 -> Nested Loop -> Index Scan using "properties_userId_idx" (shared hit=4) -> Bitmap Heap Scan on areas via "areas_propertyId_idx" (shared hit=2)
  SubPlan 3 -> ... -> Index Scan using "devices_areaId_idx" (never executed — SubPlan 2 já não bateu, curto-circuito do OR)
Execution Time: 2.282 ms
```

**Leitura:** as 3 subconsultas (uma por ramo do `OR`: property/area/device) passam de `Seq Scan` (445 buffers e 20.000 linhas descartadas **cada uma**) para `Index Scan`/`Bitmap Heap Scan` (4 e 2 buffers). Tempo total cai de 7,89ms para 2,28ms — **~3,5× neste volume de 20 mil linhas**, com a vantagem crescendo junto do tamanho real da tabela (o `Seq Scan` externo em `meters` permanece — a própria tabela `meters` é pequena o bastante para o planner preferir seq scan nela mesma, comportamento correto e esperado, não um índice faltando). A cascata `ON DELETE` (achado citado no laudo) se beneficia do mesmo jeito: excluir uma `Property` agora localiza as `Area`s dependentes por índice, não por varredura completa de `areas`.

Migração e resultado completo comentados na issue #278.

## 9. Onde cada achado do laudo fica decidido

| Achado do laudo 2026-08-22 | Decidido por este documento | Próximo passo |
|---|---|---|
| A-01 (índices de FK) | Confirmado (§3) que nenhum índice em `meter_readings` resolve `findAggregated` — o gargalo lá é tamanho de tabela. Em `Property`/`Area`/`Device`, onde o índice ausente é real, §8 mede ~3,5× de ganho num volume de 20 mil linhas, com os 3 índices já aplicados via migração. | #278 — **concluído** |
| A-04 etapa 1 (retenção) | Reforçado por §3 e §4: reduzir `meter_readings` ajuda tanto `findAggregated` (menos seq scan) quanto o tamanho físico da tabela+índice. | #236, #267 |
| M-02 (`countBuckets` duplicado) | Quantificado: 151ms por página só para contar — issue #284 deixa de ser "só com número na mão", o número já existe. | #284 |
| M-12 (pool sem configuração) | Instrumentação pronta (§7); valores reais dependem de operação real. | #285 |
| Contagem de query por requisição (A-02, A-03, B-08) | Instrumentação pronta (§6), verificada por teste; medição real fica para cada issue de correção. | #280, #281, #282, #283 |
