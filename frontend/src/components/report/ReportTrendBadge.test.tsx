import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ReportTrendBadge } from "@/components/report/ReportTrendBadge"

describe("ReportTrendBadge", () => {
    it("renderiza label 'Em alta' para INCREASING", () => {
        render(<ReportTrendBadge trend="INCREASING" />)
        expect(screen.getByText("Em alta")).toBeInTheDocument()
    })

    it("renderiza label 'Em queda' para DECREASING", () => {
        render(<ReportTrendBadge trend="DECREASING" />)
        expect(screen.getByText("Em queda")).toBeInTheDocument()
    })

    it("renderiza label 'Estável' para STABLE", () => {
        render(<ReportTrendBadge trend="STABLE" />)
        expect(screen.getByText("Estável")).toBeInTheDocument()
    })

    it("renderiza 'Dados insuficientes' para INSUFFICIENT_DATA", () => {
        render(<ReportTrendBadge trend="INSUFFICIENT_DATA" />)
        expect(screen.getByText("Dados insuficientes")).toBeInTheDocument()
    })

    it("aplica data-trend para reflexão em testes/CSS", () => {
        const { rerender } = render(<ReportTrendBadge trend="INCREASING" />)
        expect(screen.getByTestId("report-trend-badge")).toHaveAttribute(
            "data-trend",
            "INCREASING",
        )

        rerender(<ReportTrendBadge trend="DECREASING" />)
        expect(screen.getByTestId("report-trend-badge")).toHaveAttribute(
            "data-trend",
            "DECREASING",
        )
    })

    it("usa aria-label descritivo com prefixo 'Tendência:'", () => {
        render(<ReportTrendBadge trend="DECREASING" />)
        expect(screen.getByLabelText("Tendência: Em queda")).toBeInTheDocument()
    })
})