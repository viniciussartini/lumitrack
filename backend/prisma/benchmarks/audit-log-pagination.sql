-- Plano de execução da listagem paginada do audit log (AuditRepository.findMany):
--   ORDER BY "createdAt" DESC, id DESC LIMIT n OFFSET m
-- com o índice atual (@@index([createdAt])) e com um índice composto
-- ("createdAt", id) — para decidir com números se o composto se justifica.
--
-- Uso, contra um banco DESCARTÁVEL (o de teste, nunca o de produção):
--   psql "${DATABASE_TEST_URL%%\?*}" -f backend/prisma/benchmarks/audit-log-pagination.sql
-- (a expansão remove o "?schema=public" da URL do Prisma, que o psql rejeita)
--
-- É seguro por construção: tudo roda numa tabela TEMPORÁRIA copiada de
-- audit_logs (estrutura e índices), que some ao fim da sessão. Nenhuma linha
-- nem índice de audit_logs é criado, alterado ou apagado.
--
-- Dados sintéticos: 500 mil linhas, ~30% delas em rajadas de 20 linhas com o
-- MESMO createdAt (o pior caso para o desempate por id) e o restante espalhado
-- por 90 dias. Repita com o volume real antes de decidir.

\set ON_ERROR_STOP on
\timing off

CREATE TEMP TABLE audit_bench (LIKE audit_logs INCLUDING DEFAULTS INCLUDING INDEXES);

INSERT INTO audit_bench (id, action, outcome, "createdAt", "resourceType")
SELECT gen_random_uuid()::text,
       (enum_range(NULL::audit_action))[1 + (g % 3)],
       (enum_range(NULL::audit_outcome))[1 + (g % 2)],
       CASE WHEN g % 10 < 3
            THEN date_trunc('milliseconds', now() - ((g / 20) * interval '17 seconds'))
            ELSE now() - (random() * interval '90 days')
       END,
       CASE WHEN g % 50 = 0 THEN 'Property' END
FROM generate_series(1, 500000) AS g;

ANALYZE audit_bench;

\echo
\echo '================ ANTES: só o índice em createdAt ================'
\di+ audit_bench*

\echo '## página 1, sem filtro'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## OFFSET 30000'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 30000;
\echo '## OFFSET 400000'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 400000;
\echo '## janela dos últimos 7 dias, página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE "createdAt" >= now() - interval '7 days' ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## filtro action (33%), página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE action = (enum_range(NULL::audit_action))[1] ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## filtro resourceType (2%), página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE "resourceType" = 'Property' ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;

\timing on
CREATE INDEX audit_bench_created_id_idx ON audit_bench ("createdAt", id);
\timing off
ANALYZE audit_bench;

\echo
\echo '================ DEPOIS: + índice (createdAt, id) ================'
\di+ audit_bench*

\echo '## página 1, sem filtro'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## OFFSET 30000'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 30000;
\echo '## OFFSET 400000'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 400000;
\echo '## janela dos últimos 7 dias, página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE "createdAt" >= now() - interval '7 days' ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## filtro action (33%), página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE action = (enum_range(NULL::audit_action))[1] ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
\echo '## filtro resourceType (2%), página 1'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_bench WHERE "resourceType" = 'Property' ORDER BY "createdAt" DESC, id DESC LIMIT 10 OFFSET 0;
