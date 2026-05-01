import { describe, it, expect, beforeEach, vi } from "vitest"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    extractErrorMessage: vi.fn(),
}))

import { api } from "@/services/api"

const mockDistributor: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("distributorService.list", () => {
    it("retorna o array descapsulado do envelope", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: [mockDistributor] },
        })

        const result = await distributorService.list()

        expect(api.get).toHaveBeenCalledWith("/distributors")
        expect(result).toEqual([mockDistributor])
    })

    it("retorna array vazio quando não há distribuidoras", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: [] },
        })

        const result = await distributorService.list()

        expect(result).toEqual([])
    })
})

describe("distributorService.getById", () => {
    it("envia o ID na URL e retorna a entidade", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: { status: "success", data: mockDistributor },
        })

        const result = await distributorService.getById("dist-1")

        expect(api.get).toHaveBeenCalledWith("/distributors/dist-1")
        expect(result).toEqual(mockDistributor)
    })
})

describe("distributorService.create", () => {
    it("envia POST com o input e retorna a entidade criada", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: mockDistributor },
        })

        const input = {
            name: "CEMIG Distribuição S.A.",
            cnpj: "06.981.180/0001-16",
            electricalSystem: "TRIPHASIC" as const,
            workingVoltage: 220,
            kwhPrice: 0.75,
            taxRate: 0.12,
            publicLightingFee: 45.9,
        }

        const result = await distributorService.create(input)

        expect(api.post).toHaveBeenCalledWith("/distributors", input)
        expect(result).toEqual(mockDistributor)
    })
})

describe("distributorService.update", () => {
    it("envia PUT com o ID na URL e o input no body", async () => {
        vi.mocked(api.put).mockResolvedValueOnce({
            data: { status: "success", data: mockDistributor },
        })

        const input = { name: "Novo Nome" }

        const result = await distributorService.update("dist-1", input)

        expect(api.put).toHaveBeenCalledWith("/distributors/dist-1", input)
        expect(result).toEqual(mockDistributor)
    })
})

describe("distributorService.delete", () => {
    it("envia DELETE com o ID na URL", async () => {
        vi.mocked(api.delete).mockResolvedValueOnce({ data: {} })

        await distributorService.delete("dist-1")

        expect(api.delete).toHaveBeenCalledWith("/distributors/dist-1")
    })
})