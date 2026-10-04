import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { GoalHistoryTable } from "@/components/goal/GoalHistoryTable"
import type { Goal } from "@/types/goal.types"

const makeGoal = (year: number, monthlyKwh?: number[]): Goal => ({
    id: `goal-${year}`,
    propertyId: "prop-a",
    year,
    referenceYear: year - 1,
    monthlyKwh: monthlyKwh ?? Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

describe("GoalHistoryTable", () => {
    it("mostra a meta do ano como a soma dos meses e a base de referência", () => {
        const months = Array.from({ length: 12 }, (_, i) => (i + 1) * 100)
        render(
            <GoalHistoryTable
                goals={[makeGoal(2026, months)]}
                currentYear={2026}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />,
        )

        const row = screen.getByTestId("goal-row-2026")
        expect(row).toHaveTextContent("7.800 kWh")
        expect(row).toHaveTextContent("Ano 2025")
    })

    it("avisa o histórico vazio", () => {
        render(
            <GoalHistoryTable goals={[]} currentYear={2026} onEdit={vi.fn()} onDelete={vi.fn()} />,
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
                currentYear={2026}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        )

        await user.click(screen.getByRole("button", { name: "Editar meta de 2026" }))
        await user.click(screen.getByRole("button", { name: "Excluir meta de 2026" }))

        expect(onEdit).toHaveBeenCalledWith(goal)
        expect(onDelete).toHaveBeenCalledWith(goal)
    })

    it("meta de ano passado não tem ações", () => {
        render(
            <GoalHistoryTable
                goals={[makeGoal(2025)]}
                currentYear={2026}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />,
        )

        expect(screen.getByTestId("goal-row-2025")).toHaveTextContent("-")
        expect(screen.queryByRole("button")).not.toBeInTheDocument()
    })
})
