# Baseline de Desempenho — Fase 15 (itens avulsos #284/#285)

> Últimos dois itens da Fase 15 (P2, "só com número na mão" — laudo de 2026-08-22 §7), sem épico próprio. Consolida a medição antes/depois de cada um, seguindo o mesmo padrão dos baselines anteriores da fase: metodologia primeiro, número depois.

## #284 — countBuckets via COUNT(*) OVER()

**Metodologia:** massa sintética gerada num banco descartável (`lumitrack_perf_baseline`), 11 medidores × 2 meses × 1.440 leituras/dia = 950.400 linhas (mesmo perfil da demo, escala menor que o baseline de 12 meses de #276 só para economizar tempo de geração — a comparação é sobre o **formato do plano**, não sobre um volume específico). `EXPLAIN (ANALYZE, BUFFERS)` do par antigo (`findAggregated` + `countBuckets`, 2 queries) contra a nova query única (`COUNT(*) OVER()`), mesmo medidor, mesma janela (`granularity=hour`, primeira página de 30).

**Antes (2 queries):**

| Query | Tempo | Buffers (hit+read) |
|---|---|---|
| `findAggregated` (`Parallel Seq Scan`) | 94,7 ms | 3.853 + 18.324 = 22.177 |
| `countBuckets` (`Index Only Scan`) | 29,6 ms | 3 + 717 = 720 |
| **Total** | **124,3 ms** | **22.897** |

**Depois (1 query, `COUNT(*) OVER()`):**

| Query | Tempo | Buffers (hit+read) |
|---|---|---|
| `findAggregated` unificada (`Bitmap Heap Scan` + `WindowAgg`) | 36,2 ms | 719 + 2.010 = 2.729 |

**Resultado: ~3,4× mais rápido (124,3 ms → 36,2 ms), ~8,4× menos buffer tocado (22.897 → 2.729).** Não é YAGNI — o ganho não vem só de eliminar a segunda varredura: ao unificar as duas queries, o planner trocou o `Parallel Seq Scan` (que `findAggregated` escolhia sozinha) por um `Bitmap Heap Scan` usando o índice único `meter_readings_meterId_minuteStart_key`, a mesma estratégia mais barata que `countBuckets` já usava isoladamente — a query combinada herda o plano bom das duas, não faz a média dos dois.

**Achado corrigido durante a implementação, não hipotético:** `COUNT(*) OVER()` não tem linha para "pendurar" o total quando `LIMIT`/`OFFSET` zera o resultado (página fora do intervalo — ex.: pedir a página 5 de um total de 2). Sem tratamento, isso reportaria `total: 0` mesmo havendo dado, quebrando a paginação do cliente silenciosamente. Corrigido com fallback: só quando a query devolve 0 linhas, uma chamada extra a `countBuckets` (mantida como método, agora só usada nesse caminho raro) resolve o total corretamente. Teste de regressão prova que o fallback funciona e que sem ele o total ficaria errado (verificado revertendo o fallback e observando o teste falhar antes de restaurá-lo).

## #285 — Pool de conexões explícito

**Metodologia:** backend de desenvolvimento e o `iot-simulator` (`DEMO_BOOTSTRAP_ENABLED=true`, mesmos 11 devices/tópicos MQTT do seed de demonstração) rodando simultaneamente contra o Postgres local, `LOG_LEVEL=debug` — o mesmo cenário de concorrência real que a issue cita como evidência: API + worker IoT + `MinuteRollupScheduler`/`RetentionPurgeScheduler` competindo pelo mesmo pool. `pool.totalCount`/`idleCount`/`waitingCount` já são logados após cada flush do `MinuteRollupScheduler` desde o épico #275 — sem instrumentação nova a construir aqui, só rodar e ler.

**4 flushes consecutivos observados (11 baldes cada, ~1 min de intervalo):**

| Flush | totalCount | idleCount | waitingCount |
|---|---|---|---|
| 1 | 10 | 10 | 0 |
| 2 | 10 | 10 | 0 |
| 3 | 10 | 10 | 0 |
| 4 | 10 | 10 | 0 |

**Leitura:** o pool se estabiliza em 10 conexões — exatamente o `max` implícito default do driver `pg` (nunca configurado explicitamente até aqui) — e nunca satura (`waitingCount: 0` em toda amostra): a demanda observada (11 escritas MQTT concorrentes + 1 flush do scheduler) nunca excedeu 10 conexões simultâneas nem formou fila. **Limitação reconhecida:** esta é carga de 1 processo local com 11 medidores sintéticos, não concorrência real de múltiplos usuários simultâneos em produção — o número documenta o piso observável nesta sessão, não um teto absoluto.

**Decisão de dimensionamento:** `max=10` explícito (documenta o que já era o comportamento real, em vez de depender do default implícito do driver — critério de aceite da issue); `connectionTimeoutMillis=5000` (o default do `pg` é `0`, espera indefinidamente por uma conexão livre — sob saturação real isso trava a requisição em vez de falhar visivelmente; 5 s falha fechado e cedo, coerente com o resto do projeto); `idleTimeoutMillis=30000` (o default do `pg` é 10 s — curto demais frente ao ciclo de 60 s do `MinuteRollupScheduler`/`RetentionPurgeScheduler`, que reconectaria a cada execução; 30 s mantém a conexão viva entre execuções consecutivas sem ficar indefinidamente aberta). Todos os três vêm de `env.ts`, nunca hardcoded — dimensionáveis de novo se uma medição futura em produção mostrar necessidade diferente.
