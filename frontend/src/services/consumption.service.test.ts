import { describe, it, expect, beforeEach, vi } from "vitest"
import { consumptionService } from "@/services/consumption.service"
import { api } from "@/services/api"
import type { ConsumptionBucket } from "@/types/consumption.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockBucket: ConsumptionBucket = {
    bucketStart: "2025-01-15T00:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    avgPowerW: 520.4,
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("consumptionService.list", () => {
    it("faz GET em /consumption com os params corretos e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: { items: [mockBucket], total: 1, page: 1, pageSize: 10, granularity: "day" },
            },
        })

        const result = await consumptionService.list({
            targetType: "PROPERTY",
            targetId: "prop-1",
            granularity: "day",
            page: 1,
            pageSize: 10,
        })

        expect(api.get).toHaveBeenCalledWith("/consumption", {
            params: {
                targetType: "PROPERTY",
                targetId: "prop-1",
                granularity: "day",
                page: 1,
                pageSize: 10,
            },
        })
        expect(result.items).toEqual([mockBucket])
        expect(result.granularity).toBe("day")
    })

    it("propaga erros do axios (ex: 404 alvo sem medidor)", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("404"))

        await expect(
            consumptionService.list({
                targetType: "DEVICE",
                targetId: "dev-1",
                granularity: "hour",
            }),
        ).rejects.toThrow("404")
    })
})

describe("consumptionService.compareAclToAcr", () => {
    it("faz GET em /consumption/acl-comparison com data de calendário (sem hora) e descasca o envelope", async () => {
        const mockComparison = {
            propertyId: "prop-1",
            from: "2026-06-01",
            to: "2026-08-01",
            months: [],
            totalAcrBrl: 1000,
            totalAclBrl: 800,
            totalDiffBrl: 200,
            diffPercent: 20,
            verdict: "ACL_CHEAPER" as const,
            pldContext: [],
        }
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockComparison },
        })

        const result = await consumptionService.compareAclToAcr({
            propertyId: "prop-1",
            from: new Date("2026-06-01T00:00:00Z"),
            to: new Date("2026-08-01T00:00:00Z"),
        })

        expect(api.get).toHaveBeenCalledWith("/consumption/acl-comparison", {
            params: { propertyId: "prop-1", from: "2026-06-01", to: "2026-08-01" },
        })
        expect(result).toEqual(mockComparison)
    })

    it("propaga o erro quando não há contrato ACL vigente para o período", async () => {
        vi.mocked(api.get).mockRejectedValue(
            new Error("Nenhum contrato de energia do Mercado Livre (ACL) vigente para o período"),
        )

        await expect(
            consumptionService.compareAclToAcr({
                propertyId: "prop-1",
                from: new Date("2026-06-01T00:00:00Z"),
                to: new Date("2026-08-01T00:00:00Z"),
            }),
        ).rejects.toThrow(/nenhum contrato/i)
    })
})
