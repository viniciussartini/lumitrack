/*
  Warnings:

  - You are about to alter the column `kwhPrice` on the `energy_distributors` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,6)`.
  - You are about to alter the column `taxRate` on the `energy_distributors` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,4)`.
  - You are about to alter the column `publicLightingFee` on the `energy_distributors` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[userId,cnpj]` on the table `energy_distributors` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "energy_distributors" ALTER COLUMN "kwhPrice" SET DATA TYPE DECIMAL(10,6),
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(5,4),
ALTER COLUMN "publicLightingFee" SET DATA TYPE DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "energy_distributors_userId_cnpj_key" ON "energy_distributors"("userId", "cnpj");
