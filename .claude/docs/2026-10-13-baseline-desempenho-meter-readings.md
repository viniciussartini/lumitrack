# Baseline de Desempenho — `meter_readings` com 22 colunas por fase (issue #535)

> Mede o que o laudo `2026-10-10-desempenho-audit.md` (A-02) só estimou: a largura real da linha depois da migração `20260927154349_grandezas_eletricas_por_fase`, o custo de leitura das consultas do Painel com e sem janela, e o custo do `DELETE` do expurgo. É a referência de todo ganho declarado nos itens #518, #519 e #520 e a base numérica da ADR-0027.

## Metodologia

- **Massa local:** banco descartável `lumitrack_perf_baseline` no PostgreSQL 18.6 local, gerado por `backend/scripts/generate-performance-baseline-data.ts --months=12 --meters=11`. O gerador agora preenche as 22 colunas por fase de todas as linhas (antes só preenchia as 9 originais). **11 medidores × 518.400 leituras = 5.702.400 linhas**, de 18/10/2025 a 13/10/2026.
- **Linha cheia:** a massa representa um medidor trifásico que reporta todas as grandezas, o caso que dimensiona o crescimento. Uma instalação cujo medidor não reporta as grandezas por fase grava `NULL` nelas e fica mais estreita.
- **Consultas:** o SQL de `ConsumptionRepository.findAggregated` e de `findLatestAggregatedForMeters` (ver `backend/src/modules/consumption/consumption.repository.ts`), com `EXPLAIN (ANALYZE, BUFFERS)`, os últimos 3 baldes em ordem decrescente e `localTsExpr()` igual ao de produção. A janela parte do **último instante da massa**, não de `now()`, para o número não depender de quanto tempo passou desde a geração.
- **Duas execuções por consulta** (1ª e 2ª) e **duas rodadas completas do script** (a 2ª rodada serve de repetição e mostra a variação). Os valores abaixo são da execução quente, nas duas rodadas.
- **Ambiente local:** `shared_buffers = 128 MiB`, `work_mem = 4 MiB`, `effective_cache_size = 4 GiB`, `max_parallel_workers_per_gather = 2`, `jit = on`. A tabela (~2 GiB) cabe no cache do sistema operacional, então a "execução fria" local **não é fria de verdade**: em disco frio os números sem janela pioram (ver a VPS).
- **VPS (produção):** PostgreSQL 16.x em contêiner, mesmos ajustes de `shared_buffers`, `work_mem` e `jit`. Medição só de leitura (`SET default_transaction_read_only = on`), sem `DELETE`, nem em transação revertida. A VPS tem **590.699 linhas e 11 medidores (40 dias)**, ainda com o esquema de 12 colunas (19 migrações aplicadas, a última `20260825212852_add_retention_purge_support_indexes`), por causa da promoção `staging` → `main` das Fases 25 a 32 ainda pendente. Os números da VPS são portanto de **linha estreita e volume pequeno**.
- **Unidades:** tamanhos em MiB e GiB (base 1024), como o `pg_size_pretty` os imprime; taxas de crescimento derivadas de bytes (`pg_total_relation_size`) divididas pelos dias.
- **Neon (staging):** não medido, por decisão do usuário (o plano gratuito não comporta esse volume).

## 1. Tamanho e crescimento

| | Linhas | Tabela | Índices | Total | Bytes/linha (tabela) | Bytes/linha (com índices) |
|---|---|---|---|---|---|---|
| **Local, 22 colunas** | 5.702.400 | 2.026 MiB | 1.076 MiB | 3.102 MiB | 372,5 | **570,4** |
| **VPS, 12 colunas** | 590.699 | 111 MiB | 115 MiB | 226 MiB | ~197 | ~401 |

- Tupla média (`pg_column_size`): **360 B** com as 22 colunas, **184 B** na VPS.
- Índices na massa local: `meter_readings_pkey` 417 MiB, `meter_readings_meterId_minuteStart_key` 592 MiB, `meter_readings_minuteStart_idx` 67 MiB. **Os índices são 35% do total**, e a chave primária `id` (um `uuid` em texto que nenhuma consulta usa) ocupa 417 MiB.
- **Crescimento do esquema novo, 11 medidores:** 15.840 linhas/dia × 570,4 B = 9,04 × 10⁶ B = **~8,6 MiB/dia**; × 365 dias = 3,30 × 10⁹ B = **~3,07 GiB** (a massa de 360 dias mediu 3.102 MiB = 3,03 GiB). Confirma o laudo (~3,1 GiB/ano).
- **Crescimento na VPS (esquema atual):** 236.830.720 B em 40,08 dias = 5,91 × 10⁶ B/dia = **~5,6 MiB/dia**. Os 40 dias são medidos; a retenção de 365 dias (× 365 = 2,16 × 10⁹ B = **~2,0 GiB**) é extrapolação linear. O número de "~2 GiB/ano" que `env.ts` e o RIPD §3.3 registravam vale **para o esquema antigo**, e a VPS ainda o roda.
- **Efeito da migração na VPS:** a linha vai de ~401 B para ~570 B com índices, **~1,4× no total** (a tabela fica ~1,9× mais larga, mas os três índices não mudam de tamanho por linha). Estimativa, a ser confirmada depois da promoção.
- **Banco inteiro da VPS:** 277 MiB. A tabela `meter_readings` é 82% dele.
- **Disco da VPS:** 193 GiB no volume do Postgres, 8,6 GiB usados, **185 GiB livres** (`df -h`). Os ~3,1 GiB/ano do esquema novo são ~1,7% do espaço livre.
- **Cobertura da coleta na VPS:** 590.699 de ~633.000 linhas nominais (11 × 1.440 × 40), ou ~93%; o resto são minutos sem leitura (indisponibilidade).

## 2. Consultas do Painel: sem janela × com janela (local, 5,7 M linhas)

Tempo de execução em ms, execução quente. Duas rodadas.

| Consulta | Granularidade | Sem janela | Com janela | Janela |
|---|---|---|---|---|
| `findAggregated` (1 medidor) | hora | 196 / 202 | **0,09 / 0,10** | 3 h |
| `findAggregated` | dia | 194 / 195 | **2,1 / 2,2** | 5 dias |
| `findAggregated` | mês | 196 / 197 | **15,5 / 15,4** | 1 mês |
| `findLatestAggregatedForMeters` (11 medidores) | hora | 702 / 1.048 | **0,75 / 0,78** | 3 h |
| `findLatestAggregatedForMeters` | mês | 635 / 1.217 | 223 / 560 (ver nota) | 1 mês |
| `findMonthlyKwhForYears` (predicado atual, 1 medidor) | ano | 245 / 250 | — | — |

- **Sem janela, toda consulta faz `Parallel Seq Scan` da tabela inteira**: 259.200 blocos lidos (a tabela inteira, ~2 GiB) para devolver 3 linhas (`findAggregated`) ou 11 (`findLatestAggregatedForMeters`). Com janela de 3 h ou 5 dias, o plano vira `Bitmap Index Scan` em `meter_readings_meterId_minuteStart_key` (tanto com 1 medidor quanto com os 11, no local; na VPS o planner usa `meter_readings_minuteStart_idx`) e lê de 15 blocos (hora, 1 medidor) a 178 (hora, 11 medidores) e 392 (dia). A janela de 1 mês lê 2.326 blocos para 1 medidor, mas para os 11 medidores o plano continua sendo `Seq Scan` (ver abaixo).
- **Hora ganha ~3 ordens de grandeza (≈2.000×) e dia ~2 (≈90×).** O mês com janela de 1 mês ganha ~13× em um medidor, mas **o `findLatestAggregatedForMeters` de mês nos 11 medidores ainda faz `Seq Scan`**: 1 mês de 11 medidores são 475.211 linhas, 8,3% da tabela (para um medidor só, 1 mês é 8,3% do histórico dele, ou 0,76% da tabela), e o planner prefere varrer. O ganho dessa conta depende de quantos medidores entram na consulta.
- **A variação entre rodadas é grande nos casos de varredura de vários medidores** (702 → 1.048 ms, 635 → 1.217 ms, 223 → 560 ms), e o planner mudou as estimativas entre rodadas. Nota do B4 mês com janela: 223 ms é a execução quente da 1ª rodada (222,5 ms) e 560 ms a quente da 2ª; por coincidência, a execução fria da 2ª rodada também mediu 223,6 ms. Os valores de uma rodada só não sustentam um "antes/depois" fino; para o #519 e o #520, medir com a contagem de consultas e repetir.
- **JIT:** na 1ª execução (fria) do `findLatestAggregatedForMeters` hora sem janela, 568 dos 827 ms da 1ª rodada foram de compilação JIT (inlining e otimização; a quente da mesma rodada mediu 702 ms). Na 2ª rodada, o par é conferível: 911,6 de 1.291 ms na fria e 208,4 de 1.048 ms na quente. A compilação é disparada pelo custo estimado alto da varredura. Com janela de 3 h ou 5 dias o custo cai abaixo do limiar e o JIT não entra; com janela de 1 mês ele entra (A6 e B4). A VPS também roda com `jit = on`.
- **`findMonthlyKwhForYears` (B-10):** `date_trunc('year', ...) = ANY(...)` não é sargável; a consulta lê as 518.400 linhas do medidor (172.800 por processo, em 2 workers mais o líder) e só então filtra pelo ano.

## 3. A VPS, 40 dias, linha estreita

Tempo de execução em ms (1ª execução / execução quente), 53.705 linhas por medidor.

| Consulta | Sem janela | Com janela |
|---|---|---|
| `findAggregated` hora | **1.355** / 85 | 0,6 / 0,6 (3 h) |
| `findAggregated` dia | 81,9 / 81,1 | 40,6 / 32,3 (5 dias) |
| `findAggregated` mês | 75,4 / 74,1 | 59,9 / 59,1 (1 mês) |
| `findLatestAggregatedForMeters` hora | **882** / 553 | 1,8 / 3,2 (3 h) |
| `findLatestAggregatedForMeters` mês | 504 / 439 | 355 / 308 (1 mês) |
| `findMonthlyKwhForYears` | 125,8 / 125,0 | — |

- **A 1ª execução sem janela custou 1,36 s** (cache frio de verdade); a quente, 85 ms. O Painel paga a frio sempre que o Postgres não tem a tabela em memória.
- Com 40 dias a tabela é pequena e o `findAggregated` sem janela usa `Bitmap Index Scan` do medidor (não varre a tabela), mas o `findLatestAggregatedForMeters` sem janela já faz `Parallel Seq Scan`. **O custo cresce com o histórico do medidor**: extrapolando linearmente de 40 para 365 dias (×9, estimativa, não medida), o `findAggregated` hora sem janela iria para ~0,8 s quente e a varredura de vários medidores para ~5 s. A janela de 3 h corta isso para menos de 1 ms em 1 medidor, em qualquer tamanho de tabela (1,8–3,2 ms na VPS para os 11 medidores).
- O plano com janela de 3 h usa `meter_readings_minuteStart_idx` na VPS, e o `Bitmap Index Scan` por medidor no local; nos dois, o custo é constante em relação ao tamanho da tabela.
- **O ganho da janela de dia depende do índice que o planner escolhe.** Na VPS, a janela de 5 dias (A4) não usa o índice composto por medidor: faz `Index Scan` em `meter_readings_minuteStart_idx` e filtra por `meterId`, descartando 72.010 linhas de outros medidores e tocando 34.356 buffers, mais do que as ~14 mil páginas da tabela inteira (111 MiB). Por isso o ganho é de só ~2,5× (81 → 32 ms); no local, com `meter_readings_meterId_minuteStart_key`, o mesmo caso mede 2,2 ms. Com 40 dias o planner escolheu o pior índice; com a tabela cheia, a escolha pode mudar, e o #518 deve medir de novo.

## 4. Expurgo de retenção (`DELETE ... WHERE "minuteStart" < limite`, dentro de transação com `ROLLBACK`)

Teto atual: `RETENTION_PURGE_STATEMENT_TIMEOUT_MS = 120000`.

Os três primeiros cenários vêm de um script à parte, com o limite como **literal**, porque o `deleteMany` do Prisma manda o limite como parâmetro e o Postgres planeja com o valor. No script principal, o D1 pôs o limite numa **subconsulta**: o planner usou a estimativa genérica de 1/3 da tabela e foi para `Seq Scan` (268 ms na 1ª rodada, 1,48 s na 2ª). Se o plano um dia virar genérico (cache de prepared statement, pooler), o expurgo diário vai de 136 ms para algo entre 0,3 e 1,5 s.

| Cenário | Linhas | Plano | Tempo |
|---|---|---|---|
| Um dia (o expurgo diário normal) | 15.840 | `Bitmap Index Scan` em `minuteStart_idx` | **136 ms** |
| Sete dias | 110.880 | `Bitmap Index Scan` | **1,1 s** |
| Trinta dias (expurgo represado) | 475.200 | `Seq Scan` | **47,0 s** |
| Tabela inteira (pior caso) | 5.702.400 | `Seq Scan` | **104,3 s** / 97,1 s (duas rodadas) |

- **O pior caso subiu de 48 s (31/08, linha estreita) para 97–104 s**, ~2,1×. A folga contra o teto de 120 s caiu de ~2,5× para **~1,15–1,24×**. O pior caso é a retenção ligada pela primeira vez sobre toda a tabela, ou um expurgo represado por muito tempo.
- **Um expurgo de 30 dias já gasta 39% do teto.** Com 8% da tabela (30 dias) o planner escolheu `Seq Scan`, e a varredura sujou e escreveu a tabela quase inteira (`dirtied=258.741`, `written=233.442` blocos); com 2% (7 dias) usou o índice. O tempo cresce com o represamento.
- O expurgo diário normal custa 136 ms com plano específico; o risco é o represamento.
- O `DELETE` não libera espaço para o sistema operacional: as páginas ficam livres para reúso depois do `VACUUM`. Isso importa para qualquer opção de retenção da ADR-0027.

## 5. Números do usuário demo (pendência do #534)

Medidos na VPS, só contagens:

| Conta | `audit_logs` | `refresh_tokens` | `auth_tokens` |
|---|---|---|---|
| `demo.residencial` | 24 | 3 | 3 |
| `demo.comercial` | 16 | 1 | 1 |

`audit_logs` inteira tem 82 linhas (168 kB). O acúmulo é desprezível: **o índice `(userId, createdAt)` e o expurgo do acumulado não têm urgência**.

## 6. O que ficou sem medir

- **Neon:** decisão do usuário. A estimativa do laudo (~57 dias de tempo acordado até encher 0,5 GB; o laudo não explicita as unidades) segue sem medição; com 8,6 MiB/dia do esquema novo, o crescimento de `meter_readings` sozinho passa de 512 MiB (0,5 GiB) em ~59 dias.
- **Logs do Render (aba esquecida com SSE aberto impedindo a hibernação do staging):** decisão do usuário de não verificar.
- **Plano na VPS com o esquema novo e 365 dias:** só depois da promoção e do acúmulo de histórico.
- **Taxa de crescimento por mais de 7 dias:** dispensada, porque o intervalo entre a primeira leitura e agora (40 dias) já dá a taxa.

## 7. Conclusões para os próximos itens

- **#518:** a janela ataca o maior custo medido (de ~200 ms e ~2 GiB lidos para menos de 1 ms na hora, 0,1 ms, e ~2 ms no dia; na VPS, com 40 dias, o dia mediu 32–41 ms, ver §3). Na conta do Grupo A e da Branca (mês corrente e anterior, 1 medidor), a janela de 1 mês mediu 196 → 16 ms; a de 2 meses deve ficar na ordem do dobro (não medida).
- **#519:** o `findMonthlyKwhForYears` (B-10) varre as 518.400 linhas do medidor hoje (~250 ms), o que o predicado sargável deve reduzir. O `findLatestAggregatedForMeters` mês com vários medidores continua a varrer a tabela mesmo com janela, o que importa para o #520.
- **#520:** o resumo com 50 alvos usa `findLatestAggregatedForMeters`; a janela de hora resolve (702–1.048 → ~0,8 ms), e a de mês reduziu 54–65% nas duas rodadas, porque a janela ainda cobre uma fração grande da tabela.
- **ADR-0027:** os números que decidem estão aqui (570 B/linha, 3,07 GiB/ano no esquema novo, índices a 35% do total, expurgo de pior caso a 80–87% do teto). A opção é decisão do usuário.

## Bloco de comandos para repetir a medição de tamanho na VPS

Somente leitura; devolve contagens, tamanhos e datas, nunca dado de usuário. Pelo host, via contêiner:

```bash
ssh <usuario>@<host-da-vps> 'df -h <volume-do-postgres>'

ssh <usuario>@<host-da-vps> \
  'sudo docker exec -i <contêiner-do-postgres> sh -c "psql -X -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\""' <<'SQL'
SET default_transaction_read_only = on;
SELECT version();
SELECT count(*) AS linhas, min("minuteStart") AS primeira, max("minuteStart") AS ultima,
       pg_size_pretty(pg_table_size('meter_readings'))          AS tabela,
       pg_size_pretty(pg_indexes_size('meter_readings'))        AS indices,
       pg_size_pretty(pg_total_relation_size('meter_readings')) AS total,
       pg_total_relation_size('meter_readings')                 AS total_bytes
FROM meter_readings;
SELECT round(avg(pg_column_size(m.*)), 1) AS bytes_medios_da_tupla,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'meter_readings') AS colunas
FROM meter_readings m TABLESAMPLE SYSTEM (1);
SELECT count(*) AS migracoes_aplicadas, max(migration_name) AS ultima
FROM _prisma_migrations WHERE finished_at IS NOT NULL;
SELECT pg_size_pretty(pg_database_size(current_database())) AS banco_inteiro;
SQL
```

Depois da promoção, repetir para registrar a largura real da linha no esquema novo e a taxa de crescimento com o volume de produção.
