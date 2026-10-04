import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { GoalProgressSection } from "@/components/goal/GoalProgressSection"
import type { GoalProgress } from "@/types/goal.types"

const makeProgress = (override: Partial<GoalProgress> = {}): GoalProgress => ({
    goalId: "goal-2026",
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        targetKwh: 400,
        realizedKwh: i < 6 ? 380 : null,
    })),
    yearTargetKwh: 4800,
    realizedKwh: 2280,
    deviationPercent: 3.6,
    currentMonthTargetKwh: 400,
    situation: "IN_PROGRESS",
    ...override,
})

const statValue = (label: string | RegExp): HTMLElement => {
    const term = screen.getByText(label)
    return term.nextElementSibling as HTMLElement
}

describe("GoalProgressSection", () => {
    it("mostra o título do ano, a legenda e o gráfico", () => {
        render(<GoalProgressSection progress={makeProgress()} monthIndex={5} />)

        const section = screen.getByTestId("goal-progress")
        expect(within(section).getByText("2026 · meta vs. realizado")).toBeInTheDocument()
        expect(within(section).getByText("Meta do mês")).toBeInTheDocument()
        expect(within(section).getByText("Realizado")).toBeInTheDocument()
        expect(within(section).getByTestId("goal-progress-chart")).toBeInTheDocument()
    })

    it("mostra os quatro cards com a meta do ano, o realizado até o mês e a meta do mês", () => {
        render(<GoalProgressSection progress={makeProgress()} monthIndex={5} />)

        expect(statValue("Meta de 2026")).toHaveTextContent("4.800 kWh")
        expect(statValue("Realizado até junho")).toHaveTextContent("2.280 kWh")
        expect(statValue("Desvio acumulado")).toHaveTextContent("+3,6%")
        expect(statValue("Consumo específico alvo · meta do mês")).toHaveTextContent("400 kWh")
    })

    it("desvio acima da meta fica em vermelho e abaixo, em verde", () => {
        const { rerender } = render(
            <GoalProgressSection
                progress={makeProgress({ deviationPercent: 3.6 })}
                monthIndex={5}
            />,
        )
        expect(statValue("Desvio acumulado")).toHaveClass("text-status-danger")

        rerender(
            <GoalProgressSection
                progress={makeProgress({ deviationPercent: -2 })}
                monthIndex={5}
            />,
        )
        expect(statValue("Desvio acumulado")).toHaveTextContent("−2,0%")
        expect(statValue("Desvio acumulado")).toHaveClass("text-status-success")
    })

    it('sem leitura, realizado e desvio são "-", nunca zero', () => {
        render(
            <GoalProgressSection
                progress={makeProgress({ realizedKwh: null, deviationPercent: null })}
                monthIndex={5}
            />,
        )

        expect(statValue("Realizado até junho")).toHaveTextContent("-")
        expect(statValue("Desvio acumulado")).toHaveTextContent("-")
    })
})
