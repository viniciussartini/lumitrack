import { describe, expect, it } from "vitest"
import {
    buildDemandSeries,
    describeContracted,
    describeExceedance,
    formatDemandKw,
    peakBand,
} from "@/lib/demandOverview"
import type { DemandPoint } from "@/types/demand.types"

// Meia-noite de São Paulo (UTC-3) de 16/10/2026; a janela `block` termina em :14, :29, :44 ou :59.
const DAY_START = Date.UTC(2026, 9, 16, 3, 0)
const point = (block: number, override: Partial<DemandPoint> = {}): DemandPoint => ({
    windowEnd: new Date(DAY_START + (block * 15 + 14) * 60_000).toISOString(),
    kw: 100,
    post: "OFF_PEAK",
    contractedKw: 200,
    ...override,
})

describe("formatDemandKw", () => {
    it("usa uma casa decimal quando precisa e vírgula pt-BR", () => {
        expect(formatDemandKw(150)).toBe("150 kW")
        expect(formatDemandKw(150.46)).toBe("150,5 kW")
        expect(formatDemandKw(1500)).toBe("1.500 kW")
    })

    it("sem medição é '-', nunca 0 kW", () => {
        expect(formatDemandKw(null)).toBe("-")
    })

    it("zero de verdade é 0 kW", () => {
        expect(formatDemandKw(0)).toBe("0 kW")
    })
})

describe("describeContracted", () => {
    it("Verde tem uma demanda só", () => {
        expect(describeContracted([{ post: null, kw: 200 }])).toBe("200 kW")
    })

    it("Azul mostra a de ponta e a de fora de ponta", () => {
        expect(
            describeContracted([
                { post: "PEAK", kw: 150 },
                { post: "OFF_PEAK", kw: 250 },
            ]),
        ).toBe("Ponta 150 · Fora 250 kW")
    })
})

describe("describeExceedance", () => {
    it("acima da contratada mostra o percentual, em perigo", () => {
        expect(describeExceedance(15)).toEqual({ label: "+15,0%", tone: "danger" })
    })

    it("sem estouro diz 'sem ultrapassagem', em sucesso", () => {
        expect(describeExceedance(0)).toEqual({ label: "sem ultrapassagem", tone: "success" })
    })

    it("sem janela medida é '-' e neutro", () => {
        expect(describeExceedance(null)).toEqual({ label: "-", tone: "muted" })
    })
})

describe("buildDemandSeries", () => {
    it("posiciona cada janela pelo início, em minutos do dia local, com o intervalo no rótulo", () => {
        const series = buildDemandSeries([point(0), point(48), point(95)])

        expect(series.map((entry) => [entry.x, entry.range])).toEqual([
            [0, "00:00–00:15"],
            [720, "12:00–12:15"],
            [1425, "23:45–00:00"],
        ])
    })

    it("mantém a ausência e a contratada de cada janela", () => {
        const [entry] = buildDemandSeries([point(4, { kw: null, contractedKw: 150 })])

        expect(entry).toMatchObject({ kw: null, contractedKw: 150 })
    })
})

describe("peakBand", () => {
    it("vai do início da primeira janela de ponta ao fim da última", () => {
        const points = Array.from({ length: 96 }, (_, block) =>
            point(block, { post: block >= 72 && block < 84 ? "PEAK" : "OFF_PEAK" }),
        )

        expect(peakBand(buildDemandSeries(points))).toEqual({ from: 1080, to: 1260 })
    })

    it("sem janela de ponta (fim de semana, feriado, sem posto) não há faixa", () => {
        const offPeak = Array.from({ length: 96 }, (_, block) => point(block))
        const noPost = Array.from({ length: 96 }, (_, block) => point(block, { post: null }))

        expect(peakBand(buildDemandSeries(offPeak))).toBeNull()
        expect(peakBand(buildDemandSeries(noPost))).toBeNull()
    })
})
