-- Papel de runtime da aplicação, com privilégio mínimo (defesa em
-- profundidade, OWASP A04): sem CREATE, sem DROP, sem ownership de tabela.
-- O usuário administrativo (POSTGRES_USER no compose, o usuário do projeto
-- no Neon) continua sendo o único usado para migração — nunca o runtime.
--
-- Idempotente: pode rodar mais de uma vez sem erro.
--
-- Uso:
--   - Docker Compose / VPS: montado em /docker-entrypoint-initdb.d/, roda
--     sozinho no primeiro boot do container postgres (lê a senha de
--     LUMITRACK_APP_PASSWORD, vinda de deploy/.env via env_file).
--   - Neon: rodar manualmente, uma vez, com a connection string
--     administrativa —
--       LUMITRACK_APP_PASSWORD='<senha-nova>' \
--         psql '<connection-string-administrativa-do-neon>' -f deploy/create-app-role.sql

\getenv lumitrack_app_password LUMITRACK_APP_PASSWORD
\if :{?lumitrack_app_password}
\else
    \echo 'ERRO: variável de ambiente LUMITRACK_APP_PASSWORD não definida — abortando sem criar a role.'
    \quit 1
\endif

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lumitrack_app') THEN
        CREATE ROLE lumitrack_app LOGIN;
    END IF;
END
$$;

ALTER ROLE lumitrack_app WITH PASSWORD :'lumitrack_app_password';

GRANT USAGE ON SCHEMA public TO lumitrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lumitrack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lumitrack_app;

-- Aplica automaticamente às tabelas/sequências que uma migração futura
-- criar, sem precisar reexecutar este script depois de cada deploy — os
-- privilégios default são do papel que está criando o objeto (quem roda
-- `prisma migrate deploy`, sempre o usuário administrativo).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lumitrack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO lumitrack_app;

REVOKE CREATE ON SCHEMA public FROM lumitrack_app;
