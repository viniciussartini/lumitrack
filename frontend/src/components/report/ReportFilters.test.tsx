import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReportFilters } from "@/components/report/ReportFilters"
import type { ReportFilters as ReportFiltersType } from "@/types/report.types"

const baseValue: ReportFiltersType = {
    period: "MONTHLY",
}

const NOW = new Date(2026, 4, 13, 14, 0) // 13/05/2026

describe("ReportFilters — chips de período (PR1)", () => {
    it("renderiza os 3 chips na ordem canônica: Diário, Mensal, Anual", () => {
        render(<ReportFilters value={baseValue} onChange={vi.fn()} />)

        const group = screen.getByRole("group", {
            name: /período do relatório/i,
        })
        const buttons = group.querySelectorAll("button[aria-pressed]")
        expect(Array.from(buttons).map((b) => b.textContent)).toEqual([
            "Diário",
            "Mensal",
            "Anual",
        ])
    })

    it("marca o chip do period atual como ativo", () => {
        render(<ReportFilters value={baseValue} onChange={vi.fn()} />)

        expect(
            screen.getByTestId("report-period-chip-monthly"),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("dispara onChange com o novo period ao clicar num chip inativo", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<ReportFilters value={baseValue} onChange={onChange} />)

        await user.click(screen.getByTestId("report-period-chip-daily"))

        expect(onChange).toHaveBeenCalledWith({ period: "DAILY" })
    })

    it("não dispara onChange ao clicar no chip JÁ ativo (no-op)", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(<ReportFilters value={baseValue} onChange={onChange} />)

        await user.click(screen.getByTestId("report-period-chip-monthly"))

        expect(onChange).not.toHaveBeenCalled()
    })
})

describe("ReportFilters — validação de range inline (PR1)", () => {
    it("mostra erro quando dateTo < dateFrom", () => {
        render(
            <ReportFilters
                value={{
                    period: "MONTHLY",
                    dateFrom: "2025-06-01",
                    dateTo: "2025-01-01",
                }}
                onChange={vi.fn()}
            />,
        )

        expect(
            screen.getByText(/maior ou igual à inicial/i),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("report-filter-dateTo"),
        ).toHaveAttribute("aria-invalid", "true")
    })
})

describe("ReportFilters — clear datas (PR1)", () => {
    it("botão 'Limpar datas' só aparece quando há ao menos uma data", () => {
        const { rerender } = render(
            <ReportFilters value={baseValue} onChange={vi.fn()} />,
        )

        expect(
            screen.queryByTestId("report-filter-clearDates"),
        ).not.toBeInTheDocument()

        rerender(
            <ReportFilters
                value={{ ...baseValue, dateFrom: "2025-01-01" }}
                onChange={vi.fn()}
            />,
        )

        expect(
            screen.getByTestId("report-filter-clearDates"),
        ).toBeInTheDocument()
    })

    it("clica em 'Limpar datas' e dispara onChange resetando ambas", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()
        render(
            <ReportFilters
                value={{
                    period: "MONTHLY",
                    dateFrom: "2025-01-01",
                    dateTo: "2025-06-30",
                }}
                onChange={onChange}
            />,
        )

        await user.click(screen.getByTestId("report-filter-clearDates"))

        expect(onChange).toHaveBeenCalledWith({
            period: "MONTHLY",
            dateFrom: undefined,
            dateTo: undefined,
        })
    })
})

describe("ReportFilters — presets (PR2)", () => {
    it("renderiza os chips de preset entre período e inputs de data", () => {
        render(
            <ReportFilters
                value={baseValue}
                onChange={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(screen.getByTestId("report-date-presets")).toBeInTheDocument()
    })

    it("aplica range do preset 'Este mês' via onChange, PRESERVANDO period", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()

        render(
            <ReportFilters
                value={{ period: "DAILY" }}
                onChange={onChange}
                nowOverride={NOW}
            />,
        )

        await user.click(screen.getByTestId("report-date-preset-this-month"))

        expect(onChange).toHaveBeenCalledWith({
            period: "DAILY",                   // ← period preservado
            dateFrom: "2026-05-01",
            dateTo: "2026-05-13",
        })
    })

    it("aplica range do preset 'Últimos 30 dias' via onChange", async () => {
        const user = userEvent.setup()
        const onChange = vi.fn()

        render(
            <ReportFilters
                value={baseValue}
                onChange={onChange}
                nowOverride={NOW}
            />,
        )

        await user.click(
            screen.getByTestId("report-date-preset-last-30-days"),
        )

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                dateFrom: "2026-04-14",
                dateTo: "2026-05-13",
            }),
        )
    })

    it("destaca o preset ativo quando o range das datas casa", () => {
        render(
            <ReportFilters
                value={{
                    period: "MONTHLY",
                    dateFrom: "2026-01-01",
                    dateTo: "2026-05-13",
                }}
                onChange={vi.fn()}
                nowOverride={NOW}
            />,
        )

        expect(
            screen.getByTestId("report-date-preset-this-year"),
        ).toHaveAttribute("aria-pressed", "true")
    })

    it("nenhum preset ativo para datas customizadas (não batem com nenhum)", () => {
        render(
            <ReportFilters
                value={{
                    period: "MONTHLY",
                    dateFrom: "2025-07-15",
                    dateTo: "2025-09-20",
                }}
                onChange={vi.fn()}
                nowOverride={NOW}
            />,
        )

        for (const id of [
            "report-date-preset-this-month",
            "report-date-preset-last-30-days",
            "report-date-preset-this-year",
        ]) {
            expect(screen.getByTestId(id)).toHaveAttribute(
                "aria-pressed",
                "false",
            )
        }
    })
})

describe("ReportFilters — layout (PR2)", () => {
    it("ordem dos blocos: período → presets → inputs de data", () => {
        render(
            <ReportFilters
                value={baseValue}
                onChange={vi.fn()}
                nowOverride={NOW}
            />,
        )

        const container = screen.getByTestId("report-filters")
        const periodBlock = container.querySelector(
            "[aria-label='Período do relatório']",
        )
        const presetsBlock = screen.getByTestId("report-date-presets")
        const dateFromInput = screen.getByTestId("report-filter-dateFrom")

        // Document order: period antes de presets, presets antes de dates.
        expect(
            periodBlock!.compareDocumentPosition(presetsBlock),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(
            presetsBlock.compareDocumentPosition(dateFromInput),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
})