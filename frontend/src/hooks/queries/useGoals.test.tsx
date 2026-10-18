import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useGoals } from "@/hooks/queries/useGoals"
import { goalService } from "@/services/goal.service"
import type { Goal } from "@/types/goal.types"

vi.mock("@/services/goal.service", () => ({
    goalService: {
        list: vi.fn(),
        progress: vi.fn(),
        alerts: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

const goalOf = (year: number): Goal => ({
    id: `goal-${year}`,
    propertyId: "prop-1",
    year,
    unit: "KWH",
    referenceYear: year - 1,
    monthlyTargets: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const PAGE_SIZE = 31

// Simula o backend: devolve a página pedida de uma lista de `total` metas.
const serveGoals = (total: number) => {
    const all = Array.from({ length: total }, (_, index) => goalOf(2100 - index))
    vi.mocked(goalService.list).mockImplementation(async (_propertyId, params) => {
        const page = params.page ?? 1
        const pageSize = params.pageSize ?? PAGE_SIZE
        return {
            items: all.slice((page - 1) * pageSize, page * pageSize),
            total,
            page,
            pageSize,
        }
    })
    return all
}

const renderUseGoals = (propertyId: string | null) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return renderHook(() => useGoals(propertyId), { wrapper })
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useGoals", () => {
    it("com poucas metas, uma só chamada basta", async () => {
        serveGoals(3)

        const { result } = renderUseGoals("prop-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data?.items).toHaveLength(3)
        expect(goalService.list).toHaveBeenCalledTimes(1)
    })

    it("traz o histórico inteiro mesmo quando passa de uma página", async () => {
        const all = serveGoals(70)

        const { result } = renderUseGoals("prop-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data?.items.map((goal) => goal.year)).toEqual(
            all.map((goal) => goal.year),
        )
        expect(result.current.data?.total).toBe(70)
        expect(goalService.list).toHaveBeenCalledTimes(3)
    })

    it("sem propriedade, não consulta", () => {
        serveGoals(3)

        renderUseGoals(null)

        expect(goalService.list).not.toHaveBeenCalled()
    })
})
