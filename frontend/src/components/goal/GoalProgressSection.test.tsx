import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { GoalProgressSection } from "@/components/goal/GoalProgressSection"
import type { GoalProgress } from "@/types/goal.types"

const makeProgress = (override: Partial<GoalProgress> = {}): GoalProgress => ({
    goalId: "goal-2026",
    year: 2026,
    unit: "KWH",
    months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 400,
        realized: i < 6 ? 380 : null,
    })),
    yearTarget: 4800,
    realized: 2280,
    deviationPercent: 3.6,
    currentMonthTarget: 400,
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
                progress={makeProgress({ realized: null, deviationPercent: null })}
                monthIndex={5}
            />,
        )

        expect(statValue("Realizado até junho")).toHaveTextContent("-")
        expect(statValue("Desvio acumulado")).toHaveTextContent("-")
    })
})

describe("GoalProgressSection — custo (R$)", () => {
    it("mostra os valores em reais e o rótulo da meta de custo do mês", () => {
        render(
            <GoalProgressSection
                progress={makeProgress({
                    unit: "BRL",
                    yearTarget: 4800,
                    realized: 2280,
                    currentMonthTarget: 400,
                })}
                monthIndex={5}
            />,
        )

        expect(statValue("Meta de 2026")).toHaveTextContent("R$ 4.800")
        expect(statValue("Realizado até junho")).toHaveTextContent("R$ 2.280")
        expect(statValue("Custo alvo · meta do mês")).toHaveTextContent("R$ 400")
        expect(screen.queryByText("Consumo específico alvo · meta do mês")).not.toBeInTheDocument()
    })
})

describe("GoalProgressSection — demanda (kW)", () => {
    it("usa os rótulos de pico e o formato em kW", () => {
        render(
            <GoalProgressSection
                progress={makeProgress({
                    unit: "KW",
                    yearTarget: 220,
                    realized: 205,
                    deviationPercent: 13.9,
                    currentMonthTarget: 180,
                })}
                monthIndex={5}
            />,
        )

        expect(statValue("Maior meta de 2026")).toHaveTextContent("220 kW")
        expect(statValue("Maior demanda até junho")).toHaveTextContent("205 kW")
        expect(statValue("Pior mês")).toHaveTextContent("+13,9%")
        expect(statValue("Demanda alvo · meta do mês")).toHaveTextContent("180 kW")
        expect(screen.queryByText("Desvio acumulado")).not.toBeInTheDocument()
    })
})
