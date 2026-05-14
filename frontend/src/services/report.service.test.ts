import { describe, it, expect, beforeEach, vi } from "vitest"
import { api } from "@/services/api"
import { reportService } from "@/services/report.service"
import type { ReportResult } from "@/types/report.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
    },
}))

const mockResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
    dateRange: null,
    summary: {
        totalKwh: 100,
        totalCostBrl: 75,
        recordCount: 4,
        avgKwhPerRecord: 25,
        trend: "STABLE",
    },
    records: [],
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// generateByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("reportService.generateByProperty", () => {
    it("faz GET com target=PROPERTY e period", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByProperty("prop-1", {
            period: "MONTHLY",
        })

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=PROPERTY&period=MONTHLY",
        )
    })

    it("inclui dateFrom e dateTo quando informados", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByProperty("prop-1", {
            period: "DAILY",
            dateFrom: "2025-01-01",
            dateTo: "2025-01-31",
        })

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=PROPERTY&period=DAILY&dateFrom=2025-01-01&dateTo=2025-01-31",
        )
    })

    it("retorna o resultado desembrulhado do envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        const result = await reportService.generateByProperty("prop-1", {
            period: "MONTHLY",
        })

        expect(result).toEqual(mockResult)
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("500"))

        await expect(
            reportService.generateByProperty("prop-1", { period: "MONTHLY" }),
        ).rejects.toThrow("500")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("reportService.generateByArea", () => {
    it("faz GET com target=AREA e targetId=areaId", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByArea("prop-1", "area-1", {
            period: "MONTHLY",
        })

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=AREA&targetId=area-1&period=MONTHLY",
        )
    })

    it("inclui datas opcionais", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByArea("prop-1", "area-1", {
            period: "ANNUAL",
            dateFrom: "2024-01-01",
            dateTo: "2024-12-31",
        })

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=AREA&targetId=area-1&period=ANNUAL&dateFrom=2024-01-01&dateTo=2024-12-31",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("reportService.generateByDevice", () => {
    it("faz GET com target=DEVICE, targetId=deviceId e targetAreaId", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByDevice(
            "prop-1",
            "area-1",
            "dev-1",
            { period: "DAILY" },
        )

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=DEVICE&targetId=dev-1&targetAreaId=area-1&period=DAILY",
        )
    })

    it("omite dateFrom quando undefined mas mantém dateTo", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockResult },
        })

        await reportService.generateByDevice(
            "prop-1",
            "area-1",
            "dev-1",
            {
                period: "MONTHLY",
                dateTo: "2025-12-31",
            },
        )

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/report?target=DEVICE&targetId=dev-1&targetAreaId=area-1&period=MONTHLY&dateTo=2025-12-31",
        )
    })
})