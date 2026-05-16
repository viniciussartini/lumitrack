import { describe, it, expect, beforeAll, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { DashboardView } from "@/components/dashboard/DashboardView"
import { downloadFile } from "@/lib/download/downloadFile"
import type { DashboardData } from "@/types/dashboard.types"

vi.mock("@/lib/download/downloadFile", () => ({
    downloadFile: vi.fn(),
}))

vi.mock("@/lib/csv/dashboardCsv", () => ({
    buildDashboardCsv: vi.fn(() => "csv-content"),
    buildDashboardCsvFilename: vi.fn(() => "dashboard_monthly_2026-05-13.csv"),
}))

beforeEach(() => {
    vi.clearAllMocks()
})

beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        value: 800,
    })
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        value: 320,
    })
    if (!("ResizeObserver" in globalThis)) {
        ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
            observe = vi.fn()
            unobserve = vi.fn()
            disconnect = vi.fn()
        }
    }
})

const baseData: DashboardData = {
    summary: {
        totalKwh: 300,
        totalCostBrl: 150,
        recordCount: 3,
        propertyCount: 2,
        propertyWithDataCount: 2,
        trendBreakdown: {
            increasing: 1,
            decreasing: 0,
            stable: 1,
            insufficient: 0,
        },
    },
    perProperty: [
        {
            propertyId: "p1",
            propertyName: "Casa",
            status: "success",
            error: null,
            result: {
                generatedAt: "2025-05-13T12:00:00.000Z",
                period: "MONTHLY",
                target: { type: "PROPERTY", propertyId: "p1" },
                dateRange: null,
                summary: {
                    totalKwh: 200,
                    totalCostBrl: 100,
                    recordCount: 2,
                    avgKwhPerRecord: 100,
                    trend: "INCREASING",
                },
                records: [],
            },
        },
        {
            propertyId: "p2",
            propertyName: "Escritório",
            status: "success",
            error: null,
            result: {
                generatedAt: "2025-05-13T12:00:00.000Z",
                period: "MONTHLY",
                target: { type: "PROPERTY", propertyId: "p2" },
                dateRange: null,
                summary: {
                    totalKwh: 100,
                    totalCostBrl: 50,
                    recordCount: 1,
                    avgKwhPerRecord: 100,
                    trend: "STABLE",
                },
                records: [],
            },
        },
    ],
    timeSeries: [
        {
            referenceDate: "2025-01-01T00:00:00.000Z",
            period: "MONTHLY",
            totalKwh: 300,
            totalCostBrl: 150,
            propertyCount: 2,
        },
    ],
}

const NOW = new Date(2026, 4, 13, 12, 0)

const renderView = (
    overrides: Partial<React.ComponentProps<typeof DashboardView>> = {},
) =>
    render(
        <MemoryRouter>
            <DashboardView
                data={baseData}
                filters={{ period: "MONTHLY" }}
                onFiltersChange={vi.fn()}
                isPartial={false}
                errorCount={0}
                nowOverride={NOW}
                {...overrides}
            />
        </MemoryRouter>,
    )

describe("DashboardView — composição", () => {
    it("renderiza filtros, ações, summary, ambos os charts e a tabela", () => {
        renderView()

        expect(screen.getByTestId("report-filters")).toBeInTheDocument()
        expect(screen.getByTestId("dashboard-actions")).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-summary-cards"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-properties-chart"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-time-series-chart"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-properties-table"),
        ).toBeInTheDocument()
    })

    it("botão Imprimir aciona window.print()", async () => {
        const printSpy = vi.fn()
        vi.stubGlobal("print", printSpy)

        const user = userEvent.setup()
        renderView()

        await user.click(screen.getByTestId("dashboard-action-print"))

        expect(printSpy).toHaveBeenCalledTimes(1)
        vi.unstubAllGlobals()
    })

    it("botão CSV aciona downloadFile com csv e filename corretos", async () => {
        const user = userEvent.setup()
        renderView()

        await user.click(screen.getByTestId("dashboard-action-csv"))

        expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
            "dashboard_monthly_2026-05-13.csv",
            "text/csv;charset=utf-8",
            "csv-content",
        )
    })

    it("dashboard-actions tem classe print-hide", () => {
        renderView()
        expect(
            screen.getByTestId("dashboard-actions").className,
        ).toMatch(/print-hide/)
    })

    it("NÃO mostra banner de erro parcial quando isPartial=false", () => {
        renderView()
        expect(
            screen.queryByTestId("dashboard-partial-error"),
        ).not.toBeInTheDocument()
    })
})

describe("DashboardView — erro parcial", () => {
    it("mostra banner com texto 'X de Y' quando isPartial=true", () => {
        renderView({ isPartial: true, errorCount: 1 })

        const banner = screen.getByTestId("dashboard-partial-error")
        expect(banner).toBeInTheDocument()
        expect(banner).toHaveTextContent("1 de 2")
        expect(banner).toHaveTextContent(/propriedade/i)
    })

    it("usa plural quando errorCount > 1", () => {
        const dataWith3: DashboardData = {
            ...baseData,
            summary: {
                ...baseData.summary,
                propertyCount: 5,
            },
        }
        renderView({
            data: dataWith3,
            isPartial: true,
            errorCount: 2,
        })

        const banner = screen.getByTestId("dashboard-partial-error")
        expect(banner).toHaveTextContent("2 de 5")
        expect(banner).toHaveTextContent(/propriedades/i)
    })
})

describe("DashboardView — interação com filtros", () => {
    it("propaga onChange do ReportFilters", async () => {
        const onFiltersChange = vi.fn()
        const user = userEvent.setup()

        renderView({ onFiltersChange })

        await user.click(screen.getByTestId("report-period-chip-daily"))

        expect(onFiltersChange).toHaveBeenCalledWith({
            period: "DAILY",
        })
    })
})