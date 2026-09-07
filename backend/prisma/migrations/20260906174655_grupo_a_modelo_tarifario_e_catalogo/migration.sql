-- CreateEnum
CREATE TYPE "tariff_group" AS ENUM ('GROUP_A', 'GROUP_B');

-- CreateEnum
CREATE TYPE "tariff_subgroup" AS ENUM ('A1', 'A2', 'A3', 'A3A', 'A4', 'AS');

-- CreateEnum
CREATE TYPE "tariff_modality" AS ENUM ('CONVENTIONAL_BINOMIAL', 'GREEN', 'BLUE');

-- CreateEnum
CREATE TYPE "tariff_post" AS ENUM ('PEAK', 'OFF_PEAK');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "tariffGroup" "tariff_group" NOT NULL DEFAULT 'GROUP_B',
ADD COLUMN     "tariffModality" "tariff_modality",
ADD COLUMN     "tariffSubgroup" "tariff_subgroup",
ALTER COLUMN "billingClass" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tariff_energy_rates" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "subgroup" "tariff_subgroup" NOT NULL,
    "modality" "tariff_modality" NOT NULL,
    "post" "tariff_post" NOT NULL,
    "tusdPerKwh" DECIMAL(10,6) NOT NULL,
    "tePerKwh" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_energy_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_demand_rates" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "subgroup" "tariff_subgroup" NOT NULL,
    "modality" "tariff_modality" NOT NULL,
    "post" "tariff_post",
    "tusdPerKw" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_demand_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tariff_energy_rates_distributorId_subgroup_modality_post_key" ON "tariff_energy_rates"("distributorId", "subgroup", "modality", "post");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_demand_rates_distributorId_subgroup_modality_post_key" ON "tariff_demand_rates"("distributorId", "subgroup", "modality", "post");

-- AddForeignKey
ALTER TABLE "tariff_energy_rates" ADD CONSTRAINT "tariff_energy_rates_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "energy_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_demand_rates" ADD CONSTRAINT "tariff_demand_rates_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "energy_distributors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
