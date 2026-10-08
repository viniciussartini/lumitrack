import { describe, it, expect } from "vitest"
import { contractedKwForPost, worstExceedancePercent } from "@/modules/demand/demand-overview.js"
import type { MeterDemandRollupResponse } from "@/modules/meter/meter-demand-rollup.repository.js"

const rollup = (
    post: MeterDemandRollupResponse["post"],
    maxAvgPowerW: number,
    windowEndAt = new Date("2026-10-10T20:00:00Z"),
): MeterDemandRollupResponse => ({
    meterId: "meter-1",
    periodStart: new Date("2026-10-01T03:00:00Z"),
    post,
    maxAvgPowerW,
    windowEndAt,
})

describe("worstExceedancePercent", () => {
    const verde = [{ post: null, contractedDemandKw: 100 }]
    const azul = [
        { post: "PEAK" as const, contractedDemandKw: 100 },
        { post: "OFF_PEAK" as const, contractedDemandKw: 200 },
    ]

    it("Verde: o quanto a maior demanda medida passa da contratada", () => {
        const rows = [rollup("OFF_PEAK", 90_000), rollup("PEAK", 110_000)]

        expect(worstExceedancePercent(verde, rows)).toBeCloseTo(10)
    })

    it("dentro da contratada não há ultrapassagem: 0, que a tela mostra como 'sem ultrapassagem'", () => {
        expect(worstExceedancePercent(verde, [rollup("PEAK", 100_000)])).toBe(0)
        expect(worstExceedancePercent(verde, [rollup("PEAK", 80_000)])).toBe(0)
    })

    it("Azul: cada posto contra a contratada dele, valendo o pior estouro", () => {
        // ponta passa 20% de 100; fora de ponta (150 de 200) não passa
        const rows = [rollup("PEAK", 120_000), rollup("OFF_PEAK", 150_000)]

        expect(worstExceedancePercent(azul, rows)).toBeCloseTo(20)
    })

    it("Azul: um posto estourando não é compensado pelo outro folgado", () => {
        const rows = [rollup("PEAK", 50_000), rollup("OFF_PEAK", 250_000)]

        expect(worstExceedancePercent(azul, rows)).toBeCloseTo(25)
    })

    it("Azul com medição de um posto só usa o que existe", () => {
        expect(worstExceedancePercent(azul, [rollup("PEAK", 130_000)])).toBeCloseTo(30)
    })

    it("sem nenhuma janela medida é ausência, não 0%", () => {
        expect(worstExceedancePercent(verde, [])).toBeNull()
        expect(worstExceedancePercent(azul, [])).toBeNull()
    })
})

describe("contractedKwForPost", () => {
    it("Verde tem uma demanda só, válida em qualquer posto", () => {
        const verde = [{ post: null, contractedDemandKw: 100 }]

        expect(contractedKwForPost(verde, null)).toBe(100)
        expect(contractedKwForPost(verde, "PEAK")).toBe(100)
    })

    it("Azul usa a contratada do posto da janela", () => {
        const azul = [
            { post: "PEAK" as const, contractedDemandKw: 100 },
            { post: "OFF_PEAK" as const, contractedDemandKw: 200 },
        ]

        expect(contractedKwForPost(azul, "PEAK")).toBe(100)
        expect(contractedKwForPost(azul, "OFF_PEAK")).toBe(200)
    })
})
