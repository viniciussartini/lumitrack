import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { ComparisonBars, type ComparisonRow } from "@/components/consumption/ComparisonBars"

const row = (id: string, kwh: number, cost?: number): ComparisonRow => ({
    id,
    label: id,
    bucket: {
        id,
        targetType: "AREA",
        bucketStart: "2026-09-01T00:00:00.000Z",
        kwhConsumed: kwh,
        avgPowerW: 100,
        ...(cost !== undefined && { costBrl: cost }),
    },
})

const fills = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>("[style*='width']"))

describe("ComparisonBars", () => {
    it("pinta as barras de kWh com o token de gráfico azul, que acompanha o tema", () => {
        const { container } = render(<ComparisonBars rows={[row("a", 40, 32)]} unit="kwh" />)

        expect(fills(container)[0]!.style.backgroundColor).toBe("var(--color-chart-blue)")
    })

    it("pinta as barras de R$ com o token de gráfico âmbar, que acompanha o tema", () => {
        const { container } = render(<ComparisonBars rows={[row("a", 40, 32)]} unit="reais" />)

        expect(fills(container)[0]!.style.backgroundColor).toBe("var(--color-chart-amber)")
    })

    it("dimensiona cada barra pelo maior valor", () => {
        const { container } = render(
            <ComparisonBars rows={[row("a", 40), row("b", 20)]} unit="kwh" />,
        )

        expect(fills(container).map((el) => el.style.width)).toEqual(["100%", "50%"])
    })
})
