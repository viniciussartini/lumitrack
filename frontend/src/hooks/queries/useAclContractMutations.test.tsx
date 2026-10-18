import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useCreateAclContract, useUpdateAclContract } from "@/hooks/queries/useAclContractMutations"
import { aclContractService } from "@/services/acl-contract.service"
import type { AclContract } from "@/types/acl-contract.types"

vi.mock("@/services/acl-contract.service", () => ({
    aclContractService: {
        create: vi.fn(),
        update: vi.fn(),
    },
}))

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

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useCreateAclContract", () => {
    it("chama aclContractService.create com o input", async () => {
        vi.mocked(aclContractService.create).mockResolvedValue(mockContract)

        const { result } = renderHook(() => useCreateAclContract(), { wrapper: createWrapper() })

        result.current.mutate({
            propertyId: "prop-1",
            retailerName: "Comerc Energia",
            submarket: "SOUTHEAST_CENTER_WEST",
            energySource: "CONVENTIONAL",
            energyPricePerMwh: 280,
            contractedVolumeMwh: 120,
            validFrom: "2026-01-01",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(aclContractService.create).toHaveBeenCalledWith(
            expect.objectContaining({ propertyId: "prop-1" }),
        )
    })
})

describe("useUpdateAclContract", () => {
    it("chama aclContractService.update com o id e o input", async () => {
        vi.mocked(aclContractService.update).mockResolvedValue({
            ...mockContract,
            energyPricePerMwh: 300,
        })

        const { result } = renderHook(() => useUpdateAclContract(), { wrapper: createWrapper() })

        result.current.mutate({
            id: "contract-1",
            propertyId: "prop-1",
            input: { energyPricePerMwh: 300 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(aclContractService.update).toHaveBeenCalledWith("contract-1", {
            energyPricePerMwh: 300,
        })
    })
})
