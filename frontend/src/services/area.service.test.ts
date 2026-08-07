import { describe, it, expect, beforeEach, vi } from "vitest"
import { areaService } from "@/services/area.service"
import { api } from "@/services/api"
import type { Area } from "@/types/area.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("areaService.list", () => {
    it("faz GET em /properties/:propertyId/areas e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [mockArea] },
        })

        const result = await areaService.list("prop-1")

        expect(api.get).toHaveBeenCalledWith("/properties/prop-1/areas", {
            params: {},
        })
        expect(result).toEqual([mockArea])
    })

    it("retorna array vazio quando o backend devolve []", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: [] },
        })

        const result = await areaService.list("prop-1")

        expect(result).toEqual([])
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("Network down"))

        await expect(areaService.list("prop-1")).rejects.toThrow("Network down")
    })
})

describe("areaService.getById", () => {
    it("faz GET em /properties/:propertyId/areas/:id e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockArea },
        })

        const result = await areaService.getById("prop-1", "area-1")

        expect(api.get).toHaveBeenCalledWith("/properties/prop-1/areas/area-1")
        expect(result).toEqual(mockArea)
    })
})

describe("areaService.create", () => {
    it("faz POST em /properties/:propertyId/areas com o body informado", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockArea },
        })

        const input = { name: "Sala", description: "Área principal" }
        const result = await areaService.create("prop-1", input)

        expect(api.post).toHaveBeenCalledWith("/properties/prop-1/areas", input)
        expect(result).toEqual(mockArea)
    })
})

describe("areaService.update", () => {
    it("faz PUT em /properties/:propertyId/areas/:id com o body informado", async () => {
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: mockArea },
        })

        const input = { name: "Sala renovada" }
        const result = await areaService.update("prop-1", "area-1", input)

        expect(api.put).toHaveBeenCalledWith("/properties/prop-1/areas/area-1", input)
        expect(result).toEqual(mockArea)
    })
})

describe("areaService.delete", () => {
    it("faz DELETE em /properties/:propertyId/areas/:id", async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined })

        await areaService.delete("prop-1", "area-1")

        expect(api.delete).toHaveBeenCalledWith("/properties/prop-1/areas/area-1")
    })

    it("propaga erros do axios (ex: 404 cascade já apagou)", async () => {
        vi.mocked(api.delete).mockRejectedValue(new Error("Not found"))

        await expect(areaService.delete("prop-1", "area-1")).rejects.toThrow("Not found")
    })
})
