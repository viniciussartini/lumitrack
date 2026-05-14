import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { ReportSummaryCards } from "@/components/report/ReportSummaryCards"
import type { ReportSummary } from "@/types/report.types"

const baseSummary: ReportSummary = {
    totalKwh: 123.45,
    totalCostBrl: 89.9,
    recordCount: 4,
    avgKwhPerRecord: 30.86,
    trend: "STABLE",
}

describe("ReportSummaryCards", () => {
    it("renderiza os 4 cards", () => {
        render(<ReportSummaryCards summary={baseSummary} />)

        expect(screen.getByTestId("report-summary-totalKwh")).toBeInTheDocument()
        expect(screen.getByTestId("report-summary-totalCost")).toBeInTheDocument()
        expect(
            screen.getByTestId("report-summary-recordCount"),
        ).toBeInTheDocument()
        expect(screen.getByTestId("report-summary-avgKwh")).toBeInTheDocument()
    })

    it("formata totalKwh em pt-BR com sufixo kWh", () => {
        render(<ReportSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("report-summary-totalKwh")
        expect(card).toHaveTextContent("123,45 kWh")
    })

    it("formata totalCostBrl como moeda BRL", () => {
        render(<ReportSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("report-summary-totalCost")
        // Intl insere NBSP entre R$ e valor — \s pega NBSP.
        expect(card.textContent).toMatch(/R\$\s89,90/)
    })

    it("exibe recordCount sem formatação decimal", () => {
        render(<ReportSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("report-summary-recordCount")
        expect(within(card).getByText("4")).toBeInTheDocument()
    })

    it("formata avgKwhPerRecord em pt-BR com sufixo kWh", () => {
        render(<ReportSummaryCards summary={baseSummary} />)
        const card = screen.getByTestId("report-summary-avgKwh")
        // 30.86 → "30,86 kWh"
        expect(card).toHaveTextContent("30,86 kWh")
    })

    it("renderiza ReportTrendBadge dentro do card de kWh (não nos outros)", () => {
        render(
            <ReportSummaryCards
                summary={{ ...baseSummary, trend: "DECREASING" }}
            />,
        )

        const totalKwhCard = screen.getByTestId("report-summary-totalKwh")
        expect(
            within(totalKwhCard).getByTestId("report-trend-badge"),
        ).toBeInTheDocument()

        const costCard = screen.getByTestId("report-summary-totalCost")
        expect(
            within(costCard).queryByTestId("report-trend-badge"),
        ).not.toBeInTheDocument()
    })

    it("repassa o trend correto para o badge", () => {
        render(
            <ReportSummaryCards
                summary={{ ...baseSummary, trend: "INCREASING" }}
            />,
        )

        expect(
            screen.getByTestId("report-trend-badge"),
        ).toHaveAttribute("data-trend", "INCREASING")
    })

    it("renderiza zero corretamente (não 'NaN' nem em branco)", () => {
        const empty: ReportSummary = {
            totalKwh: 0,
            totalCostBrl: 0,
            recordCount: 0,
            avgKwhPerRecord: 0,
            trend: "INSUFFICIENT_DATA",
        }
        render(<ReportSummaryCards summary={empty} />)

        expect(
            screen.getByTestId("report-summary-totalKwh"),
        ).toHaveTextContent("0,00 kWh")
        expect(
            screen.getByTestId("report-summary-recordCount").textContent,
        ).toContain("0")
    })
})