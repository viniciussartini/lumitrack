import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { DashboardSummaryCards } from "@/components/dashboard/DashboardSummaryCards"
import type { DashboardSummary } from "@/types/dashboard.types"

const baseSummary: DashboardSummary = {
    totalKwh: 1234.56,
    totalCostBrl: 567.89,
    recordCount: 12,
    propertyCount: 5,
    propertyWithDataCount: 3,
    trendBreakdown: {
        increasing: 2,
        decreasing: 1,
        stable: 0,
        insufficient: 2,
    },
}

describe("DashboardSummaryCards", () => {
    it("renderiza os 4 cards", () => {
        render(<DashboardSummaryCards summary={baseSummary} />)

        expect(
            screen.getByTestId("dashboard-summary-totalKwh"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-summary-totalCost"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-summary-properties"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-summary-trends"),
        ).toBeInTheDocument()
    })

    it("formata totalKwh em pt-BR com sufixo kWh", () => {
        render(<DashboardSummaryCards summary={baseSummary} />)
        expect(
            screen.getByTestId("dashboard-summary-totalKwh"),
        ).toHaveTextContent("1.234,56 kWh")
    })

    it("formata totalCostBrl em R$", () => {
        render(<DashboardSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("dashboard-summary-totalCost")
        expect(card.textContent).toMatch(/R\$\s*567,89/)
    })

    it("exibe propriedades como 'X de Y' com legenda explicativa", () => {
        render(<DashboardSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("dashboard-summary-properties")

        expect(card).toHaveTextContent("3")
        expect(card).toHaveTextContent("de 5")
        expect(card).toHaveTextContent(/com dados no período/i)
    })

    it("renderiza DashboardTrendBreakdown dentro do card de tendências", () => {
        render(<DashboardSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("dashboard-summary-trends")

        expect(
            within(card).getByTestId("dashboard-trend-breakdown"),
        ).toBeInTheDocument()
        // 2 increasing + 1 decreasing + 2 insufficient — stable=0 omite
        expect(
            within(card).getByTestId("dashboard-trend-pill-increasing"),
        ).toBeInTheDocument()
        expect(
            within(card).queryByTestId("dashboard-trend-pill-stable"),
        ).not.toBeInTheDocument()
    })

    it("renderiza valores zerados sem 'NaN'", () => {
        const empty: DashboardSummary = {
            totalKwh: 0,
            totalCostBrl: 0,
            recordCount: 0,
            propertyCount: 0,
            propertyWithDataCount: 0,
            trendBreakdown: {
                increasing: 0,
                decreasing: 0,
                stable: 0,
                insufficient: 0,
            },
        }
        render(<DashboardSummaryCards summary={empty} />)

        expect(
            screen.getByTestId("dashboard-summary-totalKwh"),
        ).toHaveTextContent("0,00 kWh")
        expect(
            screen.getByTestId("dashboard-summary-properties"),
        ).toHaveTextContent("0")
        // Breakdown vazio mostra placeholder
        expect(
            screen.getByTestId("dashboard-trend-breakdown-empty"),
        ).toBeInTheDocument()
    })
})