import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { GoalUnitSelector } from "@/components/goal/GoalUnitSelector"

describe("GoalUnitSelector", () => {
    it("oferece consumo e custo e marca a unidade escolhida", () => {
        render(<GoalUnitSelector unit="BRL" units={["KWH", "BRL"]} onChange={vi.fn()} />)

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
        render(<GoalUnitSelector unit="KWH" units={["KWH", "BRL"]} onChange={onChange} />)

        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))

        expect(onChange).toHaveBeenCalledWith("BRL")
    })

    it("oferece só as unidades recebidas: sem demanda, não há aba de kW", () => {
        render(<GoalUnitSelector unit="KWH" units={["KWH", "BRL"]} onChange={vi.fn()} />)

        expect(screen.queryByRole("tab", { name: "Demanda (kW)" })).not.toBeInTheDocument()
        expect(screen.getAllByRole("tab")).toHaveLength(2)
    })

    it("com a demanda disponível, mostra a terceira aba e entrega a unidade clicada", async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<GoalUnitSelector unit="KWH" units={["KWH", "BRL", "KW"]} onChange={onChange} />)

        await user.click(screen.getByRole("tab", { name: "Demanda (kW)" }))

        expect(onChange).toHaveBeenCalledWith("KW")
    })
})
