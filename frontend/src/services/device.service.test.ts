import { describe, it, expect, beforeEach, vi } from "vitest"
import { deviceService } from "@/services/device.service"
import { api } from "@/services/api"
import type { Device } from "@/types/device.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("deviceService.list", () => {
    it("faz GET em /properties/:propertyId/areas/:areaId/devices e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockDevice] },
        })

        const result = await deviceService.list("prop-1", "area-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices",
        )
        expect(result).toEqual([mockDevice])
    })

    it("retorna array vazio quando o backend devolve []", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        const result = await deviceService.list("prop-1", "area-1")

        expect(result).toEqual([])
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("Network down"))

        await expect(
            deviceService.list("prop-1", "area-1"),
        ).rejects.toThrow("Network down")
    })
})

describe("deviceService.getById", () => {
    it("faz GET em /properties/:propertyId/areas/:areaId/devices/:id", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockDevice },
        })

        const result = await deviceService.getById("prop-1", "area-1", "device-1")

        expect(api.get).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/device-1",
        )
        expect(result).toEqual(mockDevice)
    })
})

describe("deviceService.create", () => {
    it("faz POST com o body informado", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockDevice },
        })

        const input = {
            name: "Ar-condicionado",
            brand: "Daikin",
            model: "Split 12000 BTU",
            powerWatts: 1200,
        }
        const result = await deviceService.create("prop-1", "area-1", input)

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices",
            input,
        )
        expect(result).toEqual(mockDevice)
    })

    it("aceita payload mínimo (só name)", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockDevice },
        })

        await deviceService.create("prop-1", "area-1", { name: "Lâmpada" })

        expect(api.post).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices",
            { name: "Lâmpada" },
        )
    })
})

describe("deviceService.update", () => {
    it("faz PUT com o body informado", async () => {
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: mockDevice },
        })

        const input = { name: "Ar-condicionado renovado", powerWatts: 1500 }
        const result = await deviceService.update(
            "prop-1",
            "area-1",
            "device-1",
            input,
        )

        expect(api.put).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/device-1",
            input,
        )
        expect(result).toEqual(mockDevice)
    })
})

describe("deviceService.delete", () => {
    it("faz DELETE em /properties/:propertyId/areas/:areaId/devices/:id", async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined })

        await deviceService.delete("prop-1", "area-1", "device-1")

        expect(api.delete).toHaveBeenCalledWith(
            "/properties/prop-1/areas/area-1/devices/device-1",
        )
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.delete).mockRejectedValue(new Error("403"))

        await expect(
            deviceService.delete("prop-1", "area-1", "device-1"),
        ).rejects.toThrow("403")
    })
})