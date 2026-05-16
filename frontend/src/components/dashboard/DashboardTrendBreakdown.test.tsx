import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DashboardTrendBreakdown } from "@/components/dashboard/DashboardTrendBreakdown"

describe("DashboardTrendBreakdown", () => {
    it("renderiza placeholder quando todas as contagens são 0", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 0,
                    decreasing: 0,
                    stable: 0,
                    insufficient: 0,
                }}
            />,
        )

        expect(
            screen.getByTestId("dashboard-trend-breakdown-empty"),
        ).toBeInTheDocument()
    })

    it("renderiza cada pílula com count > 0", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 2,
                    decreasing: 1,
                    stable: 3,
                    insufficient: 0,
                }}
            />,
        )

        expect(
            screen.getByTestId("dashboard-trend-pill-increasing"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-trend-pill-decreasing"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-trend-pill-stable"),
        ).toBeInTheDocument()
        expect(
            screen.queryByTestId("dashboard-trend-pill-insufficient"),
        ).not.toBeInTheDocument()
    })

    it("usa singular quando count=1 ('em alta' vs 'em alta' — texto não muda; 'estável' vs 'estáveis')", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 0,
                    decreasing: 0,
                    stable: 1,
                    insufficient: 0,
                }}
            />,
        )
        const pill = screen.getByTestId("dashboard-trend-pill-stable")
        expect(pill).toHaveTextContent("estável")
        expect(pill).not.toHaveTextContent("estáveis")
    })

    it("usa plural quando count>1", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 0,
                    decreasing: 0,
                    stable: 2,
                    insufficient: 0,
                }}
            />,
        )
        expect(
            screen.getByTestId("dashboard-trend-pill-stable"),
        ).toHaveTextContent("estáveis")
    })

    it("usa aria-label descritivo com singular/plural correto", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 1,
                    decreasing: 3,
                    stable: 0,
                    insufficient: 0,
                }}
            />,
        )

        expect(
            screen.getByLabelText("1 propriedade em alta"),
        ).toBeInTheDocument()
        expect(
            screen.getByLabelText("3 propriedades em queda"),
        ).toBeInTheDocument()
    })

    it("exibe a contagem numérica em tabular-nums", () => {
        render(
            <DashboardTrendBreakdown
                breakdown={{
                    increasing: 42,
                    decreasing: 0,
                    stable: 0,
                    insufficient: 0,
                }}
            />,
        )

        const pill = screen.getByTestId("dashboard-trend-pill-increasing")
        expect(pill).toHaveTextContent("42")
    })
})