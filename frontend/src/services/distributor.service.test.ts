import { describe, it, expect, beforeEach, vi } from "vitest"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
    },
}))

import { api } from "@/services/api"

const mockDistributor: Distributor = {
    id: "dist-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.4,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("distributorService.list", () => {
    it("faz GET em /distributors com os params de paginação e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { items: [mockDistributor], total: 1, page: 1, pageSize: 10 },
            },
        })

        const result = await distributorService.list({ page: 1, pageSize: 10 })

        expect(api.get).toHaveBeenCalledWith("/distributors", {
            params: { page: 1, pageSize: 10 },
        })
        expect(result.items).toEqual([mockDistributor])
    })

    it("funciona sem params (default do backend)", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { items: [], total: 0, page: 1, pageSize: 10 },
            },
        })

        const result = await distributorService.list()

        expect(api.get).toHaveBeenCalledWith("/distributors", { params: {} })
        expect(result.items).toEqual([])
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
