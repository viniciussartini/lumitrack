import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConsumptionPeriodFilter } from "@/components/consumption/ConsumptionPeriodFilter"

describe("ConsumptionPeriodFilter — render", () => {
    it("renderiza chips na ordem canônica: Tudo, Hora, Dia, Mês, Ano", () => {
        render(<ConsumptionPeriodFilter value={undefined} onChange={vi.fn()} />)

        const buttons = screen.getAllByRole("button")
        expect(buttons.map((b) => b.textContent)).toEqual([
            "Tudo",
            "Hora",
            "Dia",
            "Mês",
            "Ano",
        ])
    })

    it("marca 'Tudo' como ativo quando value=undefined", () => {
        render(<ConsumptionPeriodFilter value={undefined} onChange={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: "Tudo" }),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByRole("button", { name: "Hora" }),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("marca o chip do period como ativo quando value está definido", () => {
        render(<ConsumptionPeriodFilter value="MONTHLY" onChange={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: "Mês" }),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByRole("button", { name: "Tudo" }),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("renderiza totalLabel quando informado", () => {
        render(
            <ConsumptionPeriodFilter
                value={undefined}
                onChange={vi.fn()}
                totalLabel="12 registros"
            />,
        )

        expect(
            screen.getByTestId("consumption-period-total"),
        ).toHaveTextContent("12 registros")
    })

    it("não renderiza totalLabel quando não informado", () => {
        render(<ConsumptionPeriodFilter value={undefined} onChange={vi.fn()} />)

        expect(screen.queryByTestId("consumption-period-total")).toBeNull()
    })
})

describe("ConsumptionPeriodFilter — interação", () => {
    it("dispara onChange com undefined ao clicar em 'Tudo'", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<ConsumptionPeriodFilter value="DAILY" onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Tudo" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })

    it("dispara onChange com o period ao clicar num chip inativo", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<ConsumptionPeriodFilter value={undefined} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Mês" }))

        expect(onChange).toHaveBeenCalledWith("MONTHLY")
    })

    it("dispara onChange com undefined ao clicar no chip JÁ ativo (toggle off)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<ConsumptionPeriodFilter value="DAILY" onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Dia" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })
})

describe("ConsumptionPeriodFilter — acessibilidade", () => {
    it("agrupa os chips num role=group com aria-label", () => {
        render(<ConsumptionPeriodFilter value={undefined} onChange={vi.fn()} />)

        expect(
            screen.getByRole("group", { name: /filtrar por período/i }),
        ).toBeInTheDocument()
    })
})