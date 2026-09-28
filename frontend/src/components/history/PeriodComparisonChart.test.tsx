import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PeriodComparisonChart } from "@/components/history/PeriodComparisonChart"
import { formatVoltageRms } from "@/lib/format"

describe("PeriodComparisonChart", () => {
    it("renderiza sem quebrar com pontos nulos nos dois períodos (vazio no traçado, não 0)", () => {
        render(
            <PeriodComparisonChart
                points={[
                    {
                        label: "Dia 1",
                        valueA: 220,
                        valueB: null,
                        dateA: "01/01/2026",
                        dateB: "01/02/2026",
                    },
                    {
                        label: "Dia 2",
                        valueA: null,
                        valueB: 221,
                        dateA: "02/01/2026",
                        dateB: "02/02/2026",
                    },
                ]}
                format={formatVoltageRms}
            />,
        )

        expect(screen.getByTestId("period-comparison-chart")).toBeInTheDocument()
    })
})
