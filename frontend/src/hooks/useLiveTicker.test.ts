import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useLiveTicker } from "@/hooks/useLiveTicker"

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe("useLiveTicker", () => {
    it("começa em 3.42 kWh e com o custo correspondente a 0.638/kWh", () => {
        const { result } = renderHook(() => useLiveTicker())

        expect(result.current.kwh).toBeCloseTo(3.42)
        expect(result.current.cost).toBeCloseTo(3.42 * 0.638)
    })

    it("varia o valor a cada 1500ms, sem passar do intervalo [2.4, 4.6]", () => {
        const { result } = renderHook(() => useLiveTicker())
        const initialKwh = result.current.kwh

        act(() => {
            vi.advanceTimersByTime(1500)
        })

        expect(result.current.kwh).not.toBe(initialKwh)
        expect(result.current.kwh).toBeGreaterThanOrEqual(2.4)
        expect(result.current.kwh).toBeLessThanOrEqual(4.6)

        act(() => {
            for (let i = 0; i < 50; i++) {
                vi.advanceTimersByTime(1500)
            }
        })

        expect(result.current.kwh).toBeGreaterThanOrEqual(2.4)
        expect(result.current.kwh).toBeLessThanOrEqual(4.6)
        expect(result.current.cost).toBeCloseTo(result.current.kwh * 0.638)
    })

    it("para o timer ao desmontar", () => {
        const { unmount, result } = renderHook(() => useLiveTicker())
        const kwhAtUnmount = result.current.kwh

        unmount()

        act(() => {
            vi.advanceTimersByTime(15_000)
        })

        expect(result.current.kwh).toBe(kwhAtUnmount)
    })
})
