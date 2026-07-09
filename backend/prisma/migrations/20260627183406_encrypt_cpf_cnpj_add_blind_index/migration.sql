-- DropIndex
DROP INDEX "users_cnpj_key";

-- DropIndex
DROP INDEX "users_cpf_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cnpjBlindIndex" TEXT,
ADD COLUMN     "cpfBlindIndex" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_cpfBlindIndex_key" ON "users"("cpfBlindIndex");

-- CreateIndex
CREATE UNIQUE INDEX "users_cnpjBlindIndex_key" ON "users"("cnpjBlindIndex");
