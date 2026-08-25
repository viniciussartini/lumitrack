import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest"
import { DistributorRepository } from "@/modules/distributor/distributor.repository.js"
import { prismaTest } from "@/shared/test/prisma-test.js"
import { cleanDatabase } from "@/shared/test/clean-database.js"
import { createTestDistributor } from "@/shared/test/distributorFixture.js"

const distributorRepository = new DistributorRepository(prismaTest)
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
// SUITE: DistributorRepository — cache in-process por TTL em findById()
// ─────────────────────────────────────────────────────────────────────────────

describe("DistributorRepository — cache", () => {
    it("findById() dentro do TTL não consulta o banco de novo", async () => {
        const dist = await createTestDistributor(prismaTest)
        vi.useFakeTimers()

        await distributorRepository.findById(dist.id)
        const spy = vi.spyOn(prismaTest.energyDistributor, "findUnique")
        vi.advanceTimersByTime(FIVE_MINUTES_MS - 1)
        const cached = await distributorRepository.findById(dist.id)

        expect(spy).not.toHaveBeenCalled()
        expect(cached?.id).toBe(dist.id)
    })

    it("findById() após o TTL expirar consulta o banco de novo", async () => {
        const dist = await createTestDistributor(prismaTest)
        vi.useFakeTimers()

        await distributorRepository.findById(dist.id)
        vi.advanceTimersByTime(FIVE_MINUTES_MS + 1)
        const spy = vi.spyOn(prismaTest.energyDistributor, "findUnique")
        const refreshed = await distributorRepository.findById(dist.id)

        expect(spy).toHaveBeenCalledTimes(1)
        expect(refreshed?.id).toBe(dist.id)
    })

    it("findById() para ID inexistente não fica em cache permanentemente como miss", async () => {
        const missingId = "00000000-0000-0000-0000-000000000000"

        const first = await distributorRepository.findById(missingId)
        const second = await distributorRepository.findById(missingId)

        expect(first).toBeNull()
        expect(second).toBeNull()
    })
})
