import { describe, it, expect, beforeEach, vi } from "vitest"
import { aclContractService } from "@/services/acl-contract.service"
import type { AclContract } from "@/types/acl-contract.types"

vi.mock("@/services/api", () => ({
    api: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
    },
}))

import { api } from "@/services/api"

const mockContract: AclContract = {
    id: "contract-1",
    userId: "user-1",
    propertyId: "prop-1",
    retailerName: "Comerc Energia",
    submarket: "SOUTHEAST_CENTER_WEST",
    energySource: "CONVENTIONAL",
    energyPricePerMwh: 280,
    contractedVolumeMwh: 120,
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("aclContractService.listByProperty", () => {
    it("faz GET em /acl-contracts com propertyId e paginação, e descasca o envelope", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            data: {
                status: "success",
                data: { items: [mockContract], total: 1, page: 1, pageSize: 31 },
            },
        })

        const result = await aclContractService.listByProperty("prop-1", { page: 1, pageSize: 31 })

        expect(api.get).toHaveBeenCalledWith("/acl-contracts", {
            params: { page: 1, pageSize: 31, propertyId: "prop-1" },
        })
        expect(result.items).toEqual([mockContract])
    })
})

describe("aclContractService.create", () => {
    it("faz POST em /acl-contracts e retorna a entidade criada", async () => {
        vi.mocked(api.post).mockResolvedValueOnce({
            data: { status: "success", data: mockContract },
        })

        const result = await aclContractService.create({
            propertyId: "prop-1",
            retailerName: "Comerc Energia",
            submarket: "SOUTHEAST_CENTER_WEST",
            energySource: "CONVENTIONAL",
            energyPricePerMwh: 280,
            contractedVolumeMwh: 120,
            validFrom: "2026-01-01",
        })

        expect(api.post).toHaveBeenCalledWith(
            "/acl-contracts",
            expect.objectContaining({ propertyId: "prop-1", retailerName: "Comerc Energia" }),
        )
        expect(result).toEqual(mockContract)
    })
})

describe("aclContractService.update", () => {
    it("faz PUT em /acl-contracts/:id com o corpo parcial", async () => {
        vi.mocked(api.put).mockResolvedValueOnce({
            data: { status: "success", data: { ...mockContract, energyPricePerMwh: 300 } },
        })

        const result = await aclContractService.update("contract-1", { energyPricePerMwh: 300 })

        expect(api.put).toHaveBeenCalledWith("/acl-contracts/contract-1", {
            energyPricePerMwh: 300,
        })
        expect(result.energyPricePerMwh).toBe(300)
    })
})
