import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useConsumption } from "@/hooks/queries/useConsumption"
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

        const { result } = renderHook(() => useConsumption("PROPERTY", "prop-1", "day"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.list).toHaveBeenCalledWith({
            targetType: "PROPERTY",
            targetId: "prop-1",
            granularity: "day",
            page: 1,
            pageSize: 10,
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

        renderHook(() => useConsumption("DEVICE", "dev-1", "hour", 2, 5), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(consumptionService.list).toHaveBeenCalledWith({
                targetType: "DEVICE",
                targetId: "dev-1",
                granularity: "hour",
                page: 2,
                pageSize: 5,
            }),
        )
    })

    it("não dispara a query quando targetId é undefined", () => {
        renderHook(() => useConsumption("AREA", undefined, "day"), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })

    it("propaga erro (ex: 404 alvo sem medidor)", async () => {
        vi.mocked(consumptionService.list).mockRejectedValue(new Error("404"))

        const { result } = renderHook(() => useConsumption("PROPERTY", "prop-1", "day"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))
    })
})
