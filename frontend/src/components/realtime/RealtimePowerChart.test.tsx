import { describe, it, expect } from "vitest"
import { Profiler, useState } from "react"
import { act, render } from "@testing-library/react"
import { RealtimePowerChart } from "@/components/realtime/RealtimePowerChart"
import type { PowerBucket } from "@/lib/realtimePowerBuckets"

const buckets: PowerBucket[] = [
    { bucketStart: new Date("2026-01-01T10:00:00Z").getTime(), kw: 1.2 },
    { bucketStart: new Date("2026-01-01T10:01:00Z").getTime(), kw: 1.4 },
]

/**
 * `RealtimeChartCard` re-renderiza a cada leitura SSE mesmo quando o
 * histórico agregado (`buckets`) não muda entre commits — prova que o React
 * Compiler já elimina a reconciliação redundante do recharts sem precisar
 * de `React.memo` explícito no componente.
 */
describe("RealtimePowerChart — memoização automática", () => {
    it("não re-renderiza quando o pai re-renderiza por um estado não relacionado, com `buckets` na mesma referência", () => {
        let renderCount = 0
        const onRender = () => {
            renderCount++
        }

        const Wrapper = () => {
            const [, setTick] = useState(0)
            return (
                <div>
                    <button onClick={() => setTick((t) => t + 1)}>tick</button>
                    <Profiler id="realtime-power-chart" onRender={onRender}>
                        <RealtimePowerChart buckets={buckets} />
                    </Profiler>
                </div>
            )
        }

        const { getByRole } = render(<Wrapper />)
        expect(renderCount).toBe(1)

        act(() => getByRole("button").click())
        act(() => getByRole("button").click())
        act(() => getByRole("button").click())

        expect(renderCount).toBe(1)
    })

    it("re-renderiza quando `buckets` muda de fato", () => {
        let renderCount = 0
        const onRender = () => {
            renderCount++
        }
        const nextBuckets: PowerBucket[] = [{ bucketStart: buckets[0]!.bucketStart, kw: 2.5 }]

        const { rerender } = render(
            <Profiler id="realtime-power-chart" onRender={onRender}>
                <RealtimePowerChart buckets={buckets} />
            </Profiler>,
        )
        expect(renderCount).toBe(1)

        rerender(
            <Profiler id="realtime-power-chart" onRender={onRender}>
                <RealtimePowerChart buckets={nextBuckets} />
            </Profiler>,
        )
        expect(renderCount).toBe(2)
    })
})
