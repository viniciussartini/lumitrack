import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest"
import { TariffFlagRepository } from "@/modules/tariff-flag/tariff-flag.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestTariffFlagConfig } from "@/shared/test/distributorFixture.js"

const tariffFlagRepository = new TariffFlagRepository(prismaTest)
const FIVE_MINUTES_MS = 5 * 60 * 1000

beforeEach(async () => {
    await cleanDatabase()
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

afterAll(async () => {
    await prismaTest.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: TariffFlagRepository — cache in-process com invalidação em update()
// ─────────────────────────────────────────────────────────────────────────────

describe("TariffFlagRepository — cache", () => {
    it("get() consulta o banco só na primeira chamada", async () => {
        await createTestTariffFlagConfig(prismaTest)
        const spy = vi.spyOn(prismaTest.tariffFlagConfig, "findUnique")

        const first = await tariffFlagRepository.get()
        const second = await tariffFlagRepository.get()

        expect(spy).toHaveBeenCalledTimes(1)
        expect(second).toEqual(first)
    })

    it("update() invalida o cache — a leitura seguinte reflete o novo valor sem reiniciar o processo", async () => {
        await createTestTariffFlagConfig(prismaTest)
        await tariffFlagRepository.get()

        const updated = await tariffFlagRepository.update({ currentFlag: "RED_P2" })
        const afterUpdate = await tariffFlagRepository.get()

        expect(updated.currentFlag).toBe("RED_P2")
        expect(afterUpdate?.currentFlag).toBe("RED_P2")
    })

    it("update() não bate no banco de novo em get() logo depois — a resposta do update já populou o cache", async () => {
        await createTestTariffFlagConfig(prismaTest)
        await tariffFlagRepository.update({ currentFlag: "YELLOW" })

        const spy = vi.spyOn(prismaTest.tariffFlagConfig, "findUnique")
        await tariffFlagRepository.get()

        expect(spy).not.toHaveBeenCalled()
    })

    // Backstop contra escrita fora da aplicação (ex.: prisma/seed.ts
    // reexecutado contra um processo já no ar) — sem TTL, essa bandeira
    // ficaria presa em cache até reiniciar o servidor.
    it("após o TTL expirar, get() consulta o banco de novo mesmo sem update()", async () => {
        await createTestTariffFlagConfig(prismaTest)
        vi.useFakeTimers()

        await tariffFlagRepository.get()
        vi.advanceTimersByTime(FIVE_MINUTES_MS + 1)
        const spy = vi.spyOn(prismaTest.tariffFlagConfig, "findUnique")
        await tariffFlagRepository.get()

        expect(spy).toHaveBeenCalledTimes(1)
    })
})
