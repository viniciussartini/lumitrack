-- Sessões ativas: liga o JWT de acesso ao refresh token por um id de sessão e
-- guarda, por token, só o rótulo reduzido do dispositivo e o IP mascarado.
-- O default é temporário: dá um id próprio às linhas já existentes (que ficam
-- sem dispositivo nem origem) e sai logo em seguida, porque o id novo é gerado
-- pela aplicação.
ALTER TABLE "auth_tokens"
    ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "deviceLabel" TEXT,
    ADD COLUMN "origin" TEXT;
ALTER TABLE "auth_tokens" ALTER COLUMN "sessionId" DROP DEFAULT;

ALTER TABLE "refresh_tokens"
    ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "deviceLabel" TEXT,
    ADD COLUMN "origin" TEXT;
ALTER TABLE "refresh_tokens" ALTER COLUMN "sessionId" DROP DEFAULT;
