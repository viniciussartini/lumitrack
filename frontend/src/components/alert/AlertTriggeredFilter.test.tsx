import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AlertTriggeredFilter } from "@/components/alert/AlertTriggeredFilter"

describe("AlertTriggeredFilter — render", () => {
    it("renderiza chips na ordem: Todos, Ativos, Disparados", () => {
        render(<AlertTriggeredFilter value={undefined} onChange={vi.fn()} />)

        const buttons = screen.getAllByRole("button")
        expect(buttons.map((b) => b.textContent)).toEqual([
            "Todos",
            "Ativos",
            "Disparados",
        ])
    })

    it("marca 'Todos' como ativo quando value=undefined", () => {
        render(<AlertTriggeredFilter value={undefined} onChange={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: "Todos" }),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByRole("button", { name: "Ativos" }),
        ).toHaveAttribute("aria-pressed", "false")
        expect(
            screen.getByRole("button", { name: "Disparados" }),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("marca 'Ativos' como ativo quando value=false", () => {
        render(<AlertTriggeredFilter value={false} onChange={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: "Ativos" }),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByRole("button", { name: "Todos" }),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("marca 'Disparados' como ativo quando value=true", () => {
        render(<AlertTriggeredFilter value={true} onChange={vi.fn()} />)

        expect(
            screen.getByRole("button", { name: "Disparados" }),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByRole("button", { name: "Todos" }),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("renderiza totalLabel quando informado", () => {
        render(
            <AlertTriggeredFilter
                value={undefined}
                onChange={vi.fn()}
                totalLabel="3 alertas"
            />,
        )

        expect(
            screen.getByTestId("alert-triggered-total"),
        ).toHaveTextContent("3 alertas")
    })

    it("não renderiza totalLabel quando não informado", () => {
        render(<AlertTriggeredFilter value={undefined} onChange={vi.fn()} />)

        expect(screen.queryByTestId("alert-triggered-total")).toBeNull()
    })
})

describe("AlertTriggeredFilter — interação", () => {
    it("dispara onChange(undefined) ao clicar em 'Todos'", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AlertTriggeredFilter value={true} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Todos" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })

    it("dispara onChange(false) ao clicar em 'Ativos' (chip inativo)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AlertTriggeredFilter value={undefined} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Ativos" }))

        expect(onChange).toHaveBeenCalledWith(false)
    })

    it("dispara onChange(true) ao clicar em 'Disparados' (chip inativo)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AlertTriggeredFilter value={undefined} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Disparados" }))

        expect(onChange).toHaveBeenCalledWith(true)
    })

    it("dispara onChange(undefined) ao clicar em 'Ativos' JÁ ativo (toggle off)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AlertTriggeredFilter value={false} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Ativos" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })

    it("dispara onChange(undefined) ao clicar em 'Disparados' JÁ ativo (toggle off)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<AlertTriggeredFilter value={true} onChange={onChange} />)

        await user.click(screen.getByRole("button", { name: "Disparados" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })
})

describe("AlertTriggeredFilter — acessibilidade", () => {
    it("agrupa os chips num role=group com aria-label", () => {
        render(<AlertTriggeredFilter value={undefined} onChange={vi.fn()} />)

        expect(
            screen.getByRole("group", { name: /filtrar por status/i }),
        ).toBeInTheDocument()
    })
})