import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GoalProgressChart } from "@/components/goal/GoalProgressChart"
import type { GoalProgressMonth } from "@/types/goal.types"

const months = (realized: (number | null)[]): GoalProgressMonth[] =>
    Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 400,
        realized: realized[i] ?? null,
    }))

describe("GoalProgressChart", () => {
    it("renderiza sem quebrar com meses sem leitura (vazio, não barra em 0)", () => {
        render(<GoalProgressChart months={months([350, null, 420])} unit="KWH" />)

        expect(screen.getByTestId("goal-progress-chart")).toBeInTheDocument()
    })

    it("renderiza com todos os meses sem leitura", () => {
        render(<GoalProgressChart months={months([])} unit="KWH" />)

        expect(screen.getByTestId("goal-progress-chart")).toBeInTheDocument()
    })
})
