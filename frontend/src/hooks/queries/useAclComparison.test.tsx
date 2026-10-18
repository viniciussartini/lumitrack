import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useAclComparison } from "@/hooks/queries/useAclComparison"
import { consumptionService } from "@/services/consumption.service"
import type { AclComparisonResponse } from "@/types/acl-comparison.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        compareAclToAcr: vi.fn(),
    },
}))

const mockComparison: AclComparisonResponse = {
    propertyId: "prop-1",
    from: "2026-06-01",
    to: "2026-08-01",
    months: [],
    totalAcrBrl: 1000,
    totalAclBrl: 800,
    totalDiffBrl: 200,
    diffPercent: 20,
    verdict: "ACL_CHEAPER",
    pldContext: [],
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

describe("useAclComparison", () => {
    it("não dispara a query enquanto propertyId, from ou to estiverem ausentes", () => {
        const { result: withoutProperty } = renderHook(
            () => useAclComparison(undefined, new Date(), new Date()),
            { wrapper: createWrapper() },
        )
        expect(withoutProperty.current.fetchStatus).toBe("idle")

        const { result: withoutRange } = renderHook(
            () => useAclComparison("prop-1", undefined, undefined),
            { wrapper: createWrapper() },
        )
        expect(withoutRange.current.fetchStatus).toBe("idle")

        expect(consumptionService.compareAclToAcr).not.toHaveBeenCalled()
    })

    it("busca a comparação quando os três parâmetros estão presentes", async () => {
        vi.mocked(consumptionService.compareAclToAcr).mockResolvedValue(mockComparison)
        const from = new Date("2026-06-01T00:00:00Z")
        const to = new Date("2026-08-01T00:00:00Z")

        const { result } = renderHook(() => useAclComparison("prop-1", from, to), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.compareAclToAcr).toHaveBeenCalledWith({
            propertyId: "prop-1",
            from,
            to,
        })
        expect(result.current.data).toEqual(mockComparison)
    })
})
