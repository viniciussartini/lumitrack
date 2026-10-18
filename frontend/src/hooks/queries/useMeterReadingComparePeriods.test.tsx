import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useMeterReadingComparePeriods } from "@/hooks/queries/useMeterReadingComparePeriods"
import { meterReadingService } from "@/services/meterReading.service"
import type { PeriodComparisonRun } from "@/lib/periodComparison"

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { comparePeriods: vi.fn() },
}))

const RUN: PeriodComparisonRun = {
    target: { key: "PROPERTY:p", targetType: "PROPERTY", targetId: "p", label: "Casa" },
    metric: "tensao",
    aStart: "2026-01-01",
    aEnd: "2026-01-07",
    bStart: "2026-02-01",
    bEnd: "2026-02-07",
}

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useMeterReadingComparePeriods", () => {
    it("sem run, a query fica desabilitada e não chama a API", () => {
        const { result } = renderHook(() => useMeterReadingComparePeriods(undefined), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(meterReadingService.comparePeriods).not.toHaveBeenCalled()
    })

    it("com run, chama a API com alvo, grandeza e os instantes de São Paulo", async () => {
        vi.mocked(meterReadingService.comparePeriods).mockResolvedValue({
            metric: "tensao",
            granularity: "day",
            periodA: { from: "", to: "", items: [], summary: { min: null, avg: null, max: null } },
            periodB: { from: "", to: "", items: [], summary: { min: null, avg: null, max: null } },
            diff: { absolute: null, percent: null },
        })

        const { result } = renderHook(() => useMeterReadingComparePeriods(RUN), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(meterReadingService.comparePeriods).toHaveBeenCalledWith({
            targetType: "PROPERTY",
            targetId: "p",
            metric: "tensao",
            fromA: "2026-01-01T03:00:00.000Z",
            toA: "2026-01-08T03:00:00.000Z",
            fromB: "2026-02-01T03:00:00.000Z",
            toB: "2026-02-08T03:00:00.000Z",
        })
    })
})
