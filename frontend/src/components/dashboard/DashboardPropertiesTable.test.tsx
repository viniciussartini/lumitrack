import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { DashboardPropertiesTable } from "@/components/dashboard/DashboardPropertiesTable"
import type { DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportFilters, ReportResult } from "@/types/report.types"

const makeResult = (overrides: Partial<ReportResult> = {}): ReportResult => ({
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "p1" },
    dateRange: null,
    summary: {
        totalKwh: 123.45,
        totalCostBrl: 67.89,
        recordCount: 3,
        avgKwhPerRecord: 41.15,
        trend: "STABLE",
    },
    records: [],
    ...overrides,
})

const makeEntry = (
    overrides: Partial<DashboardPropertyEntry> = {},
): DashboardPropertyEntry => ({
    propertyId: "p1",
    propertyName: "Casa",
    status: "success",
    result: makeResult(),
    error: null,
    ...overrides,
})

const renderTable = (
    entries: DashboardPropertyEntry[],
    filters: ReportFilters = { period: "MONTHLY" },
) =>
    render(
        <MemoryRouter>
            <DashboardPropertiesTable entries={entries} filters={filters} />
        </MemoryRouter>,
    )

describe("DashboardPropertiesTable — empty state", () => {
    it("renderiza placeholder quando entries vazio", () => {
        renderTable([])
        expect(
            screen.getByTestId("dashboard-properties-table-empty"),
        ).toBeInTheDocument()
    })
})

describe("DashboardPropertiesTable — render", () => {
    it("renderiza uma linha por propriedade", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1", propertyName: "Casa" }),
            makeEntry({
                propertyId: "p2",
                propertyName: "Escritório",
                result: makeResult({
                    summary: {
                        totalKwh: 200,
                        totalCostBrl: 100,
                        recordCount: 2,
                        avgKwhPerRecord: 100,
                        trend: "INCREASING",
                    },
                }),
            }),
        ]
        renderTable(entries)

        expect(
            screen.getByTestId("dashboard-property-row-p1"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-property-row-p2"),
        ).toBeInTheDocument()
    })

    it("formata kWh e custo em pt-BR", () => {
        renderTable([makeEntry({ propertyId: "p1" })])
        const row = screen.getByTestId("dashboard-property-row-p1")

        expect(row).toHaveTextContent("123,45 kWh")
        expect(row.textContent).toMatch(/R\$\s*67,89/)
    })

    it("renderiza o ReportTrendBadge correspondente à trend", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                result: makeResult({
                    summary: {
                        totalKwh: 100,
                        totalCostBrl: 0,
                        recordCount: 1,
                        avgKwhPerRecord: 100,
                        trend: "INCREASING",
                    },
                }),
            }),
        ]
        renderTable(entries)

        const row = screen.getByTestId("dashboard-property-row-p1")
        expect(
            within(row).getByTestId("report-trend-badge"),
        ).toHaveAttribute("data-trend", "INCREASING")
    })

    it("linkdo nome aponta para /propriedades/:id/relatorio com filtros", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1", propertyName: "Casa" }),
        ]
        renderTable(entries, {
            period: "DAILY",
            dateFrom: "2025-01-01",
            dateTo: "2025-01-31",
        })

        const link = screen.getByRole("link", {
            name: /ver relatório de casa/i,
        })
        expect(link).toHaveAttribute(
            "href",
            "/propriedades/p1/relatorio?period=DAILY&dateFrom=2025-01-01&dateTo=2025-01-31",
        )
    })

    it("link inclui apenas period quando datas estão ausentes", () => {
        renderTable([makeEntry({ propertyId: "p1" })], { period: "MONTHLY" })

        const link = screen.getByRole("link", {
            name: /ver relatório de casa/i,
        })
        expect(link).toHaveAttribute(
            "href",
            "/propriedades/p1/relatorio?period=MONTHLY",
        )
    })
})

describe("DashboardPropertiesTable — entry com erro", () => {
    it("renderiza a linha com mensagem de erro em vez de números", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p-err",
                propertyName: "Casa Quebrada",
                status: "error",
                result: null,
                error: "Falha de rede",
            }),
        ]
        renderTable(entries)

        const row = screen.getByTestId("dashboard-property-row-p-err")
        expect(row).toHaveTextContent("Casa Quebrada")
        expect(within(row).getByRole("alert")).toHaveTextContent(
            /falha de rede/i,
        )
        // Não tem link (não é clicável)
        expect(within(row).queryByRole("link")).not.toBeInTheDocument()
    })

    it("usa mensagem default quando error é null", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p-err",
                status: "error",
                result: null,
                error: null,
            }),
        ]
        renderTable(entries)

        expect(screen.getByRole("alert")).toHaveTextContent(
            /não foi possível carregar/i,
        )
    })
})