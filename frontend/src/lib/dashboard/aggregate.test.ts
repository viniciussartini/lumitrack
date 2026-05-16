import { describe, it, expect } from "vitest"
import {
    aggregateSummary,
    aggregateTrendBreakdown,
    aggregateTimeSeries,
    rankPropertiesByKwh,
    buildDashboardData,
} from "@/lib/dashboard/aggregate"
import type { DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportResult } from "@/types/report.types"
import type { ConsumptionRecord } from "@/types/consumption.types"

/**
 * Helpers de mock — mantém os testes legíveis sem boilerplate de
 * estruturas grandes em cada caso.
 */

const makeRecord = (overrides: Partial<ConsumptionRecord> = {}): ConsumptionRecord => ({
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "MONTHLY",
    referenceDate: "2025-01-01T00:00:00.000Z",
    kwhConsumed: 100,
    costBrl: 50,
    notes: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
})

const makeResult = (overrides: Partial<ReportResult> = {}): ReportResult => ({
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
    dateRange: null,
    summary: {
        totalKwh: 100,
        totalCostBrl: 50,
        recordCount: 1,
        avgKwhPerRecord: 100,
        trend: "STABLE",
    },
    records: [makeRecord()],
    ...overrides,
})

const makeEntry = (
    overrides: Partial<DashboardPropertyEntry> = {},
): DashboardPropertyEntry => ({
    propertyId: "prop-1",
    propertyName: "Casa",
    status: "success",
    result: makeResult(),
    error: null,
    ...overrides,
})

// ─────────────────────────────────────────────────────────────────────────────
// aggregateSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateSummary", () => {
    it("soma totalKwh, totalCostBrl e recordCount entre todas as entries de sucesso", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                result: makeResult({
                    summary: {
                        totalKwh: 100,
                        totalCostBrl: 50,
                        recordCount: 2,
                        avgKwhPerRecord: 50,
                        trend: "STABLE",
                    },
                }),
            }),
            makeEntry({
                propertyId: "p2",
                result: makeResult({
                    summary: {
                        totalKwh: 250.5,
                        totalCostBrl: 125.25,
                        recordCount: 3,
                        avgKwhPerRecord: 83.5,
                        trend: "INCREASING",
                    },
                }),
            }),
        ]

        const summary = aggregateSummary(entries)

        expect(summary.totalKwh).toBeCloseTo(350.5)
        expect(summary.totalCostBrl).toBeCloseTo(175.25)
        expect(summary.recordCount).toBe(5)
    })

    it("ignora entries com status='error' nos somatórios", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({
                propertyId: "p2",
                status: "error",
                result: null,
                error: "Falha de rede",
            }),
        ]

        const summary = aggregateSummary(entries)

        expect(summary.totalKwh).toBe(100)
        expect(summary.recordCount).toBe(1)
    })

    it("propertyCount inclui sucessos E erros", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({
                propertyId: "p2",
                status: "error",
                result: null,
                error: "Falha",
            }),
            makeEntry({ propertyId: "p3" }),
        ]

        expect(aggregateSummary(entries).propertyCount).toBe(3)
    })

    it("propertyWithDataCount só conta propriedades com recordCount > 0", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                result: makeResult({
                    summary: {
                        totalKwh: 0,
                        totalCostBrl: 0,
                        recordCount: 0,
                        avgKwhPerRecord: 0,
                        trend: "INSUFFICIENT_DATA",
                    },
                }),
            }),
            makeEntry({ propertyId: "p2" }), // tem 1 record
            makeEntry({
                propertyId: "p3",
                status: "error",
                result: null,
                error: "X",
            }),
        ]

        const summary = aggregateSummary(entries)
        expect(summary.propertyWithDataCount).toBe(1)
        expect(summary.propertyCount).toBe(3)
    })

    it("retorna zeros quando entries está vazia", () => {
        const summary = aggregateSummary([])

        expect(summary.totalKwh).toBe(0)
        expect(summary.totalCostBrl).toBe(0)
        expect(summary.recordCount).toBe(0)
        expect(summary.propertyCount).toBe(0)
        expect(summary.propertyWithDataCount).toBe(0)
        expect(summary.trendBreakdown).toEqual({
            increasing: 0,
            decreasing: 0,
            stable: 0,
            insufficient: 0,
        })
    })

    it("inclui trendBreakdown no summary", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                result: makeResult({
                    summary: {
                        totalKwh: 100,
                        totalCostBrl: 0,
                        recordCount: 2,
                        avgKwhPerRecord: 50,
                        trend: "INCREASING",
                    },
                }),
            }),
        ]

        const summary = aggregateSummary(entries)
        expect(summary.trendBreakdown.increasing).toBe(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// aggregateTrendBreakdown
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateTrendBreakdown", () => {
    it("conta cada trend separadamente", () => {
        const makeWithTrend = (
            id: string,
            trend: "INCREASING" | "DECREASING" | "STABLE" | "INSUFFICIENT_DATA",
        ): DashboardPropertyEntry =>
            makeEntry({
                propertyId: id,
                result: makeResult({
                    summary: {
                        totalKwh: 0,
                        totalCostBrl: 0,
                        recordCount: 0,
                        avgKwhPerRecord: 0,
                        trend,
                    },
                }),
            })

        const entries = [
            makeWithTrend("p1", "INCREASING"),
            makeWithTrend("p2", "INCREASING"),
            makeWithTrend("p3", "DECREASING"),
            makeWithTrend("p4", "STABLE"),
            makeWithTrend("p5", "INSUFFICIENT_DATA"),
            makeWithTrend("p6", "INSUFFICIENT_DATA"),
        ]

        const result = aggregateTrendBreakdown(entries)

        expect(result).toEqual({
            increasing: 2,
            decreasing: 1,
            stable: 1,
            insufficient: 2,
        })
    })

    it("NÃO conta entries com status='error'", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }), // STABLE por default
            makeEntry({
                propertyId: "p2",
                status: "error",
                result: null,
                error: "X",
            }),
        ]

        const result = aggregateTrendBreakdown(entries)

        expect(result.stable).toBe(1)
        // O erro NÃO vira "insufficient":
        expect(result.insufficient).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// aggregateTimeSeries
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateTimeSeries", () => {
    it("agrupa records pela mesma referenceDate, somando kWh e custo", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                result: makeResult({
                    records: [
                        makeRecord({
                            id: "r1",
                            referenceDate: "2025-01-01T00:00:00.000Z",
                            kwhConsumed: 100,
                            costBrl: 50,
                        }),
                    ],
                }),
            }),
            makeEntry({
                propertyId: "p2",
                result: makeResult({
                    records: [
                        makeRecord({
                            id: "r2",
                            referenceDate: "2025-01-01T00:00:00.000Z",
                            kwhConsumed: 150,
                            costBrl: 75,
                        }),
                    ],
                }),
            }),
        ]

        const series = aggregateTimeSeries(entries)

        expect(series).toHaveLength(1)
        expect(series[0]!.referenceDate).toBe("2025-01-01T00:00:00.000Z")
        expect(series[0]!.totalKwh).toBe(250)
        expect(series[0]!.totalCostBrl).toBe(125)
        expect(series[0]!.propertyCount).toBe(2)
    })

    it("trata costBrl null como 0 na soma", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                result: makeResult({
                    records: [
                        makeRecord({
                            kwhConsumed: 100,
                            costBrl: null,
                        }),
                    ],
                }),
            }),
        ]

        expect(aggregateTimeSeries(entries)[0]!.totalCostBrl).toBe(0)
    })

    it("ordena por referenceDate ASC", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                result: makeResult({
                    records: [
                        makeRecord({
                            id: "r3",
                            referenceDate: "2025-03-01T00:00:00.000Z",
                        }),
                        makeRecord({
                            id: "r1",
                            referenceDate: "2025-01-01T00:00:00.000Z",
                        }),
                        makeRecord({
                            id: "r2",
                            referenceDate: "2025-02-01T00:00:00.000Z",
                        }),
                    ],
                }),
            }),
        ]

        const series = aggregateTimeSeries(entries)
        const dates = series.map((s) => s.referenceDate)

        expect(dates).toEqual([
            "2025-01-01T00:00:00.000Z",
            "2025-02-01T00:00:00.000Z",
            "2025-03-01T00:00:00.000Z",
        ])
    })

    it("ignora entries com status='error'", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({
                propertyId: "p2",
                status: "error",
                result: null,
                error: "X",
            }),
        ]

        const series = aggregateTimeSeries(entries)
        expect(series).toHaveLength(1)
        expect(series[0]!.propertyCount).toBe(1)
    })

    it("retorna array vazio quando não há records", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ result: makeResult({ records: [] }) }),
        ]

        expect(aggregateTimeSeries(entries)).toEqual([])
    })

    it("preserva o period do primeiro record encontrado naquela data", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                result: makeResult({
                    records: [
                        makeRecord({
                            period: "MONTHLY",
                            referenceDate: "2025-01-01T00:00:00.000Z",
                        }),
                    ],
                }),
            }),
        ]

        expect(aggregateTimeSeries(entries)[0]!.period).toBe("MONTHLY")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// rankPropertiesByKwh
// ─────────────────────────────────────────────────────────────────────────────

describe("rankPropertiesByKwh", () => {
    it("ordena por totalKwh DESC (maior primeiro)", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                propertyName: "Casa",
                result: makeResult({
                    summary: {
                        totalKwh: 50,
                        totalCostBrl: 0,
                        recordCount: 1,
                        avgKwhPerRecord: 50,
                        trend: "STABLE",
                    },
                }),
            }),
            makeEntry({
                propertyId: "p2",
                propertyName: "Escritório",
                result: makeResult({
                    summary: {
                        totalKwh: 200,
                        totalCostBrl: 0,
                        recordCount: 2,
                        avgKwhPerRecord: 100,
                        trend: "STABLE",
                    },
                }),
            }),
            makeEntry({
                propertyId: "p3",
                propertyName: "Galpão",
                result: makeResult({
                    summary: {
                        totalKwh: 100,
                        totalCostBrl: 0,
                        recordCount: 1,
                        avgKwhPerRecord: 100,
                        trend: "STABLE",
                    },
                }),
            }),
        ]

        const ranked = rankPropertiesByKwh(entries)

        expect(ranked.map((e) => e.propertyId)).toEqual(["p2", "p3", "p1"])
    })

    it("manda entries com status='error' pro FINAL", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "ok",
                result: makeResult({
                    summary: {
                        totalKwh: 50,
                        totalCostBrl: 0,
                        recordCount: 1,
                        avgKwhPerRecord: 50,
                        trend: "STABLE",
                    },
                }),
            }),
            makeEntry({
                propertyId: "err",
                propertyName: "Erro",
                status: "error",
                result: null,
                error: "X",
            }),
        ]

        const ranked = rankPropertiesByKwh(entries)
        expect(ranked[0]!.propertyId).toBe("ok")
        expect(ranked[1]!.propertyId).toBe("err")
    })

    it("ordena erros entre si por propertyName ASC", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                propertyName: "Zeta",
                status: "error",
                result: null,
                error: "X",
            }),
            makeEntry({
                propertyId: "p2",
                propertyName: "Alpha",
                status: "error",
                result: null,
                error: "Y",
            }),
        ]

        const ranked = rankPropertiesByKwh(entries)
        expect(ranked.map((e) => e.propertyName)).toEqual(["Alpha", "Zeta"])
    })

    it("não muta o array de entrada", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({ propertyId: "p2" }),
        ]
        const original = [...entries]

        rankPropertiesByKwh(entries)

        expect(entries).toEqual(original)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildDashboardData (integração das 3 funções)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDashboardData", () => {
    it("retorna shape completo com summary, perProperty (ranqueado) e timeSeries", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                propertyName: "Casa",
                result: makeResult({
                    summary: {
                        totalKwh: 80,
                        totalCostBrl: 40,
                        recordCount: 1,
                        avgKwhPerRecord: 80,
                        trend: "DECREASING",
                    },
                    records: [
                        makeRecord({
                            kwhConsumed: 80,
                            costBrl: 40,
                            referenceDate: "2025-01-01T00:00:00.000Z",
                        }),
                    ],
                }),
            }),
            makeEntry({
                propertyId: "p2",
                propertyName: "Escritório",
                result: makeResult({
                    summary: {
                        totalKwh: 200,
                        totalCostBrl: 100,
                        recordCount: 1,
                        avgKwhPerRecord: 200,
                        trend: "INCREASING",
                    },
                    records: [
                        makeRecord({
                            kwhConsumed: 200,
                            costBrl: 100,
                            referenceDate: "2025-01-01T00:00:00.000Z",
                        }),
                    ],
                }),
            }),
        ]

        const data = buildDashboardData(entries)

        // Summary somado
        expect(data.summary.totalKwh).toBe(280)
        expect(data.summary.recordCount).toBe(2)

        // Ranking aplicado
        expect(data.perProperty[0]!.propertyId).toBe("p2")
        expect(data.perProperty[1]!.propertyId).toBe("p1")

        // Time series agrupada
        expect(data.timeSeries).toHaveLength(1)
        expect(data.timeSeries[0]!.totalKwh).toBe(280)
        expect(data.timeSeries[0]!.propertyCount).toBe(2)

        // Trend breakdown
        expect(data.summary.trendBreakdown).toEqual({
            increasing: 1,
            decreasing: 1,
            stable: 0,
            insufficient: 0,
        })
    })

    it("lida com mix de sucesso e erro sem quebrar", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({
                propertyId: "p2",
                status: "error",
                result: null,
                error: "Erro X",
            }),
        ]

        const data = buildDashboardData(entries)

        expect(data.summary.propertyCount).toBe(2)
        expect(data.summary.propertyWithDataCount).toBe(1)
        expect(data.perProperty).toHaveLength(2)
        expect(data.perProperty[1]!.status).toBe("error")
    })
})