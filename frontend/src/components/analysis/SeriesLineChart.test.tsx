import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SeriesLineChart } from "@/components/analysis/SeriesLineChart"
import { formatVoltageRms } from "@/lib/format"

describe("SeriesLineChart", () => {
    it("renderiza sem quebrar com pontos nulos (grandeza ausente vira vazio no traçado, não 0)", () => {
        render(
            <SeriesLineChart
                points={[
                    { label: "00h", value: 220 },
                    { label: "01h", value: null },
                    { label: "02h", value: 221 },
                ]}
                format={formatVoltageRms}
            />,
        )

        expect(screen.getByTestId("series-line-chart")).toBeInTheDocument()
    })
})
