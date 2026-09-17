import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useBrancaComparison } from "@/hooks/queries/useBrancaComparison"
import { consumptionService } from "@/services/consumption.service"
import type { BrancaComparisonResponse } from "@/types/branca-comparison.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        compareBrancaToConvencional: vi.fn(),
    },
}))

const mockComparison: BrancaComparisonResponse = {
    propertyId: "prop-1",
    from: "2026-06-01",
    to: "2026-08-01",
    months: [],
    totalConvencionalBrl: 1000,
    totalBrancaBrl: 800,
    totalDiffBrl: 200,
    diffPercent: 20,
    verdict: "BRANCA_CHEAPER",
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

describe("useBrancaComparison", () => {
    it("não dispara a query enquanto propertyId, from ou to estiverem ausentes", () => {
        const { result: withoutProperty } = renderHook(
            () => useBrancaComparison(undefined, new Date(), new Date()),
            { wrapper: createWrapper() },
        )
        expect(withoutProperty.current.fetchStatus).toBe("idle")

        const { result: withoutRange } = renderHook(
            () => useBrancaComparison("prop-1", undefined, undefined),
            { wrapper: createWrapper() },
        )
        expect(withoutRange.current.fetchStatus).toBe("idle")

        expect(consumptionService.compareBrancaToConvencional).not.toHaveBeenCalled()
    })

    it("busca a comparação quando os três parâmetros estão presentes", async () => {
        vi.mocked(consumptionService.compareBrancaToConvencional).mockResolvedValue(mockComparison)
        const from = new Date("2026-06-01T00:00:00Z")
        const to = new Date("2026-08-01T00:00:00Z")

        const { result } = renderHook(() => useBrancaComparison("prop-1", from, to), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.compareBrancaToConvencional).toHaveBeenCalledWith({
            propertyId: "prop-1",
            from,
            to,
        })
        expect(result.current.data).toEqual(mockComparison)
    })
})
