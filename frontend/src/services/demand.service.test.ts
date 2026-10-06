import { describe, it, expect, beforeEach, vi } from "vitest"
import { demandService } from "@/services/demand.service"
import { api } from "@/services/api"
import type { DemandOverview } from "@/types/demand.types"

vi.mock("@/services/api", () => ({ api: { get: vi.fn() } }))

const overview: DemandOverview = {
    propertyId: "prop-1",
    modality: "GREEN",
    windowMinutes: 15,
    contracted: [{ post: null, kw: 200 }],
    current: { kw: 150, windowEnd: "2026-10-16T15:29:00.000Z" },
    monthMax: { kw: 180, windowEnd: "2026-10-09T21:14:00.000Z" },
    exceedancePercent: 0,
    day: { date: "2026-10-16", points: [] },
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("demandService.overview", () => {
    it("faz GET em /demand/overview com a propriedade e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { status: "success", data: overview } })

        const result = await demandService.overview("prop-1")

        expect(api.get).toHaveBeenCalledWith("/demand/overview", {
            params: { propertyId: "prop-1" },
        })
        expect(result).toEqual(overview)
    })
})
