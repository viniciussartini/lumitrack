import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PeriodComparisonChartCard } from "@/components/history/PeriodComparisonChartCard"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import type { MeterReadingComparePeriodsResponse } from "@/types/meterReadingSeries.types"

const RUN: PeriodComparisonRun = {
    target: {
        key: "AREA:area-1",
        targetType: "AREA",
        targetId: "area-1",
        label: "Casa · Sala",
    },
    metric: "fp",
    aStart: "2026-01-01",
    aEnd: "2026-01-02",
    bStart: "2026-02-01",
    bEnd: "2026-02-02",
}

const period = { from: "", to: "", items: [], summary: { min: null, avg: null, max: null } }
const DATA: MeterReadingComparePeriodsResponse = {
    metric: "fp",
    granularity: "day",
    periodA: period,
    periodB: period,
    diff: { absolute: null, percent: null },
}

describe("PeriodComparisonChartCard", () => {
    it("cabeçalho com o alvo e o rótulo da grandeza", () => {
        render(<PeriodComparisonChartCard run={RUN} data={DATA} />)

        expect(screen.getByText("Casa · Sala")).toBeInTheDocument()
        expect(screen.getByText("Fator de potência")).toBeInTheDocument()
    })

    it("legenda A/B com as datas de cada período", () => {
        render(<PeriodComparisonChartCard run={RUN} data={DATA} />)

        expect(screen.getByText("A · 01/01/2026 – 02/01/2026")).toBeInTheDocument()
        expect(screen.getByText("B · 01/02/2026 – 02/02/2026")).toBeInTheDocument()
    })

    it("inclui o gráfico", () => {
        render(<PeriodComparisonChartCard run={RUN} data={DATA} />)

        expect(screen.getByTestId("period-comparison-chart")).toBeInTheDocument()
    })
})
