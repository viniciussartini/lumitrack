import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
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

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(consumptionService.summary).toHaveBeenCalledTimes(2)
        expect(result.current).toEqual({ isLoading: false, todayKwh: null, month: null })
    })

    it("sem id (alvo sem medidor), não consulta", () => {
        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", undefined), {
            wrapper,
        })

        expect(consumptionService.summary).not.toHaveBeenCalled()
        expect(result.current).toEqual({ isLoading: false, todayKwh: null, month: null })
    })

    it("isLoading vale enquanto o resumo carrega e cai quando ele chega", async () => {
        mockSummary({ day: item(today, 12.5), month: item(thisMonth, 200, 160) })

        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", "area-1"), { wrapper })

        expect(result.current.isLoading).toBe(true)
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.todayKwh).toBe(12.5)
    })

    it("sem id (alvo sem medidor), não fica em carregando", () => {
        const { result } = renderHook(() => useTargetConsumptionKpis("AREA", undefined), {
            wrapper,
        })

        expect(result.current.isLoading).toBe(false)
    })

    describe("virada do dia com a página aberta", () => {
        afterEach(() => {
            vi.useRealTimers()
        })

        it("depois da virada, 'hoje' é o dia novo e não o dia em que a página abriu", async () => {
            vi.useFakeTimers({ toFake: ["Date"] })
            vi.setSystemTime(new Date(2026, 8, 21, 23, 59))
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
            const sharedWrapper = ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            )
            // O backend só devolve o bucket do dia em que a consulta acontece;
            // o consumo cresce a cada consulta para distinguir dado novo de velho.
            let generation = 0
            vi.mocked(consumptionService.summary).mockImplementation(async ({ granularity }) => {
                const now = new Date()
                if (granularity === "day") generation += 1
                const bucketStart =
                    granularity === "day"
                        ? `${toLocalDateKey(now)}T00:00:00.000Z`
                        : `${toLocalMonthKey(now)}-01T00:00:00.000Z`
                return { items: [item(bucketStart, granularity === "day" ? generation : 100, 80)] }
            })

            const { result } = renderHook(() => useTargetConsumptionKpis("AREA", "area-1"), {
                wrapper: sharedWrapper,
            })
            await waitFor(() => expect(result.current.todayKwh).toBe(1))

            vi.setSystemTime(new Date(2026, 8, 22, 0, 1))
            await act(async () => {
                await queryClient.invalidateQueries()
            })

            await waitFor(() => expect(result.current.todayKwh).toBe(2))
        })
    })
})
