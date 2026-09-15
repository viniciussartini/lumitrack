import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useAclContracts, useCurrentAclContract } from "@/hooks/queries/useAclContracts"
import { aclContractService } from "@/services/acl-contract.service"
import type { AclContract } from "@/types/acl-contract.types"

vi.mock("@/services/acl-contract.service", () => ({
    aclContractService: {
        listByProperty: vi.fn(),
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

describe("useAclContracts", () => {
    it("não dispara a query quando propertyId é undefined", () => {
        const { result } = renderHook(() => useAclContracts(undefined), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(aclContractService.listByProperty).not.toHaveBeenCalled()
    })

    it("busca a página de contratos da propriedade", async () => {
        vi.mocked(aclContractService.listByProperty).mockResolvedValue({
            items: [mockContract],
            total: 1,
            page: 1,
            pageSize: 31,
        })

        const { result } = renderHook(() => useAclContracts("prop-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(aclContractService.listByProperty).toHaveBeenCalledWith("prop-1", {
            page: 1,
            pageSize: 31,
        })
        expect(result.current.data?.items).toEqual([mockContract])
    })
})

describe("useCurrentAclContract", () => {
    it("retorna o primeiro contrato da lista (mais recente, ordenado pelo backend)", async () => {
        vi.mocked(aclContractService.listByProperty).mockResolvedValue({
            items: [mockContract],
            total: 1,
            page: 1,
            pageSize: 31,
        })

        const { result } = renderHook(() => useCurrentAclContract("prop-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toEqual(mockContract)
    })

    it("retorna undefined quando a propriedade não tem nenhum contrato", async () => {
        vi.mocked(aclContractService.listByProperty).mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 31,
        })

        const { result } = renderHook(() => useCurrentAclContract("prop-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toBeUndefined()
    })
})
