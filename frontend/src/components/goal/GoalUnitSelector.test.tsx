import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { GoalUnitSelector } from "@/components/goal/GoalUnitSelector"

describe("GoalUnitSelector", () => {
    it("oferece consumo e custo e marca a unidade escolhida", () => {
        render(<GoalUnitSelector unit="BRL" onChange={vi.fn()} />)

        expect(screen.getByRole("tab", { name: "Consumo (kWh)" })).toHaveAttribute(
            "aria-selected",
            "false",
        )
        expect(screen.getByRole("tab", { name: "Custo (R$)" })).toHaveAttribute(
            "aria-selected",
            "true",
        )
    })

    it("entrega a unidade clicada", async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<GoalUnitSelector unit="KWH" onChange={onChange} />)

        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))

        expect(onChange).toHaveBeenCalledWith("BRL")
    })
})
