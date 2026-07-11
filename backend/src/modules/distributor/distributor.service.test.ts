import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { DistributorService } from "@/modules/distributor/distributor.service.js"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

// ─── Instâncias ───────────────────────────────────────────────────────────────

const distributorRepository = new DistributorRepository(prismaTest)
const distributorService = new DistributorService(distributorRepository)

// ─── Setup e Teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await cleanDatabase()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: DistributorService — catálogo global somente leitura (Fase 3.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("DistributorService", () => {
    describe("findById", () => {
        it("deve retornar a distribuidora do catálogo com campos numéricos", async () => {
            const dist = await createTestDistributor(prismaTest, {
                name: "CEMIG Distribuição S.A.",
                tusdPerKwh: 0.3,
                tePerKwh: 0.3,
                icmsRate: 0.18,
            })

            const found = await distributorService.findById(dist.id)

            expect(found.id).toBe(dist.id)
            expect(found.name).toBe("CEMIG Distribuição S.A.")
            expect(typeof found.tusdPerKwh).toBe("number")
            expect(found.tusdPerKwh).toBe(0.3)
            expect(found.tePerKwh).toBe(0.3)
            expect(found.icmsRate).toBe(0.18)
        })

        it("deve lançar NotFoundError para ID inexistente", async () => {
            await expect(
                distributorService.findById("00000000-0000-0000-0000-000000000000"),
            ).rejects.toThrow(NotFoundError)
        })
    })

    describe("findAll", () => {
        it("deve retornar lista vazia quando não há distribuidoras no catálogo", async () => {
            const result = await distributorService.findAll({})
            expect(result.items).toEqual([])
            expect(result.total).toBe(0)
        })

        it("deve retornar distribuidoras ordenadas por nome", async () => {
            await createTestDistributor(prismaTest, { name: "CPFL Energia" })
            await createTestDistributor(prismaTest, { name: "Enel São Paulo" })
            await createTestDistributor(prismaTest, { name: "CEMIG" })

            const result = await distributorService.findAll({})

            expect(result.items[0]?.name).toBe("CEMIG")
            expect(result.items[1]?.name).toBe("CPFL Energia")
            expect(result.items[2]?.name).toBe("Enel São Paulo")
        })

        it("deve paginar respeitando page e pageSize", async () => {
            for (let i = 0; i < 5; i++) {
                await createTestDistributor(prismaTest, { name: `Distribuidora ${i}` })
            }

            const result = await distributorService.findAll({ page: 2, pageSize: 2 })

            expect(result.items).toHaveLength(2)
            expect(result.total).toBe(5)
            expect(result.page).toBe(2)
            expect(result.pageSize).toBe(2)
        })

        it("deve lançar ValidationError para pageSize acima do teto (31)", async () => {
            await expect(distributorService.findAll({ pageSize: 32 })).rejects.toThrow(ValidationError)
        })
    })
})
