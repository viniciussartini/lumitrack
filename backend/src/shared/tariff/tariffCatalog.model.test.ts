import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

// Cobre o modelo de dados novo da Fase 19 (ADR-0019/RF26): TariffEnergyRate
// e TariffDemandRate, catálogo do Grupo A por distribuidora × subgrupo ×
// modalidade × posto. Não há repository/service para estas tabelas ainda
// (chega no item "Tarifação binômia Horária Verde", #383) — este teste
// valida o schema/migração em si, o artefato novo e arriscado desta issue.

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("Catálogo tarifário Grupo A (TariffEnergyRate/TariffDemandRate)", () => {
    describe("TariffEnergyRate", () => {
        it("persiste e lê uma tarifa de energia por posto", async () => {
            const distributor = await createTestDistributor(prismaTest)

            const created = await prismaTest.tariffEnergyRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: "PEAK",
                    tusdPerKwh: 0.75,
                    tePerKwh: 0.55,
                },
            })

            expect(created.tusdPerKwh.toNumber()).toBe(0.75)
            expect(created.tePerKwh.toNumber()).toBe(0.55)
        })

        it("rejeita uma segunda tarifa para a mesma distribuidora/subgrupo/modalidade/posto", async () => {
            const distributor = await createTestDistributor(prismaTest)
            const rate = {
                distributorId: distributor.id,
                subgroup: "A4" as const,
                modality: "GREEN" as const,
                post: "PEAK" as const,
                tusdPerKwh: 0.75,
                tePerKwh: 0.55,
            }

            await prismaTest.tariffEnergyRate.create({ data: rate })

            await expect(prismaTest.tariffEnergyRate.create({ data: rate })).rejects.toThrow()
        })

        it("permite postos diferentes para a mesma distribuidora/subgrupo/modalidade (Ponta e Fora de Ponta)", async () => {
            const distributor = await createTestDistributor(prismaTest)

            await prismaTest.tariffEnergyRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: "PEAK",
                    tusdPerKwh: 0.75,
                    tePerKwh: 0.55,
                },
            })
            await prismaTest.tariffEnergyRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: "OFF_PEAK",
                    tusdPerKwh: 0.12,
                    tePerKwh: 0.28,
                },
            })

            const rates = await prismaTest.tariffEnergyRate.findMany({
                where: { distributorId: distributor.id },
            })
            expect(rates).toHaveLength(2)
        })
    })

    describe("TariffDemandRate", () => {
        it("persiste demanda única (post nulo) — Horária Verde, RN18", async () => {
            const distributor = await createTestDistributor(prismaTest)

            const created = await prismaTest.tariffDemandRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: null,
                    tusdPerKw: 18.0,
                },
            })

            expect(created.post).toBeNull()
            expect(created.tusdPerKw.toNumber()).toBe(18)
        })

        it("permite demanda por posto (Ponta e Fora de Ponta) — Horária Azul, RN18", async () => {
            const distributor = await createTestDistributor(prismaTest)

            await prismaTest.tariffDemandRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "BLUE",
                    post: "PEAK",
                    tusdPerKw: 45.0,
                },
            })
            await prismaTest.tariffDemandRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "BLUE",
                    post: "OFF_PEAK",
                    tusdPerKw: 15.0,
                },
            })

            const rates = await prismaTest.tariffDemandRate.findMany({
                where: { distributorId: distributor.id, modality: "BLUE" },
                orderBy: { tusdPerKw: "desc" },
            })
            expect(rates).toHaveLength(2)
            expect(rates[0]?.post).toBe("PEAK")
            expect(rates[1]?.post).toBe("OFF_PEAK")
        })

        it("rejeita uma segunda tarifa para o mesmo posto preenchido (Azul)", async () => {
            const distributor = await createTestDistributor(prismaTest)
            const rate = {
                distributorId: distributor.id,
                subgroup: "A4" as const,
                modality: "BLUE" as const,
                post: "PEAK" as const,
                tusdPerKw: 45.0,
            }

            await prismaTest.tariffDemandRate.create({ data: rate })

            await expect(prismaTest.tariffDemandRate.create({ data: rate })).rejects.toThrow()
        })
    })
})
