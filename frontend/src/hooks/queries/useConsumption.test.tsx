import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useConsumption } from "@/hooks/queries/useConsumption"
import { latestRange } from "@/lib/consumptionWindow"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionBucket } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        list: vi.fn(),
    },
}))

const mockBucket: ConsumptionBucket = {
    bucketStart: "2025-01-15T00:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    avgPowerW: 520.4,
}

const from = new Date(2026, 7, 21, 19, 0)
const to = new Date(2026, 7, 21, 20, 0)
const range = { from, to }

const createWrapper = () => {
    // gcTime: 0 evita cache cruzando entre testes (regra do projeto pra suite)
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

describe("useConsumption", () => {
    it("chama list com targetType/targetId/granularity e page/pageSize default", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [mockBucket],
            total: 1,
            page: 1,
            pageSize: 10,
            granularity: "day",
        })

        const { result } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "day", 1, 10, range),
            {
                wrapper: createWrapper(),
            },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.list).toHaveBeenCalledWith({
            targetType: "PROPERTY",
            targetId: "prop-1",
            granularity: "day",
            page: 1,
            pageSize: 10,
            from,
            to,
        })
        expect(result.current.data?.items).toEqual([mockBucket])
    })

    it("repassa page/pageSize customizados", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 2,
            pageSize: 5,
            granularity: "hour",
        })

        renderHook(() => useConsumption("DEVICE", "dev-1", "hour", 2, 5, range), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(consumptionService.list).toHaveBeenCalledWith({
                targetType: "DEVICE",
                targetId: "dev-1",
                granularity: "hour",
                page: 2,
                pageSize: 5,
                from,
                to,
            }),
        )
    })

    it("repassa a janela (from/to/order) quando um range é informado", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 10,
            granularity: "minute",
        })

        renderHook(
            () => useConsumption("PROPERTY", "prop-1", "minute", 1, 10, { from, to, order: "asc" }),
            { wrapper: createWrapper() },
        )

        await waitFor(() =>
            expect(consumptionService.list).toHaveBeenCalledWith({
                targetType: "PROPERTY",
                targetId: "prop-1",
                granularity: "minute",
                page: 1,
                pageSize: 10,
                from,
                to,
                order: "asc",
            }),
        )
    })

    it("uma consulta 'últimos N buckets' e uma de janela com o mesmo targetType/granularity/pageSize não compartilham cache", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 3,
            granularity: "hour",
        })

        // Mesmo QueryClient nos dois — se as chaves colidissem, a 2ª
        // renderização reaproveitaria o cache da 1ª e `list` seria chamado
        // só uma vez.
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )

        const { result: latestResult } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "hour", 1, 3, latestRange("hour", 3)),
            { wrapper },
        )
        const { result: windowResult } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "hour", 1, 3, { from, to, order: "asc" }),
            { wrapper },
        )

        await waitFor(() => expect(latestResult.current.isSuccess).toBe(true))
        await waitFor(() => expect(windowResult.current.isSuccess).toBe(true))

        expect(consumptionService.list).toHaveBeenCalledTimes(2)
    })

    it("últimos N baldes: a janela sai calculada no pedido e a chave leva só o tamanho dela", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 3,
            granularity: "hour",
        })
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date(2026, 7, 21, 19, 30))

        try {
            const { result } = renderHook(
                () => useConsumption("PROPERTY", "prop-1", "hour", 1, 3, latestRange("hour", 3)),
                { wrapper: createWrapper() },
            )
            await waitFor(() => expect(result.current.isSuccess).toBe(true))
            expect(consumptionService.list).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    from: new Date(2026, 7, 21, 17),
                    to: new Date(2026, 7, 21, 20),
                }),
            )

            // Passou a hora: a mesma consulta (mesma chave, sem esqueleto) pede a janela nova.
            vi.setSystemTime(new Date(2026, 7, 21, 20, 5))
            await result.current.refetch()

            expect(result.current.isSuccess).toBe(true)
            expect(consumptionService.list).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    from: new Date(2026, 7, 21, 18),
                    to: new Date(2026, 7, 21, 21),
                }),
            )
        } finally {
            vi.useRealTimers()
        }
    })

    it("janelas 'últimos N' de tamanhos diferentes não compartilham cache", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            pageSize: 1,
            granularity: "day",
        })
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )

        const { result: one } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "day", 1, 1, latestRange("day", 1)),
            { wrapper },
        )
        const { result: seven } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "day", 1, 1, latestRange("day", 7)),
            { wrapper },
        )
        await waitFor(() => expect(one.current.isSuccess).toBe(true))
        await waitFor(() => expect(seven.current.isSuccess).toBe(true))

        expect(consumptionService.list).toHaveBeenCalledTimes(2)
    })

    it("não dispara a query quando targetId é undefined", () => {
        renderHook(() => useConsumption("AREA", undefined, "day", 1, 10, range), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })

    it("propaga erro (ex: 404 alvo sem medidor)", async () => {
        vi.mocked(consumptionService.list).mockRejectedValue(new Error("404"))

        const { result } = renderHook(
            () => useConsumption("PROPERTY", "prop-1", "day", 1, 10, range),
            {
                wrapper: createWrapper(),
            },
        )

        await waitFor(() => expect(result.current.isError).toBe(true))
    })
})
