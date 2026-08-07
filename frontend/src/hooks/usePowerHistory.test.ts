import { describe, it, expect } from "vitest"
import { renderHook } from "@testing-library/react"
import { usePowerHistory } from "@/hooks/usePowerHistory"
import type { ReadingPayload } from "@/lib/sse/appStream"

const reading = (receivedAt: string, powerW: number): ReadingPayload => ({
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW,
    powerFactor: 0.98,
    receivedAt,
})

describe("usePowerHistory", () => {
    it("começa vazio quando não há leitura", () => {
        const { result } = renderHook(() => usePowerHistory(undefined))
        expect(result.current).toEqual([])
    })

    it("acumula pontos e não duplica em re-render sem leitura nova", () => {
        const r1 = reading("2026-08-03T10:00:00.000Z", 1000)

        const { result, rerender } = renderHook(
            ({ reading }: { reading: ReadingPayload | undefined }) => usePowerHistory(reading),
            { initialProps: { reading: r1 } },
        )

        expect(result.current).toHaveLength(1)
        expect(result.current[0]).toMatchObject({
            t: new Date(r1.receivedAt).getTime(),
            kw: 1,
        })

        // Re-render com a MESMA leitura (mesmo receivedAt) — não duplica.
        rerender({ reading: r1 })
        expect(result.current).toHaveLength(1)

        // Leitura nova (receivedAt diferente) — acumula um segundo ponto.
        const r2 = reading("2026-08-03T10:00:02.000Z", 2000)
        rerender({ reading: r2 })
        expect(result.current).toHaveLength(2)
        expect(result.current[1]).toMatchObject({
            t: new Date(r2.receivedAt).getTime(),
            kw: 2,
        })
    })

    it("poda pontos com mais de 24h em relação ao ponto mais novo", () => {
        const old = reading("2026-08-01T00:00:00.000Z", 1000)
        const recent = reading("2026-08-03T01:00:00.000Z", 1500) // > 24h depois

        const { result, rerender } = renderHook(
            ({ reading }: { reading: ReadingPayload | undefined }) => usePowerHistory(reading),
            { initialProps: { reading: old } },
        )
        expect(result.current).toHaveLength(1)

        rerender({ reading: recent })

        expect(result.current).toHaveLength(1)
        expect(result.current[0]).toMatchObject({
            t: new Date(recent.receivedAt).getTime(),
            kw: 1.5,
        })
    })
})
