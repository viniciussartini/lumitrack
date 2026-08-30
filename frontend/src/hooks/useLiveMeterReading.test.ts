import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useLiveMeterReading } from "@/hooks/useLiveMeterReading"
import { useRealtime } from "@/contexts/RealtimeContext"
import type { ReadingPayload } from "@/lib/sse/appStream"

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtime: vi.fn(),
}))

const mockedUseRealtime = vi.mocked(useRealtime)

const READING_1: ReadingPayload = {
    meterId: "meter-1",
    voltage: 220,
    current: 5,
    powerW: 1100,
    powerFactor: 0.95,
    receivedAt: "2026-07-15T12:00:00.000Z",
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(READING_1.receivedAt))
})

afterEach(() => {
    vi.useRealTimers()
})

describe("useLiveMeterReading", () => {
    it("sem leitura para o medidor, começa (e permanece) obsoleta", () => {
        mockedUseRealtime.mockReturnValue({ readingsByMeterId: {}, isConnected: true })

        const { result } = renderHook(() => useLiveMeterReading("meter-1"))

        expect(result.current.reading).toBeUndefined()
        expect(result.current.isStale).toBe(true)
    })

    it("leitura recém-chegada não é obsoleta", () => {
        mockedUseRealtime.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
            isConnected: true,
        })

        const { result } = renderHook(() => useLiveMeterReading("meter-1"))

        expect(result.current.reading).toBe(READING_1)
        expect(result.current.isStale).toBe(false)
    })

    it("fica obsoleta exatamente 10s depois de receivedAt, sem re-render antes disso", () => {
        mockedUseRealtime.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
            isConnected: true,
        })

        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount++
            return useLiveMeterReading("meter-1")
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
        mockedUseRealtime.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
            isConnected: true,
        })

        const { result, rerender } = renderHook(
            ({ id }: { id: string }) => useLiveMeterReading(id),
            {
                initialProps: { id: "meter-1" },
            },
        )

        act(() => {
            vi.advanceTimersByTime(8_000)
        })
        expect(result.current.isStale).toBe(false)

        const READING_2: ReadingPayload = { ...READING_1, receivedAt: new Date().toISOString() }
        mockedUseRealtime.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_2 },
            isConnected: true,
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
        mockedUseRealtime.mockReturnValue({
            readingsByMeterId: { "meter-1": READING_1 },
            isConnected: true,
        })

        const { unmount } = renderHook(() => useLiveMeterReading("meter-1"))
        unmount()

        expect(() => {
            act(() => {
                vi.advanceTimersByTime(20_000)
            })
        }).not.toThrow()
    })
})
