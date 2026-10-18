-- CreateEnum
CREATE TYPE "goal_unit" AS ENUM ('KWH', 'BRL');

-- A coluna deixa de carregar a unidade no nome: o alvo é em kWh ou em reais,
-- conforme a meta. RENAME preserva os valores já gravados (todos em kWh).
ALTER TABLE "goals" RENAME COLUMN "monthlyKwh" TO "monthlyTargets";

-- AlterTable: as metas existentes são de consumo.
ALTER TABLE "goals" ADD COLUMN "unit" "goal_unit" NOT NULL DEFAULT 'KWH';

-- A unidade passa a fazer parte da identidade da meta.
DROP INDEX "goals_propertyId_year_key";

-- CreateIndex
CREATE UNIQUE INDEX "goals_propertyId_year_unit_key" ON "goals"("propertyId", "year", "unit");
