-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "groupBModality" DROP DEFAULT,
ALTER COLUMN "receivesBillingDiscount" DROP DEFAULT;

-- A migração anterior (20260915235256) adicionou groupBModality/
-- receivesBillingDiscount com DEFAULT de coluna, que o Postgres aplica em
-- todas as linhas já existentes num ADD COLUMN — inclusive propriedades do
-- Grupo A, que devem ficar nulas nesses dois campos (só o Grupo B usa
-- modalidade/desconto de faturamento). Corrige o dado que já foi
-- backfillado incorretamente antes do DROP DEFAULT acima produzir efeito.
UPDATE "properties"
SET "groupBModality" = NULL, "receivesBillingDiscount" = NULL
WHERE "tariffGroup" = 'GROUP_A';
