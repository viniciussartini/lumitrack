import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import { useLatestMeterReading } from "@/hooks/queries/useLatestMeterReading"
import type { ReadingPayload } from "@/lib/sse/appStream"

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtimeReadings: vi.fn(),
}))

vi.mock("@/hooks/queries/useLatestMeterReading", () => ({
    useLatestMeterReading: vi.fn(),
}))

const mockedUseRealtimeReadings = vi.mocked(useRealtimeReadings)
const mockedUseLatestMeterReading = vi.mocked(useLatestMeterReading)

const mockFallback = (data: number | undefined) =>
    mockedUseLatestMeterReading.mockReturnValue({
        data,
    } as ReturnType<typeof useLatestMeterReading>)

const READING_1: ReadingPayload = {
    meterId: "meter-1",
    voltage: 220,
    current: 5,
    powerW: 1100,
    powerFactor: 0.95,
    receivedAt: "2026-07-15T12:00:00.000Z",
}

const renderLiveReading = (meterId: string | undefined) =>
    renderHook(() => useLiveMeterReading("PROPERTY", "prop-1", meterId))

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(READING_1.receivedAt))
    mockFallback(undefined)
})

afterEach(() => {
    vi.useRealTimers()
})

describe("useLiveMeterReading", () => {
    it("sem leitura para o medidor, começa (e permanece) obsoleta", () => {
        mockedUseRealtimeReadings.mockReturnValue({ readingsByMeterId: {} })

        const { result } = renderLiveReading("meter-1")

        expect(result.current.reading).toBeUndefined()
        expect(result.current.isStale).toBe(true)
    })

    it("leitura recém-chegada não é obsoleta", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })

        const { result } = renderLiveReading("meter-1")

        expect(result.current.reading).toBe(READING_1)
        expect(result.current.isStale).toBe(false)
    })

    it("fica obsoleta exatamente 10s depois de receivedAt, sem re-render antes disso", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })

        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount++
            return useLiveMeterReading("PROPERTY", "prop-1", "meter-1")
        })

        expect(result.current.isStale).toBe(false)
        const rendersOnMount = renderCount

        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(result.current.isStale).toBe(false)
        expect(renderCount).toBe(rendersOnMount)

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(result.current.isStale).toBe(true)
        expect(renderCount).toBe(rendersOnMount + 1)
    })

    it("uma leitura nova do mesmo medidor reagenda a expiração", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })

        const { result, rerender } = renderHook(
            ({ id }: { id: string }) => useLiveMeterReading("PROPERTY", "prop-1", id),
            { initialProps: { id: "meter-1" } },
        )

        act(() => {
            vi.advanceTimersByTime(8_000)
        })
        expect(result.current.isStale).toBe(false)

        const READING_2: ReadingPayload = { ...READING_1, receivedAt: new Date().toISOString() }
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_2 },
        })
        rerender({ id: "meter-1" })

        // Sem reagendamento, a leitura antiga expiraria em +2s a partir daqui
        // (10s completos desde READING_1) — passar disso e continuar fresca
        // só é possível se o timer tiver sido recalculado a partir de READING_2.
        act(() => {
            vi.advanceTimersByTime(2_001)
        })
        expect(result.current.isStale).toBe(false)

        act(() => {
            vi.advanceTimersByTime(8_000)
        })
        expect(result.current.isStale).toBe(true)
    })

    it("limpa o timer ao desmontar", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })

        const { unmount } = renderLiveReading("meter-1")
        unmount()

        expect(() => {
            act(() => {
                vi.advanceTimersByTime(20_000)
            })
        }).not.toThrow()
    })
})

describe("useLiveMeterReading — fallback REST de potência", () => {
    it("usa a potência da leitura SSE quando ela está fresca, ignorando o fallback", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })
        mockFallback(9999)

        const { result } = renderLiveReading("meter-1")

        expect(result.current.lastKnownPowerW).toBe(READING_1.powerW)
    })

    it("usa o fallback REST quando não há leitura SSE — aba recém-aberta", () => {
        mockedUseRealtimeReadings.mockReturnValue({ readingsByMeterId: {} })
        mockFallback(850)

        const { result } = renderLiveReading("meter-1")

        expect(result.current.reading).toBeUndefined()
        expect(result.current.lastKnownPowerW).toBe(850)
    })

    it("sem leitura SSE e sem fallback disponível, fica undefined (não inventa dado)", () => {
        mockedUseRealtimeReadings.mockReturnValue({ readingsByMeterId: {} })
        mockFallback(undefined)

        const { result } = renderLiveReading("meter-1")

        expect(result.current.lastKnownPowerW).toBeUndefined()
    })

    it("desabilita o fallback assim que a leitura SSE está fresca, e reabilita se ela ficar obsoleta", () => {
        mockedUseRealtimeReadings.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
        })

        renderLiveReading("meter-1")
        expect(mockedUseLatestMeterReading).toHaveBeenLastCalledWith("PROPERTY", "prop-1", false)

        act(() => {
            vi.advanceTimersByTime(10_001)
        })
        expect(mockedUseLatestMeterReading).toHaveBeenLastCalledWith("PROPERTY", "prop-1", true)
    })
})
