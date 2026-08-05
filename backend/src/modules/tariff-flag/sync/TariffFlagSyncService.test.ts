import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { TariffFlagSyncService } from "@/modules/tariff-flag/sync/TariffFlagSyncService.js"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { TariffFlagHistoryRepository } from "@/modules/tariff-flag/tariff-flag-history.repository.js"
import type { ITariffFlagSource, TariffFlagSnapshot } from "@/modules/tariff-flag/sync/ITariffFlagSource.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"

const tariffFlagRepository = new TariffFlagRepository(prismaTest)
const tariffFlagHistoryRepository = new TariffFlagHistoryRepository(prismaTest)

class FakeSource implements ITariffFlagSource {
    constructor(private readonly result: TariffFlagSnapshot | (() => Promise<TariffFlagSnapshot>)) {}

    async fetchCurrent(): Promise<TariffFlagSnapshot> {
        if (typeof this.result === "function") return this.result()
        return this.result
    }
}

const failingSource: ITariffFlagSource = {
    fetchCurrent: () => Promise.reject(new Error("fonte indisponível")),
}

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

describe("TariffFlagSyncService.syncOnce", () => {
    it("atualiza o config e grava histórico quando a bandeira mudou", async () => {
        await seedConfig()
        const source = new FakeSource({
            flag: "YELLOW",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        })
        const service = new TariffFlagSyncService(source, tariffFlagRepository, tariffFlagHistoryRepository)

        await service.syncOnce()

        const updated = await tariffFlagRepository.get()
        expect(updated?.currentFlag).toBe("YELLOW")

        const history = await prismaTest.tariffFlagHistory.findMany()
        expect(history).toHaveLength(1)
        expect(history[0]).toMatchObject({
            previousFlag: "GREEN",
            newFlag: "YELLOW",
            source: "AUTO",
            changedByUserId: null,
        })
    })

    it("mantém o config intocado e não grava histórico quando a fonte falha", async () => {
        await seedConfig()
        const service = new TariffFlagSyncService(failingSource, tariffFlagRepository, tariffFlagHistoryRepository)

        await service.syncOnce()

        const config = await tariffFlagRepository.get()
        expect(config?.currentFlag).toBe("GREEN")
        expect(config?.yellowPer100Kwh).toBe(1.885)

        const history = await prismaTest.tariffFlagHistory.findMany()
        expect(history).toHaveLength(0)
    })

    it("não grava histórico quando a fonte devolve os mesmos valores já vigentes", async () => {
        await seedConfig()
        const source = new FakeSource({
            flag: "GREEN",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        })
        const service = new TariffFlagSyncService(source, tariffFlagRepository, tariffFlagHistoryRepository)

        await service.syncOnce()

        const history = await prismaTest.tariffFlagHistory.findMany()
        expect(history).toHaveLength(0)
    })

    it("não lança quando o singleton de configuração não existe", async () => {
        const source = new FakeSource({
            flag: "GREEN",
            greenPer100Kwh: 0,
            yellowPer100Kwh: 1.885,
            redP1Per100Kwh: 4.463,
            redP2Per100Kwh: 7.877,
        })
        const service = new TariffFlagSyncService(source, tariffFlagRepository, tariffFlagHistoryRepository)

        await expect(service.syncOnce()).resolves.toBeUndefined()
    })
})
