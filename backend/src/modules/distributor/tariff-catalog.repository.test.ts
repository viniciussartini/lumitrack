import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { TariffCatalogRepository } from "@/modules/distributor/tariff-catalog.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const tariffCatalogRepository = new TariffCatalogRepository(prismaTest)

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

describe("TariffCatalogRepository", () => {
    describe("findEnergyRates", () => {
        it("devolve as tarifas de energia por posto de uma combinação distribuidora/subgrupo/modalidade", async () => {
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

            const rates = await tariffCatalogRepository.findEnergyRates(
                distributor.id,
                "A4",
                "GREEN",
            )

            expect(rates).toHaveLength(2)
            expect(rates.find((r) => r.post === "PEAK")).toEqual({
                post: "PEAK",
                tusdPerKwh: 0.75,
                tePerKwh: 0.55,
            })
            expect(rates.find((r) => r.post === "OFF_PEAK")).toEqual({
                post: "OFF_PEAK",
                tusdPerKwh: 0.12,
                tePerKwh: 0.28,
            })
        })

        it("devolve lista vazia quando a combinação não tem tarifa cadastrada", async () => {
            const distributor = await createTestDistributor(prismaTest)

            const rates = await tariffCatalogRepository.findEnergyRates(
                distributor.id,
                "A4",
                "GREEN",
            )

            expect(rates).toEqual([])
        })

        it("serve do cache dentro do TTL — não reflete uma tarifa criada depois da primeira leitura", async () => {
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

            const firstRead = await tariffCatalogRepository.findEnergyRates(
                distributor.id,
                "A4",
                "GREEN",
            )
            expect(firstRead).toHaveLength(1)

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

            const secondRead = await tariffCatalogRepository.findEnergyRates(
                distributor.id,
                "A4",
                "GREEN",
            )
            expect(secondRead).toHaveLength(1) // ainda o cache da primeira leitura
        })
    })

    describe("findSingleDemandRate", () => {
        it("devolve a tarifa de demanda única (post nulo) — Horária Verde", async () => {
            const distributor = await createTestDistributor(prismaTest)
            await prismaTest.tariffDemandRate.create({
                data: {
                    distributorId: distributor.id,
                    subgroup: "A4",
                    modality: "GREEN",
                    post: null,
                    tusdPerKw: 18.0,
                },
            })

            const rate = await tariffCatalogRepository.findSingleDemandRate(
                distributor.id,
                "A4",
                "GREEN",
            )

            expect(rate).toEqual({ tusdPerKw: 18 })
        })

        it("devolve null quando não há tarifa de demanda única cadastrada", async () => {
            const distributor = await createTestDistributor(prismaTest)

            const rate = await tariffCatalogRepository.findSingleDemandRate(
                distributor.id,
                "A4",
                "GREEN",
            )

            expect(rate).toBeNull()
        })

        it("ignora tarifas de demanda por posto (Azul) — só considera a de post nulo", async () => {
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

            const rate = await tariffCatalogRepository.findSingleDemandRate(
                distributor.id,
                "A4",
                "BLUE",
            )

            expect(rate).toBeNull()
        })
    })
})
