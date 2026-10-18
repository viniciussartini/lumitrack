-- O Postgres trata cada NULL como distinto em índice único — o `@@unique`
-- do Prisma sobre (distributorId, subgroup, modality, post) não impede duas
-- linhas de demanda única (post NULL, Horária Verde) para a mesma
-- distribuidora/subgrupo/modalidade. Até aqui isso era mitigado só por
-- convenção (único gravador é o seed idempotente). Este índice parcial fecha
-- a lacuna em banco: linhas com post preenchido (Azul, Fase 20) continuam
-- cobertas pelo `@@unique` normal.
CREATE UNIQUE INDEX "tariff_demand_rates_single_demand_key"
    ON "tariff_demand_rates"("distributorId", "subgroup", "modality")
    WHERE "post" IS NULL;
