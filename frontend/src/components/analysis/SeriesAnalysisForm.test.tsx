import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SeriesAnalysisForm } from "@/components/analysis/SeriesAnalysisForm"

describe("SeriesAnalysisForm", () => {
    it("começa em window=dia, com Hora e Agregação desabilitados", () => {
        render(<SeriesAnalysisForm onSubmit={vi.fn()} />)

        expect(screen.getByLabelText("Janela do gráfico")).toHaveValue("dia")
        expect(screen.getByLabelText("Hora")).toBeDisabled()
        expect(screen.getByLabelText("Agregação")).toBeDisabled()
    })

    it("trocar para window=hora habilita Hora e Agregação", async () => {
        const user = userEvent.setup()
        render(<SeriesAnalysisForm onSubmit={vi.fn()} />)

        await user.selectOptions(screen.getByLabelText("Janela do gráfico"), "hora")

        expect(screen.getByLabelText("Hora")).toBeEnabled()
        expect(screen.getByLabelText("Agregação")).toBeEnabled()
    })

    it("trocar hora/agregação e depois voltar para window=dia desabilita e limpa os dois campos", async () => {
        const user = userEvent.setup()
        render(<SeriesAnalysisForm onSubmit={vi.fn()} />)

        await user.selectOptions(screen.getByLabelText("Janela do gráfico"), "hora")
        await user.selectOptions(screen.getByLabelText("Hora"), "14")
        await user.selectOptions(screen.getByLabelText("Agregação"), "15")
        await user.selectOptions(screen.getByLabelText("Janela do gráfico"), "dia")

        expect(screen.getByLabelText("Hora")).toBeDisabled()
        expect(screen.getByLabelText("Hora")).toHaveValue("0")
        expect(screen.getByLabelText("Agregação")).toBeDisabled()
        expect(screen.getByLabelText("Agregação")).toHaveValue("5")
    })

    it("não submete sem o dia preenchido", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<SeriesAnalysisForm onSubmit={onSubmit} />)

        await user.click(screen.getByRole("button", { name: /Gerar análise/i }))

        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("window=dia: submete { window, day, metric }, sem hour/aggregationMinutes", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<SeriesAnalysisForm onSubmit={onSubmit} />)

        await user.type(screen.getByLabelText("Dia"), "2026-01-15")
        await user.click(screen.getByRole("button", { name: /Gerar análise/i }))

        expect(onSubmit).toHaveBeenCalledWith({
            window: "dia",
            day: "2026-01-15",
            metric: "tensao",
        })
    })

    it("window=hora: submete { window, day, hour, aggregationMinutes, metric }", async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        render(<SeriesAnalysisForm onSubmit={onSubmit} />)

        await user.selectOptions(screen.getByLabelText("Janela do gráfico"), "hora")
        await user.type(screen.getByLabelText("Dia"), "2026-01-15")
        await user.selectOptions(screen.getByLabelText("Hora"), "14")
        await user.selectOptions(screen.getByLabelText("Agregação"), "15")
        await user.selectOptions(screen.getByLabelText("Grandeza"), "corrente")
        await user.click(screen.getByRole("button", { name: /Gerar análise/i }))

        expect(onSubmit).toHaveBeenCalledWith({
            window: "hora",
            day: "2026-01-15",
            hour: 14,
            aggregationMinutes: 15,
            metric: "corrente",
        })
    })
})
