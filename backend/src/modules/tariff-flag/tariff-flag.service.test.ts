import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { TariffFlagService } from "@/modules/tariff-flag/tariff-flag.service.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { NotFoundError, ValidationError } from "@/shared/errors/AppError.js"

const tariffFlagRepository = new TariffFlagRepository(prismaTest)
const tariffFlagService = new TariffFlagService(tariffFlagRepository)

async function seedConfig() {
    return prismaTest.tariffFlagConfig.create({
        data: {
            id: 1,
            currentFlag: "GREEN",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        },
    })
}

beforeEach(async () => { await cleanDatabase() })
afterAll(async () => { await prismaTest.$disconnect() })

describe("TariffFlagService", () => {
    describe("get", () => {
        it("retorna a configuração vigente", async () => {
            await seedConfig()

            const config = await tariffFlagService.get()

            expect(config.currentFlag).toBe("GREEN")
            expect(config.yellowPer100Kwh).toBe(1.885)
        })

        it("lança NotFoundError quando o singleton não existe", async () => {
            await expect(tariffFlagService.get()).rejects.toThrow(NotFoundError)
        })
    })

    describe("update", () => {
        it("atualiza a bandeira vigente", async () => {
            await seedConfig()

            const updated = await tariffFlagService.update({ currentFlag: "YELLOW" })

            expect(updated.currentFlag).toBe("YELLOW")
        })

        it("atualiza parcialmente os valores por bandeira sem afetar os demais", async () => {
            await seedConfig()

            const updated = await tariffFlagService.update({ redP2Per100Kwh: 9.5 })

            expect(updated.redP2Per100Kwh).toBe(9.5)
            expect(updated.greenPer100Kwh).toBe(0)
        })

        it("lança ValidationError para valor negativo", async () => {
            await seedConfig()

            await expect(
                tariffFlagService.update({ greenPer100Kwh: -1 }),
            ).rejects.toThrow(ValidationError)
        })

        it("lança ValidationError para bandeira inválida", async () => {
            await seedConfig()

            await expect(
                tariffFlagService.update({ currentFlag: "PURPLE" }),
            ).rejects.toThrow(ValidationError)
        })
    })
})
