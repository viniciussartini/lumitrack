import { describe, it, expect } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { ComparisonCard } from "@/components/consumption/ComparisonCard"
import type { ComparisonRow } from "@/components/consumption/ComparisonBars"

const row = (id: string, label: string, kwh: number, cost?: number): ComparisonRow => ({
    id,
    label,
    bucket: {
        id,
        targetType: "AREA",
        bucketStart: "2026-09-01T00:00:00.000Z",
        kwhConsumed: kwh,
        avgPowerW: 100,
        ...(cost !== undefined && { costBrl: cost }),
    },
})

const renderCard = (rows: ComparisonRow[]) =>
    render(<ComparisonCard title="Comparação de áreas" subtitle="Consumo por área" rows={rows} />)

describe("ComparisonCard", () => {
    it("mostra kWh por padrão e alterna para R$ quando há custo", async () => {
        renderCard([row("a", "Sala", 40, 32), row("b", "Cozinha", 20, 16)])

        expect(screen.getByText("Consumo por área (kWh)")).toBeInTheDocument()
        expect(screen.getByText(/40,00 kWh/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(screen.getByText("Consumo por área (R$)")).toBeInTheDocument()
        expect(screen.getByText(/32,00/)).toBeInTheDocument()
        expect(screen.queryByText(/40,00 kWh/)).not.toBeInTheDocument()
    })

    it("desabilita R$ com a explicação quando nenhuma linha tem custo", () => {
        renderCard([row("a", "Sala", 40), row("b", "Cozinha", 20)])

        const reais = screen.getByRole("button", { name: "R$" })
        expect(reais).toBeDisabled()
        expect(reais).toHaveAccessibleDescription("Custo em R$ indisponível para esta tarifa.")
        expect(screen.getByRole("button", { name: "kWh" })).toHaveAttribute("aria-pressed", "true")
        expect(screen.getByText(/40,00 kWh/)).toBeInTheDocument()
    })

    it("em R$, omite a linha sem custo em vez de desenhá-la como zero", async () => {
        renderCard([row("a", "Sala", 40, 32), row("b", "Cozinha", 20)])

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(screen.getByText("Sala")).toBeInTheDocument()
        expect(screen.queryByText("Cozinha")).not.toBeInTheDocument()
    })

    it("em R$, avisa quantas linhas ficaram de fora por não terem custo calculável", async () => {
        renderCard([row("a", "Sala", 40, 32), row("b", "Cozinha", 20), row("c", "Copa", 10)])

        expect(screen.queryByText(/sem custo calculável/i)).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(
            screen.getByText("2 itens sem custo calculável não aparecem em R$."),
        ).toBeInTheDocument()
    })

    it("com uma só linha sem custo, o aviso fica no singular", async () => {
        renderCard([row("a", "Sala", 40, 32), row("b", "Cozinha", 20)])

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(
            screen.getByText("1 item sem custo calculável não aparece em R$."),
        ).toBeInTheDocument()
    })

    it("todas as linhas com custo: sem aviso em R$", async () => {
        renderCard([row("a", "Sala", 40, 32), row("b", "Cozinha", 20, 16)])

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(screen.queryByText(/sem custo calculável/i)).not.toBeInTheDocument()
    })

    it("mantém o aviso passado pelo pai junto do de R$", async () => {
        render(
            <ComparisonCard
                title="Comparação de áreas"
                subtitle="Consumo por área"
                rows={[row("a", "Sala", 40, 32), row("b", "Cozinha", 20)]}
                notice="1 área sem medidor não aparece na comparação."
            />,
        )

        await userEvent.click(screen.getByRole("button", { name: "R$" }))

        expect(
            screen.getByText("1 área sem medidor não aparece na comparação."),
        ).toBeInTheDocument()
        expect(
            screen.getByText("1 item sem custo calculável não aparece em R$."),
        ).toBeInTheDocument()
    })
})
