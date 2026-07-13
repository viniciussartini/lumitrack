import { describe, expect, it } from "vitest"
import { ANOMALY_WINDOWS, anomalyMultiplierAt } from "./anomalies.js"

describe("anomalyMultiplierAt", () => {
    it("retorna 1 fora de qualquer janela", () => {
        const farBefore = new Date(ANOMALY_WINDOWS[0]!.startUtc.getTime() - 60_000)
        expect(anomalyMultiplierAt(ANOMALY_WINDOWS[0]!.meterKey, farBefore)).toBe(1)
    })

    it.each(ANOMALY_WINDOWS)(
        "aplica o multiplicador configurado durante toda a janela ($meterKey, %s)",
        (window) => {
            for (let i = 0; i < window.durationMinutes; i++) {
                const at = new Date(window.startUtc.getTime() + i * 60_000)
                expect(anomalyMultiplierAt(window.meterKey, at)).toBe(window.multiplier)
            }
        },
    )

    it("o multiplicador cessa exatamente no minuto seguinte ao fim da janela", () => {
        const window = ANOMALY_WINDOWS[0]!
        const afterEnd = new Date(window.startUtc.getTime() + window.durationMinutes * 60_000)
        expect(anomalyMultiplierAt(window.meterKey, afterEnd)).toBe(1)
    })

    it("janelas de um medidor não afetam outro medidor no mesmo instante", () => {
        const window = ANOMALY_WINDOWS.find((w) => w.meterKey === "residential")!
        const otherKey = ANOMALY_WINDOWS.find((w) => w.meterKey !== "residential")!.meterKey
        expect(anomalyMultiplierAt(otherKey, window.startUtc)).toBe(1)
    })

    it("são exatamente 6 janelas, 2 por medidor alertável", () => {
        expect(ANOMALY_WINDOWS).toHaveLength(6)
        const byMeter = new Map<string, number>()
        for (const w of ANOMALY_WINDOWS) byMeter.set(w.meterKey, (byMeter.get(w.meterKey) ?? 0) + 1)
        expect([...byMeter.values()]).toEqual([2, 2, 2])
    })
})
