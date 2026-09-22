import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useTargetConsumptionKpis } from "@/hooks/useTargetConsumptionKpis"
import { consumptionService } from "@/services/consumption.service"
import { toLocalDateKey, toLocalMonthKey } from "@/lib/dashboardKpis"
import type { BucketSize, ConsumptionSummaryItem } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: { summary: vi.fn() },
}))

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
        {children}
    </QueryClientProvider>
)

const item = (
    bucketStart: string,
    kwhConsumed: number,
    costBrl?: number,
): ConsumptionSummaryItem => ({
    id: "area-1",
    targetType: "AREA",
    bucketStart,
    kwhConsumed,
    avgPowerW: 300,
    ...(costBrl !== undefined && { costBrl }),
})

const mockSummary = (byGranularity: Partial<Record<BucketSize, ConsumptionSummaryItem>>) =>
    vi.mocked(consumptionService.summary).mockImplementation(async ({ granularity }) => ({
        items: byGranularity[granularity] ? [byGranularity[granularity]!] : [],
    }))

const today = `${toLocalDateKey(new Date())}T00:00:00.000Z`
const thisMonth = `${toLocalMonthKey(new Date())}-01T00:00:00.000Z`

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useTargetConsumptionKpis", () => {
    it("consumo de hoje e custo do mês vêm de duas chamadas ao resumo", async () => {
        mockSummary({ day: item(today, 12.5), month: item(thisMonth, 200, 160) })

        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", "area-1"), { wrapper })

        await waitFor(() => expect(result.current.todayKwh).toBe(12.5))
        expect(result.current.month).toEqual({ kwh: 200, costBrl: 160 })
        expect(consumptionService.summary).toHaveBeenCalledWith(
            expect.objectContaining({ targetType: "AREA", ids: ["area-1"], granularity: "day" }),
        )
        expect(consumptionService.summary).toHaveBeenCalledWith(
            expect.objectContaining({ targetType: "AREA", ids: ["area-1"], granularity: "month" }),
        )
    })

    it("sem custo no resumo (Grupo A ou Branca), o consumo vem e o custo fica ausente", async () => {
        mockSummary({ day: item(today, 3), month: item(thisMonth, 90) })

        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", "area-1"), { wrapper })

        await waitFor(() => expect(result.current.month).toEqual({ kwh: 90, costBrl: null }))
    })

    it("alvo sem leitura: nenhum dado", async () => {
        mockSummary({})

        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", "area-1"), { wrapper })

        await waitFor(() => expect(consumptionService.summary).toHaveBeenCalledTimes(2))
        expect(result.current).toEqual({ todayKwh: null, month: null })
    })

    it("sem id (alvo sem medidor), não consulta", () => {
        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", undefined), {
            wrapper,
        })

        expect(consumptionService.summary).not.toHaveBeenCalled()
        expect(result.current).toEqual({ todayKwh: null, month: null })
    })
})
