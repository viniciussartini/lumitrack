import { describe, it, expect } from "vitest"
import { buildComparisonStats, buildComparisonVariation } from "@/lib/periodComparisonDiff"
import { formatVoltageRms } from "@/lib/format"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import type {
    MeterReadingComparePeriodsResponse,
    MeterReadingPeriodDiff,
    MeterReadingPeriodSummary,
} from "@/types/meterReadingSeries.types"

const RUN: PeriodComparisonRun = {
    target: { key: "PROPERTY:p", targetType: "PROPERTY", targetId: "p", label: "Casa" },
    metric: "tensao",
    aStart: "2026-01-01",
    aEnd: "2026-01-07",
    bStart: "2026-02-01",
    bEnd: "2026-02-07",
}

const EMPTY: MeterReadingPeriodSummary = { min: null, avg: null, max: null }

const response = (
    summaryA: MeterReadingPeriodSummary,
    summaryB: MeterReadingPeriodSummary,
    diff: MeterReadingPeriodDiff,
): MeterReadingComparePeriodsResponse => ({
    metric: "tensao",
    granularity: "day",
    periodA: { from: "", to: "", items: [], summary: summaryA },
    periodB: { from: "", to: "", items: [], summary: summaryB },
    diff,
})

describe("buildComparisonVariation", () => {
    it("B acima de A: sinal +, vírgula decimal, tom de alerta e nota", () => {
        expect(buildComparisonVariation({ absolute: 11, percent: 5.04 })).toEqual({
            text: "+5,0%",
            toneClass: "text-status-danger",
            note: "Período B acima do período A.",
        })
    })

    it("B abaixo de A: sinal − (menos tipográfico), tom de sucesso e nota", () => {
        expect(buildComparisonVariation({ absolute: -20, percent: -12.34 })).toEqual({
            text: "−12,3%",
            toneClass: "text-status-success",
            note: "Período B abaixo do período A.",
        })
    })

    it("dentro da tolerância de 1%: neutro, dizendo que os períodos são equivalentes", () => {
        expect(buildComparisonVariation({ absolute: 0.5, percent: 0.4 })).toEqual({
            text: "+0,4%",
            toneClass: "text-muted",
            note: "Períodos equivalentes (variação de até 1%).",
        })
    })

    it("variação que arredonda para zero fica sem sinal, nunca '−0,0%'", () => {
        expect(buildComparisonVariation({ absolute: -0.09, percent: -0.04 }).text).toBe("0,0%")
        expect(buildComparisonVariation({ absolute: 0.09, percent: 0.04 }).text).toBe("0,0%")
        expect(buildComparisonVariation({ absolute: 0, percent: 0 }).text).toBe("0,0%")
    })

    it("um dos períodos sem dado da grandeza: travessão neutro, sem inventar variação", () => {
        expect(buildComparisonVariation({ absolute: null, percent: null })).toEqual({
            text: "-",
            toneClass: "text-muted",
            note: "Sem dados da grandeza em um dos períodos.",
        })
    })

    it("média de A zero: absoluta existe, percentual não se aplica", () => {
        expect(buildComparisonVariation({ absolute: 10, percent: null })).toEqual({
            text: "-",
            toneClass: "text-muted",
            note: "A média do período A é zero; a variação percentual não se aplica.",
        })
    })
})

describe("buildComparisonStats", () => {
    it("médias, diferença absoluta, picos e dias por período, formatados com a grandeza", () => {
        const stats = buildComparisonStats(
            RUN,
            response(
                { min: 200, avg: 220, max: 240 },
                { min: 205, avg: 231, max: 250 },
                { absolute: 11, percent: 5 },
            ),
            formatVoltageRms,
        )

        expect(stats.map((stat) => [stat.label, stat.value])).toEqual([
            ["Média período A", "220,00V"],
            ["Média período B", "231,00V"],
            ["Diferença absoluta", "+11,00V"],
            ["Pico período A", "240,00V"],
            ["Pico período B", "250,00V"],
            ["Dias por período", "7 dias"],
        ])
    })

    it("diferença negativa leva o menos tipográfico; zero, sem sinal", () => {
        const negative = buildComparisonStats(
            RUN,
            response(EMPTY, EMPTY, { absolute: -3.5, percent: -1.6 }),
            formatVoltageRms,
        )
        const zero = buildComparisonStats(
            RUN,
            response(EMPTY, EMPTY, { absolute: 0, percent: 0 }),
            formatVoltageRms,
        )

        expect(negative.find((s) => s.label === "Diferença absoluta")!.value).toBe("−3,50V")
        expect(zero.find((s) => s.label === "Diferença absoluta")!.value).toBe("0,00V")
    })

    it("valores ausentes viram travessão, nunca zero", () => {
        const stats = buildComparisonStats(
            RUN,
            response(EMPTY, EMPTY, { absolute: null, percent: null }),
            formatVoltageRms,
        )

        const values = stats
            .filter((stat) => stat.label !== "Dias por período")
            .map((stat) => stat.value)
        expect(values).toEqual(["-", "-", "-", "-", "-"])
    })

    it("período de um dia usa o singular", () => {
        const stats = buildComparisonStats(
            { ...RUN, aEnd: "2026-01-01", bEnd: "2026-02-01" },
            response(EMPTY, EMPTY, { absolute: null, percent: null }),
            formatVoltageRms,
        )

        expect(stats.at(-1)).toMatchObject({ label: "Dias por período", value: "1 dia" })
    })
})
