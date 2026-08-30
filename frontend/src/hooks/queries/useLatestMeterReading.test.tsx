import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLatestMeterReading } from "@/hooks/queries/useLatestMeterReading"
import { meterReadingService } from "@/services/meterReading.service"

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { list: vi.fn() },
}))

const mockedList = vi.mocked(meterReadingService.list)

const renderWithQueryClient = (enabled: boolean) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return renderHook(() => useLatestMeterReading("PROPERTY", "prop-1", enabled), {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useLatestMeterReading", () => {
    it("devolve a potência do balde mais recente entre os retornados", async () => {
        mockedList.mockResolvedValue({
            items: [
                { bucketStart: "2026-07-15T12:00:00.000Z", avgPowerW: 500 },
                { bucketStart: "2026-07-15T12:02:00.000Z", avgPowerW: 900 },
                { bucketStart: "2026-07-15T12:01:00.000Z", avgPowerW: 700 },
            ],
            granularity: "minute",
        })

        const { result } = renderWithQueryClient(true)

        await waitFor(() => expect(result.current.data).toBe(900))
    })

    // TanStack Query trata `undefined` vindo do queryFn como erro de
    // contrato ("Query data cannot be undefined") — sem items persistidos,
    // o hook precisa devolver `null`, nunca deixar o queryFn resolver
    // undefined.
    it("sem baldes no período, devolve null (não undefined)", async () => {
        mockedList.mockResolvedValue({ items: [], granularity: "minute" })

        const { result } = renderWithQueryClient(true)

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toBeNull()
    })

    it("desabilitado, não chama o service", () => {
        renderWithQueryClient(false)

        expect(mockedList).not.toHaveBeenCalled()
    })
})
