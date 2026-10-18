import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PeriodComparisonDifferences } from "@/components/history/PeriodComparisonDifferences"
import type { PeriodComparisonRun } from "@/lib/periodComparison"
import type {
    MeterReadingComparePeriodsResponse,
    MeterReadingPeriodDiff,
} from "@/types/meterReadingSeries.types"

const RUN: PeriodComparisonRun = {
    target: { key: "AREA:a", targetType: "AREA", targetId: "a", label: "Casa · Sala" },
    metric: "tensao",
    aStart: "2026-01-01",
    aEnd: "2026-01-07",
    bStart: "2026-02-01",
    bEnd: "2026-02-07",
}

const response = (diff: MeterReadingPeriodDiff): MeterReadingComparePeriodsResponse => ({
    metric: "tensao",
    granularity: "day",
    periodA: { from: "", to: "", items: [], summary: { min: 200, avg: 220, max: 240 } },
    periodB: { from: "", to: "", items: [], summary: { min: 205, avg: 231, max: 250 } },
    diff,
})

describe("PeriodComparisonDifferences", () => {
    it("cabeçalho com o alvo e a grandeza", () => {
        render(
            <PeriodComparisonDifferences run={RUN} data={response({ absolute: 11, percent: 5 })} />,
        )

        expect(screen.getByText("Diferenças")).toBeInTheDocument()
        expect(screen.getByText("Casa · Sala · Tensão (V)")).toBeInTheDocument()
    })

    it("variação de B sobre A em destaque, com sinal, cor de alta e nota", () => {
        render(
            <PeriodComparisonDifferences run={RUN} data={response({ absolute: 11, percent: 5 })} />,
        )

        const variation = screen.getByTestId("period-variation")
        expect(variation).toHaveTextContent("+5,0%")
        expect(variation).toHaveClass("text-status-danger")
        expect(screen.getByText("Período B acima do período A.")).toBeInTheDocument()
    })

    it("variação negativa: sinal de menos e cor de queda", () => {
        render(
            <PeriodComparisonDifferences
                run={RUN}
                data={response({ absolute: -11, percent: -5 })}
            />,
        )

        const variation = screen.getByTestId("period-variation")
        expect(variation).toHaveTextContent("−5,0%")
        expect(variation).toHaveClass("text-status-success")
    })

    it("cards de média, diferença absoluta, pico e dias, com a unidade da grandeza", () => {
        render(
            <PeriodComparisonDifferences run={RUN} data={response({ absolute: 11, percent: 5 })} />,
        )

        expect(screen.getByText("Média período A")).toBeInTheDocument()
        expect(screen.getByText("220,00V")).toBeInTheDocument()
        expect(screen.getByText("231,00V")).toBeInTheDocument()
        expect(screen.getByText("+11,00V")).toBeInTheDocument()
        expect(screen.getByText("240,00V")).toBeInTheDocument()
        expect(screen.getByText("250,00V")).toBeInTheDocument()
        expect(screen.getByText("7 dias")).toBeInTheDocument()
    })

    it("sem dado em um dos períodos: travessão neutro e a nota do motivo", () => {
        render(
            <PeriodComparisonDifferences
                run={RUN}
                data={response({ absolute: null, percent: null })}
            />,
        )

        const variation = screen.getByTestId("period-variation")
        expect(variation).toHaveTextContent("-")
        expect(variation).toHaveClass("text-muted")
        expect(screen.getByText("Sem dados da grandeza em um dos períodos.")).toBeInTheDocument()
    })
})
