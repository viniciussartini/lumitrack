import { describe, it, expect, beforeEach, vi } from "vitest"
import { propertyService } from "@/services/property.service"
import { api } from "@/services/api"
import type { Property } from "@/types/property.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    electricalSystem: "MONOPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("propertyService.list", () => {
    it("faz GET em /properties com os params de paginação e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: { items: [mockProperty], total: 1, page: 1, pageSize: 10 },
            },
        })

        const result = await propertyService.list({ page: 1, pageSize: 10 })

        expect(api.get).toHaveBeenCalledWith("/properties", {
            params: { page: 1, pageSize: 10 },
        })
        expect(result.items).toEqual([mockProperty])
    })

    it("funciona sem params", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: {
                status: "success",
                data: { items: [], total: 0, page: 1, pageSize: 10 },
            },
        })

        const result = await propertyService.list()

        expect(api.get).toHaveBeenCalledWith("/properties", { params: {} })
        expect(result.items).toEqual([])
    })

    it("propaga erros do axios", async () => {
        vi.mocked(api.get).mockRejectedValue(new Error("Network down"))

        await expect(propertyService.list()).rejects.toThrow("Network down")
    })
})

describe("propertyService.getById", () => {
    it("faz GET em /properties/:id e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { status: "success", data: mockProperty },
        })

        const result = await propertyService.getById("prop-1")

        expect(api.get).toHaveBeenCalledWith("/properties/prop-1")
        expect(result).toEqual(mockProperty)
    })
})

describe("propertyService.create", () => {
    it("faz POST em /properties com o body informado", async () => {
        vi.mocked(api.post).mockResolvedValue({
            data: { status: "success", data: mockProperty },
        })

        const input = {
            distributorId: "dist-1",
            name: "Casa Principal",
            city: "Belo Horizonte",
            electricalSystem: "MONOPHASIC" as const,
        }

        const result = await propertyService.create(input)

        expect(api.post).toHaveBeenCalledWith("/properties", input)
        expect(result).toEqual(mockProperty)
    })
})

describe("propertyService.update", () => {
    it("faz PUT em /properties/:id com o body informado", async () => {
        vi.mocked(api.put).mockResolvedValue({
            data: { status: "success", data: mockProperty },
        })

        const input = { name: "Casa Renovada" }

        const result = await propertyService.update("prop-1", input)

        expect(api.put).toHaveBeenCalledWith("/properties/prop-1", input)
        expect(result).toEqual(mockProperty)
    })
})

describe("propertyService.delete", () => {
    it("faz DELETE em /properties/:id", async () => {
        vi.mocked(api.delete).mockResolvedValue({ data: undefined })

        await propertyService.delete("prop-1")

        expect(api.delete).toHaveBeenCalledWith("/properties/prop-1")
    })
})
