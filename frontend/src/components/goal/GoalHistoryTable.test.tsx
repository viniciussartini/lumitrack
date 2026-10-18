import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { GoalHistoryTable } from "@/components/goal/GoalHistoryTable"
import type { Goal, GoalProgress } from "@/types/goal.types"

const makeGoal = (year: number, monthlyTargets?: number[]): Goal => ({
    id: `goal-${year}`,
    propertyId: "prop-a",
    year,
    unit: "KWH",
    referenceYear: year - 1,
    monthlyTargets: monthlyTargets ?? Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const makeProgress = (year: number, override: Partial<GoalProgress> = {}): GoalProgress => ({
    goalId: `goal-${year}`,
    year,
    unit: "KWH",
    months: [],
    yearTarget: 4800,
    realized: null,
    deviationPercent: null,
    currentMonthTarget: null,
    situation: "IN_PROGRESS",
    ...override,
})

const progressMap = (...items: GoalProgress[]) => new Map(items.map((item) => [item.goalId, item]))

const noop = { onEdit: vi.fn(), onDelete: vi.fn(), onUseAsReference: vi.fn() }

describe("GoalHistoryTable", () => {
    it("mostra a meta do ano como a soma dos meses e a base de referência", () => {
        const months = Array.from({ length: 12 }, (_, i) => (i + 1) * 100)
        render(
            <GoalHistoryTable
                goals={[makeGoal(2026, months)]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                {...noop}
            />,
        )

        const row = screen.getByTestId("goal-row-2026")
        expect(row).toHaveTextContent("7.800 kWh")
        expect(row).toHaveTextContent("Ano 2025")
    })

    it("mostra realizado, desvio e situação do acompanhamento", () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2026), makeGoal(2025), makeGoal(2024)]}
                progressByGoalId={progressMap(
                    makeProgress(2026, { realized: 2220, deviationPercent: 0.9 }),
                    makeProgress(2025, {
                        realized: 4680,
                        deviationPercent: -2.5,
                        situation: "MET",
                    }),
                    makeProgress(2024, {
                        realized: 5000,
                        deviationPercent: 4.2,
                        situation: "NOT_MET",
                    }),
                )}
                currentYear={2026}
                {...noop}
            />,
        )

        const current = screen.getByTestId("goal-row-2026")
        expect(current).toHaveTextContent("2.220 kWh")
        expect(current).toHaveTextContent("+0,9%")
        expect(current).toHaveTextContent("Em andamento")

        const met = screen.getByTestId("goal-row-2025")
        expect(met).toHaveTextContent("4.680 kWh")
        expect(met).toHaveTextContent("−2,5%")
        expect(met).toHaveTextContent("Cumprida")

        const notMet = screen.getByTestId("goal-row-2024")
        expect(notMet).toHaveTextContent("+4,2%")
        expect(notMet).toHaveTextContent("Não cumprida")
    })

    it('sem leitura, realizado e desvio são "-" e o ano passado fica sem situação', () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2025)]}
                progressByGoalId={progressMap(makeProgress(2025, { situation: null }))}
                currentYear={2026}
                {...noop}
            />,
        )

        const cells = screen.getByTestId("goal-row-2025").querySelectorAll("td")
        // Ano, Meta, Realizado, Desvio, Base de referência, Situação, Ações.
        expect(cells[2]).toHaveTextContent("-")
        expect(cells[3]).toHaveTextContent("-")
        expect(cells[5]).toHaveTextContent("-")
    })

    it('sem o acompanhamento (carregando ou com falha), as colunas ficam "-" e a lista segue', () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2026)]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                {...noop}
            />,
        )

        const cells = screen.getByTestId("goal-row-2026").querySelectorAll("td")
        expect(cells[2]).toHaveTextContent("-")
        expect(cells[3]).toHaveTextContent("-")
        expect(cells[5]).toHaveTextContent("-")
        expect(screen.getByRole("button", { name: "Editar meta de 2026" })).toBeInTheDocument()
    })

    it("avisa o histórico vazio", () => {
        render(
            <GoalHistoryTable
                goals={[]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                {...noop}
            />,
        )

        expect(screen.getByTestId("goal-history-empty")).toHaveTextContent(
            "Nenhuma meta cadastrada.",
        )
        expect(screen.queryByRole("table")).not.toBeInTheDocument()
    })

    it("entrega a meta da linha às ações de editar e excluir", async () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        const goal = makeGoal(2026)
        const user = userEvent.setup()
        render(
            <GoalHistoryTable
                goals={[goal]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                onEdit={onEdit}
                onDelete={onDelete}
                onUseAsReference={vi.fn()}
            />,
        )

        await user.click(screen.getByRole("button", { name: "Editar meta de 2026" }))
        await user.click(screen.getByRole("button", { name: "Excluir meta de 2026" }))

        expect(onEdit).toHaveBeenCalledWith(goal)
        expect(onDelete).toHaveBeenCalledWith(goal)
    })

    it("meta de ano passado só oferece usar como referência: não edita nem exclui", () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2025)]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                {...noop}
            />,
        )

        expect(
            screen.getByRole("button", { name: "Usar a meta de 2025 como referência" }),
        ).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument()
    })

    it("ano corrente e futuro não oferecem usar como referência", () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2027), makeGoal(2026)]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                {...noop}
            />,
        )

        expect(screen.queryByRole("button", { name: /como referência/ })).not.toBeInTheDocument()
    })

    it("entrega a meta do ano passado à ação de usar como referência", async () => {
        const onUseAsReference = vi.fn()
        const goal = makeGoal(2025)
        const user = userEvent.setup()
        render(
            <GoalHistoryTable
                goals={[goal]}
                progressByGoalId={progressMap()}
                currentYear={2026}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onUseAsReference={onUseAsReference}
            />,
        )

        await user.click(
            screen.getByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )

        expect(onUseAsReference).toHaveBeenCalledWith(goal)
    })
})

describe("GoalHistoryTable — custo (R$)", () => {
    it("mostra a meta e o realizado em reais", () => {
        render(
            <GoalHistoryTable
                goals={[{ ...makeGoal(2026), unit: "BRL" }]}
                progressByGoalId={progressMap(
                    makeProgress(2026, { unit: "BRL", realized: 2280, deviationPercent: 3.6 }),
                )}
                currentYear={2026}
                {...noop}
            />,
        )

        const row = screen.getByTestId("goal-row-2026")
        expect(row).toHaveTextContent("R$ 4.800")
        expect(row).toHaveTextContent("R$ 2.280")
        expect(row).toHaveTextContent("+3,6%")
    })
})
