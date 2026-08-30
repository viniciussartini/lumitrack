import { describe, it, expect } from "vitest"
import { Profiler, useState } from "react"
import { act, render } from "@testing-library/react"
import { ConsumptionChart } from "@/components/consumption/ConsumptionChart"
import type { ConsumptionBucket } from "@/types/consumption.types"

const buckets: ConsumptionBucket[] = [
    { bucketStart: "2026-01-01T10:00:00Z", kwhConsumed: 1.2, costBrl: 0.8, avgPowerW: 300 },
    { bucketStart: "2026-01-01T11:00:00Z", kwhConsumed: 1.4, costBrl: 0.9, avgPowerW: 320 },
]

/**
 * Mesma prova de `RealtimePowerChart.test.tsx`: o React Compiler já elimina
 * a reconciliação redundante do recharts quando `buckets`/`bucketSize` não
 * mudam entre commits, sem precisar de `React.memo` explícito no
 * componente.
 */
describe("ConsumptionChart — memoização automática", () => {
    it("não re-renderiza quando o pai re-renderiza por um estado não relacionado, com props na mesma referência", () => {
        let renderCount = 0
        const onRender = () => {
            renderCount++
        }

        const Wrapper = () => {
            const [, setTick] = useState(0)
            return (
                <div>
                    <button onClick={() => setTick((t) => t + 1)}>tick</button>
                    <Profiler id="consumption-chart" onRender={onRender}>
                        <ConsumptionChart buckets={buckets} bucketSize="hour" />
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
        const nextBuckets: ConsumptionBucket[] = [
            { bucketStart: "2026-01-01T12:00:00Z", kwhConsumed: 2.1, costBrl: 1.4, avgPowerW: 340 },
        ]

        const { rerender } = render(
            <Profiler id="consumption-chart" onRender={onRender}>
                <ConsumptionChart buckets={buckets} bucketSize="hour" />
            </Profiler>,
        )
        expect(renderCount).toBe(1)

        rerender(
            <Profiler id="consumption-chart" onRender={onRender}>
                <ConsumptionChart buckets={nextBuckets} bucketSize="hour" />
            </Profiler>,
        )
        expect(renderCount).toBe(2)
    })
})
