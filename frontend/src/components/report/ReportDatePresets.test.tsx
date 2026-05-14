import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReportDatePresets } from "@/components/report/ReportDatePresets"

const NOW = new Date(2026, 4, 13, 14, 0) // 13/05/2026

describe("ReportDatePresets — renderização", () => {
    it("renderiza 3 chips com labels em pt-BR", () => {
        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(screen.getByText("Este mês")).toBeInTheDocument()
        expect(screen.getByText("Últimos 30 dias")).toBeInTheDocument()
        expect(screen.getByText("Este ano")).toBeInTheDocument()
    })

    it("renderiza o agrupamento ARIA 'Atalhos de período'", () => {
        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(
            screen.getByRole("group", { name: /atalhos de período/i }),
        ).toBeInTheDocument()
    })

    it("nenhum chip está ativo quando não há datas no estado", () => {
        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        for (const button of screen.getAllByRole("button")) {
            expect(button).toHaveAttribute("aria-pressed", "false")
        }
    })
})

describe("ReportDatePresets — chip ativo", () => {
    it("marca 'Este mês' como ativo quando o range bate", () => {
        render(
            <ReportDatePresets
                dateFrom="2026-05-01"
                dateTo="2026-05-13"
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(
            screen.getByTestId("report-date-preset-this-month"),
        ).toHaveAttribute("aria-pressed", "true")
        expect(
            screen.getByTestId("report-date-preset-last-30-days"),
        ).toHaveAttribute("aria-pressed", "false")
        expect(
            screen.getByTestId("report-date-preset-this-year"),
        ).toHaveAttribute("aria-pressed", "false")
    })

    it("marca 'Últimos 30 dias' como ativo quando o range bate", () => {
        render(
            <ReportDatePresets
                dateFrom="2026-04-14"
                dateTo="2026-05-13"
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(
            screen.getByTestId("report-date-preset-last-30-days"),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("nenhum chip ativo para range customizado que não bate exatamente", () => {
        render(
            <ReportDatePresets
                dateFrom="2026-04-30"
                dateTo="2026-05-13"
                onSelect={vi.fn()}
                nowOverride={NOW}
            />,
        )

        for (const button of screen.getAllByRole("button")) {
            expect(button).toHaveAttribute("aria-pressed", "false")
        }
    })
})

describe("ReportDatePresets — onSelect", () => {
    it("dispara onSelect com o range correto ao clicar em 'Este mês'", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={onSelect}
                nowOverride={NOW}
            />,
        )

        await user.click(screen.getByTestId("report-date-preset-this-month"))

        expect(onSelect).toHaveBeenCalledWith({
            dateFrom: "2026-05-01",
            dateTo: "2026-05-13",
        })
    })

    it("dispara onSelect com range de 30 dias ao clicar em 'Últimos 30 dias'", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={onSelect}
                nowOverride={NOW}
            />,
        )

        await user.click(
            screen.getByTestId("report-date-preset-last-30-days"),
        )

        expect(onSelect).toHaveBeenCalledWith({
            dateFrom: "2026-04-14",
            dateTo: "2026-05-13",
        })
    })

    it("dispara onSelect com YTD ao clicar em 'Este ano'", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        render(
            <ReportDatePresets
                dateFrom={undefined}
                dateTo={undefined}
                onSelect={onSelect}
                nowOverride={NOW}
            />,
        )

        await user.click(screen.getByTestId("report-date-preset-this-year"))

        expect(onSelect).toHaveBeenCalledWith({
            dateFrom: "2026-01-01",
            dateTo: "2026-05-13",
        })
    })

    it("dispara onSelect mesmo ao clicar no chip JÁ ativo (= reset semântico)", async () => {
        const user = userEvent.setup()
        const onSelect = vi.fn()

        render(
            <ReportDatePresets
                dateFrom="2026-05-01"
                dateTo="2026-05-13"
                onSelect={onSelect}
                nowOverride={NOW}
            />,
        )

        await user.click(screen.getByTestId("report-date-preset-this-month"))

        // Diferente dos chips de período (que não disparam em ativo),
        // aqui o clique no chip ativo é válido: pode ser que o usuário
        // tenha alterado as datas manualmente e queira "voltar" ao preset.
        expect(onSelect).toHaveBeenCalledTimes(1)
    })
})