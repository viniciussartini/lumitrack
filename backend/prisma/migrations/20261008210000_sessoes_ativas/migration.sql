-- Sessões ativas: liga o JWT de acesso ao refresh token por um id de sessão e
-- guarda, por token, só o rótulo reduzido do dispositivo e o IP mascarado.
-- O default do id de sessão fica no banco, de propósito: a versão anterior da
-- aplicação não conhece a coluna e continua inserindo tokens (no deploy, entre a
-- migração e a troca do container, e num rollback só da aplicação). A versão
-- nova sempre informa o id; o default atende a anterior e dá um id próprio às
-- linhas existentes, que ficam sem dispositivo nem origem.
ALTER TABLE "auth_tokens"
    ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "deviceLabel" TEXT,
    ADD COLUMN "origin" TEXT;

ALTER TABLE "refresh_tokens"
    ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "deviceLabel" TEXT,
    ADD COLUMN "origin" TEXT;
