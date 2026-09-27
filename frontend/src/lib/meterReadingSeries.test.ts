import { describe, it, expect } from "vitest"
import {
    AGGREGATION_OPTIONS,
    SERIES_METRICS,
    buildSeriesBucketLabel,
    buildSeriesChartPoints,
    buildSeriesTableRows,
    formatSeriesRunLabel,
    getSeriesMetricDefinition,
    type SeriesRun,
} from "@/lib/meterReadingSeries"
import type { MeterReadingSeriesBucket } from "@/types/meterReadingSeries.types"

describe("SERIES_METRICS / getSeriesMetricDefinition", () => {
    it("expõe as 9 chaves do design, na mesma ordem do backend", () => {
        expect(SERIES_METRICS.map((m) => m.value)).toEqual([
            "tensao",
            "corrente",
            "pativa",
            "preativa",
            "paparente",
            "fp",
            "thdv",
            "thdi",
            "freq",
        ])
    })

    it("formata cada grandeza com a mesma convenção usada nos cards ao vivo", () => {
        expect(getSeriesMetricDefinition("tensao").format(219)).toBe("219,00V")
        expect(getSeriesMetricDefinition("pativa").format(2200)).toBe("2,20kW")
        expect(getSeriesMetricDefinition("fp").format(0.95)).toBe("0,95")
        expect(getSeriesMetricDefinition("thdv").format(2.6)).toBe("2,60%")
        expect(getSeriesMetricDefinition("freq").format(59.98)).toBe("59,98Hz")
    })
})

describe("AGGREGATION_OPTIONS", () => {
    it("expõe as 4 agregações do critério de aceite", () => {
        expect(AGGREGATION_OPTIONS.map((a) => a.value)).toEqual([1, 5, 15, 30])
    })
})

describe("buildSeriesBucketLabel", () => {
    it("window=dia: rótulo é a hora do dia (00h..23h) pelo índice do balde", () => {
        const run: SeriesRun = { window: "dia", day: "2026-01-15", metric: "tensao" }
        expect(buildSeriesBucketLabel(run, 0)).toBe("00h")
        expect(buildSeriesBucketLabel(run, 14)).toBe("14h")
        expect(buildSeriesBucketLabel(run, 23)).toBe("23h")
    })

    it("window=hora: rótulo é HH:MM a partir da hora escolhida e da agregação", () => {
        const run: SeriesRun = {
            window: "hora",
            day: "2026-01-15",
            hour: 14,
            aggregationMinutes: 5,
            metric: "tensao",
        }
        expect(buildSeriesBucketLabel(run, 0)).toBe("14:00")
        expect(buildSeriesBucketLabel(run, 1)).toBe("14:05")
        expect(buildSeriesBucketLabel(run, 11)).toBe("14:55")
    })
})

describe("buildSeriesTableRows", () => {
    const run: SeriesRun = { window: "dia", day: "2026-01-15", metric: "tensao" }

    it("formata min/média/máximo com a unidade da grandeza escolhida", () => {
        const items: MeterReadingSeriesBucket[] = [
            { bucketStart: "2026-01-15T00:00:00.000Z", min: 218, avg: 220, max: 222 },
        ]
        const rows = buildSeriesTableRows(run, items)
        expect(rows).toEqual([{ label: "00h", min: "218,00V", avg: "220,00V", max: "222,00V" }])
    })

    it("balde sem nenhuma leitura vira '-' nas 3 colunas, nunca 0", () => {
        const items: MeterReadingSeriesBucket[] = [
            { bucketStart: "2026-01-15T00:00:00.000Z", min: null, avg: null, max: null },
        ]
        const rows = buildSeriesTableRows(run, items)
        expect(rows).toEqual([{ label: "00h", min: "-", avg: "-", max: "-" }])
    })
})

describe("buildSeriesChartPoints", () => {
    it("usa a média de cada balde como valor do ponto; balde nulo vira null (sem inventar 0)", () => {
        const run: SeriesRun = { window: "dia", day: "2026-01-15", metric: "tensao" }
        const items: MeterReadingSeriesBucket[] = [
            { bucketStart: "2026-01-15T00:00:00.000Z", min: 218, avg: 220, max: 222 },
            { bucketStart: "2026-01-15T01:00:00.000Z", min: null, avg: null, max: null },
        ]
        expect(buildSeriesChartPoints(run, items)).toEqual([
            { label: "00h", value: 220 },
            { label: "01h", value: null },
        ])
    })
})

describe("formatSeriesRunLabel", () => {
    it("window=dia: data + 'hora a hora'", () => {
        const run: SeriesRun = { window: "dia", day: "2026-01-15", metric: "tensao" }
        expect(formatSeriesRunLabel(run)).toBe("15/01/2026 · hora a hora")
    })

    it("window=hora: data + hora escolhida + label da agregação", () => {
        const run: SeriesRun = {
            window: "hora",
            day: "2026-01-15",
            hour: 14,
            aggregationMinutes: 5,
            metric: "tensao",
        }
        expect(formatSeriesRunLabel(run)).toBe("15/01/2026 · 14:00 · 5 minutos")
    })
})
