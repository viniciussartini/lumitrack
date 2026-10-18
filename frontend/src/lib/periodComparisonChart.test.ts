import { describe, it, expect } from "vitest"
import {
    buildComparisonChartPoints,
    formatComparisonPeriodLabel,
} from "@/lib/periodComparisonChart"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import type {
    MeterReadingComparePeriodsResponse,
    MeterReadingSeriesBucket,
} from "@/types/meterReadingSeries.types"

const bucket = (avg: number | null): MeterReadingSeriesBucket => ({
    bucketStart: "2026-01-01T03:00:00.000Z",
    min: avg,
    avg,
    max: avg,
})

const RUN: PeriodComparisonRun = {
    target: { key: "PROPERTY:p", targetType: "PROPERTY", targetId: "p", label: "Casa" },
    metric: "tensao",
    aStart: "2026-01-30",
    aEnd: "2026-02-01",
    bStart: "2026-03-01",
    bEnd: "2026-03-03",
}

const response = (
    granularity: "hour" | "day",
    itemsA: MeterReadingSeriesBucket[],
    itemsB: MeterReadingSeriesBucket[],
): MeterReadingComparePeriodsResponse => ({
    metric: "tensao",
    granularity,
    periodA: {
        from: "",
        to: "",
        items: itemsA,
        summary: { min: null, avg: null, max: null },
    },
    periodB: {
        from: "",
        to: "",
        items: itemsB,
        summary: { min: null, avg: null, max: null },
    },
    diff: { absolute: null, percent: null },
})

describe("formatComparisonPeriodLabel", () => {
    it("legenda 'A · início – fim' em pt-BR", () => {
        expect(formatComparisonPeriodLabel("A", "2026-01-01", "2026-01-07")).toBe(
            "A · 01/01/2026 – 07/01/2026",
        )
        expect(formatComparisonPeriodLabel("B", "2026-02-01", "2026-02-07")).toBe(
            "B · 01/02/2026 – 07/02/2026",
        )
    })
})

describe("buildComparisonChartPoints", () => {
    it("granularidade dia: um ponto por dia, rótulo por posição e a data real de cada período", () => {
        const points = buildComparisonChartPoints(
            RUN,
            response(
                "day",
                [bucket(220), bucket(221), bucket(222)],
                [bucket(218), bucket(219), bucket(220)],
            ),
        )

        expect(points).toEqual([
            { label: "Dia 1", valueA: 220, valueB: 218, dateA: "30/01/2026", dateB: "01/03/2026" },
            { label: "Dia 2", valueA: 221, valueB: 219, dateA: "31/01/2026", dateB: "02/03/2026" },
            { label: "Dia 3", valueA: 222, valueB: 220, dateA: "01/02/2026", dateB: "03/03/2026" },
        ])
    })

    it("granularidade hora: rótulo 'HHh' e a data do único dia de cada período", () => {
        const singleDay: PeriodComparisonRun = {
            ...RUN,
            aStart: "2026-01-10",
            aEnd: "2026-01-10",
            bStart: "2026-02-10",
            bEnd: "2026-02-10",
        }
        const hours = Array.from({ length: 24 }, (_, i) => bucket(200 + i))

        const points = buildComparisonChartPoints(singleDay, response("hour", hours, hours))

        expect(points).toHaveLength(24)
        expect(points[0]).toMatchObject({ label: "00h", dateA: "10/01/2026", dateB: "10/02/2026" })
        expect(points[23]).toMatchObject({ label: "23h", valueA: 223 })
    })

    it("balde sem leitura vira null (lacuna no traçado), nunca 0", () => {
        const points = buildComparisonChartPoints(
            RUN,
            response(
                "day",
                [bucket(null), bucket(221), bucket(222)],
                [bucket(218), bucket(null), bucket(220)],
            ),
        )

        expect(points[0]!.valueA).toBeNull()
        expect(points[1]!.valueB).toBeNull()
    })

    it("sem baldes em um dos lados: o outro segue plotado, com null no lado vazio", () => {
        const points = buildComparisonChartPoints(RUN, response("day", [bucket(220)], []))

        expect(points).toEqual([
            { label: "Dia 1", valueA: 220, valueB: null, dateA: "30/01/2026", dateB: "01/03/2026" },
        ])
    })
})
