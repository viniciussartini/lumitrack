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
