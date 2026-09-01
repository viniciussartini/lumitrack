# Baseline de Desempenho — statement_timeout do pool (issue #289)

> Dimensiona `DB_POOL_STATEMENT_TIMEOUT_MS` (novo) medindo o pior caso legítimo do sistema — o `DELETE` represado do `RetentionPurgeScheduler` sobre `meter_readings` — em vez de escolher um valor arbitrário. Mesmo racional de proporcionalidade dos baselines anteriores da Fase 15 (#284/#285): metodologia primeiro, número depois.

## Por que `meter_readings` é o pior caso, não `audit_logs`/`alert_trigger_events`/`tariff_flag_history`

`RetentionService.purgeExpiredData()` roda 8 `deleteMany` em série a cada execução do `RetentionPurgeScheduler` (1x no boot + a cada 24h). De longe, a tabela de maior volume é `meter_readings` (1 linha/minuto/medidor — cadência de coleta), então é o `DELETE` que domina o tempo total do job e o candidato natural a estourar um `statement_timeout` mal dimensionado. As outras 7 tabelas (`audit_logs`, `alert_trigger_events`, `tariff_flag_history`, tokens/resets de auth) crescem ordens de grandeza mais devagar — não medidas aqui por não serem o gargalo.

## Metodologia

Banco descartável `lumitrack_perf_baseline` (mesmo banco/escala dos baselines de #284/#285 — recriado nesta sessão porque não persiste entre sessões), massa gerada via `scripts/generate-performance-baseline-data.ts --months=12 --meters=11`: **11 medidores × 12 meses × 1.440 leituras/dia = 5.702.400 linhas** — mesma cardinalidade do baseline de 2026-08-24, escolhida para representar o **pior caso legítimo real**: retenção ativada pela primeira vez sobre uma tabela histórica grande já existente, ou expurgo represado por uma indisponibilidade prolongada do scheduler (cenário citado na própria issue #289 como motivo de não estimar o timeout sem medir).

`EXPLAIN (ANALYZE, BUFFERS)` do `DELETE` que `MeterReadingRepository.deleteOlderThan` executa, com o threshold no futuro (`now() + interval '1 year'`) para capturar as **5.702.400 linhas inteiras** — o cenário mais adverso possível, mais adverso que qualquer expurgo real jamais seria (mesmo represado, nunca deleta 100% da tabela de uma vez, já que sempre sobra o que ainda está dentro do prazo de retenção). Rodado dentro de uma transação com `ROLLBACK` ao final — mede o custo real de planejar e executar o `DELETE` sem apagar a massa gerada.

**Diferença consciente em relação ao ambiente real:** hardware local, não o da VPS de produção — o tempo absoluto abaixo não transfere 1:1. Por isso a margem escolhida abaixo é generosa (não um múltiplo justo por cima do medido).

## Resultado

```
Delete on meter_readings (actual time=47958.360..47958.361 rows=0 loops=1)
  Buffers: shared hit=5.851.152 read=113.024 dirtied=132.618 written=95.873
  -> Seq Scan on meter_readings (actual time=13.421..1663.235 rows=5.702.400 loops=1)
        Filter: ("minuteStart" < (now() + '1 year'::interval))
Execution Time: 47.959,014 ms (≈ 48,0 s)
```

**Leitura:** o `Seq Scan` que localiza as linhas é rápido (1,66s) — o índice em `minuteStart` (usado pelo expurgo real, com threshold no passado) tornaria essa etapa ainda mais barata; aqui o planner prefere Seq Scan porque o filtro (`< now() + 1 ano`) captura literalmente 100% da tabela, e nesse caso o índice não ajudaria de verdade. O grosso do tempo (~46s dos ~48s) é o próprio `DELETE` — localizar e marcar 5,7M linhas como removidas, com I/O real (`dirtied=132.618`, `written=95.873` páginas). Esse é o custo que um expurgo represado pagaria na prática.

## Decisão de dimensionamento

**`DB_POOL_STATEMENT_TIMEOUT_MS=120000` (2 minutos)** — margem de **~2,5×** sobre o pior caso medido (48s), generosa o suficiente para absorver hardware de produção mais lento que o ambiente local de medição, sem abrir mão do propósito do controle (uma query realmente presa — lock, bug, plano ruim — ainda é cancelada em tempo finito, protegendo o pool de exaustão). Configurado via `env.ts` (`DB_POOL_STATEMENT_TIMEOUT_MS`, `.int().positive()`, mesmo padrão fail-closed de `DB_POOL_MAX`/`DB_POOL_CONNECTION_TIMEOUT_MS`/`DB_POOL_IDLE_TIMEOUT_MS`), nunca hardcoded — ajustável sem deploy de código se uma medição futura em produção pedir outro valor.

**Enforçado via `statement_timeout` do Postgres** (não `query_timeout` do driver `pg`): o corte acontece no servidor, então sobrevive mesmo que o processo Node trave em outra coisa antes de conseguir cancelar a query — mais forte que um timeout só do lado do cliente.

Este timeout de 120s se aplica a **toda** conexão do pool, não só ao expurgo — cobre igualmente o cenário citado em `11-seguranca-infraestrutura.md` (exaustão de conexões como DoS barato): qualquer query presa em qualquer rota agora libera a conexão em no máximo 2 minutos, em vez de segurá-la indefinidamente.
