import { describe, it, expect, beforeEach, vi } from "vitest"
import { consumptionService } from "@/services/consumption.service"
import { api } from "@/services/api"
import type {
    ConsumptionRecord,
    CreateConsumptionInput,
    UpdateConsumptionInput,
} from "@/types/consumption.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "DAILY",
    referenceDate: "2025-01-15T00:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    notes: "Pico de uso",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// listByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.listByProperty", () => {
    it("faz GET na rota da property e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockRecord] },
        })

        const result = await consumptionService.listByProperty("prop-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/consumption",
        )
        expect(result).toEqual([mockRecord])
    })

    it("inclui ?period=DAILY na URL quando o filtro é informado", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockRecord] },
        })

        await consumptionService.listByProperty("prop-1", "DAILY")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/consumption?period=DAILY",
        )
    })

    it("retorna array vazio quando o backend devolve []", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        const result = await consumptionService.listByProperty("prop-1")

        expect(result).toEqual([])
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("403"))

        await expect(
            consumptionService.listByProperty("prop-1"),
        ).rejects.toThrow("403")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// listByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.listByArea", () => {
    it("faz GET na rota aninhada da area, com period", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: [{ ...mockRecord, propertyId: null, areaId: "area-1" }],
            },
        })

        await consumptionService.listByArea("prop-1", "area-1", "MONTHLY")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/consumption?period=MONTHLY",
        )
    })

    it("omite o query param quando period é undefined", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        await consumptionService.listByArea("prop-1", "area-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/consumption",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// listByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.listByDevice", () => {
    it("faz GET na rota aninhada do device", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: [{ ...mockRecord, propertyId: null, deviceId: "dev-1" }],
            },
        })

        await consumptionService.listByDevice("prop-1", "area-1", "dev-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/dev-1/consumption",
        )
    })

    it("inclui ?period=HOURLY quando informado", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        await consumptionService.listByDevice(
            "prop-1",
            "area-1",
            "dev-1",
            "HOURLY",
        )

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/dev-1/consumption?period=HOURLY",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getById
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.getById", () => {
    it("faz GET na rota da property com :id", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockRecord },
        })

        const result = await consumptionService.getById("prop-1", "rec-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/consumption/rec-1",
        )
        expect(result).toEqual(mockRecord)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// createForProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.createForProperty", () => {
    it("faz POST na rota da property com o body", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockRecord },
        })

        const input: CreateConsumptionInput = {
            period: "DAILY",
            referenceDate: "2025-01-15",
            kwhConsumed: 12.5,
        }

        const result = await consumptionService.createForProperty(
            "prop-1",
            input,
        )

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/consumption",
            input,
        )
        expect(result).toEqual(mockRecord)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// createForArea
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.createForArea", () => {
    it("faz POST na rota aninhada da area", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockRecord },
        })

        const input: CreateConsumptionInput = {
            period: "DAILY",
            referenceDate: "2025-01-15",
            kwhConsumed: 5,
        }

        await consumptionService.createForArea("prop-1", "area-1", input)

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/consumption",
            input,
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// createForDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.createForDevice", () => {
    it("faz POST na rota aninhada do device", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockRecord },
        })

        const input: CreateConsumptionInput = {
            period: "HOURLY",
            referenceDate: "2025-01-15T14:00:00.000Z",
            kwhConsumed: 0.8,
            notes: "TV ligada",
        }

        await consumptionService.createForDevice(
            "prop-1",
            "area-1",
            "dev-1",
            input,
        )

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/dev-1/consumption",
            input,
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.update", () => {
    it("faz PUT na rota da property com :id", async () => {
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: { ...mockRecord, kwhConsumed: 15 } },
        })

        const input: UpdateConsumptionInput = { kwhConsumed: 15 }
        const result = await consumptionService.update(
            "prop-1",
            "rec-1",
            input,
        )

        expect(api.put).toHaveBeenCalledWith(
            "/properties/prop-1/consumption/rec-1",
            input,
        )
        expect(result.kwhConsumed).toBe(15)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// delete
// ─────────────────────────────────────────────────────────────────────────────

describe("consumptionService.delete", () => {
    it("faz DELETE na rota da property com :id", async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined })

        await consumptionService.delete("prop-1", "rec-1")

        expect(api.delete).toHaveBeenCalledWith(
            "/properties/prop-1/consumption/rec-1",
        )
    })

    it("propaga erros do axios (ex: 403/404)", async () => {
        vi.mocked(api.delete).mockRejectedValue(new Error("404"))

        await expect(
            consumptionService.delete("prop-1", "rec-1"),
        ).rejects.toThrow("404")
    })
})