import { describe, it, expect, beforeAll, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { DashboardPropertiesChart } from "@/components/dashboard/DashboardPropertiesChart"
import type { DashboardPropertyEntry } from "@/types/dashboard.types"
import type { ReportResult } from "@/types/report.types"

/**
 * Mocks de dimensão pra Recharts renderizar em jsdom (mesmo padrão do
 * ReportChart.test.tsx). Sem ResizeObserver + clientWidth/Height, o
 * ResponsiveContainer fica 0x0 e o gráfico não monta.
 */
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

const makeResult = (overrides: Partial<ReportResult> = {}): ReportResult => ({
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "p1" },
    dateRange: null,
    summary: {
        totalKwh: 100,
        totalCostBrl: 50,
        recordCount: 1,
        avgKwhPerRecord: 100,
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

describe("DashboardPropertiesChart — empty state", () => {
    it("renderiza placeholder quando entries está vazio", () => {
        render(<DashboardPropertiesChart entries={[]} />)
        expect(
            screen.getByTestId("dashboard-properties-chart-empty"),
        ).toBeInTheDocument()
    })

    it("renderiza placeholder quando todas as entries têm recordCount=0", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                result: makeResult({
                    summary: {
                        totalKwh: 0,
                        totalCostBrl: 0,
                        recordCount: 0,
                        avgKwhPerRecord: 0,
                        trend: "INSUFFICIENT_DATA",
                    },
                }),
            }),
        ]
        render(<DashboardPropertiesChart entries={entries} />)
        expect(
            screen.getByTestId("dashboard-properties-chart-empty"),
        ).toBeInTheDocument()
    })

    it("renderiza placeholder quando todas as entries são erros", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                status: "error",
                result: null,
                error: "X",
            }),
        ]
        render(<DashboardPropertiesChart entries={entries} />)
        expect(
            screen.getByTestId("dashboard-properties-chart-empty"),
        ).toBeInTheDocument()
    })
})

describe("DashboardPropertiesChart — render", () => {
    it("renderiza o gráfico quando há ao menos uma entry com dados", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({
                propertyId: "p1",
                propertyName: "Casa",
            }),
        ]
        render(<DashboardPropertiesChart entries={entries} />)

        expect(
            screen.getByTestId("dashboard-properties-chart"),
        ).toBeInTheDocument()
        expect(
            screen.queryByTestId("dashboard-properties-chart-empty"),
        ).not.toBeInTheDocument()
    })

    it("exibe contagem singular/plural no header", () => {
        const oneEntry: DashboardPropertyEntry[] = [makeEntry()]
        const { rerender } = render(
            <DashboardPropertiesChart entries={oneEntry} />,
        )
        expect(screen.getByTestId("dashboard-properties-chart")).toHaveTextContent(
            "1 propriedade",
        )

        const twoEntries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({ propertyId: "p2", propertyName: "Escritório" }),
        ]
        rerender(<DashboardPropertiesChart entries={twoEntries} />)
        expect(screen.getByTestId("dashboard-properties-chart")).toHaveTextContent(
            "2 propriedades",
        )
    })

    it("filtra entries com status='error' do gráfico", () => {
        const entries: DashboardPropertyEntry[] = [
            makeEntry({ propertyId: "p1" }),
            makeEntry({
                propertyId: "p2",
                propertyName: "Erro",
                status: "error",
                result: null,
                error: "X",
            }),
        ]
        render(<DashboardPropertiesChart entries={entries} />)

        expect(screen.getByTestId("dashboard-properties-chart")).toHaveTextContent(
            "1 propriedade",
        )
    })

    it("aplica opacity-70 quando isRefetching=true", () => {
        const entries: DashboardPropertyEntry[] = [makeEntry()]
        render(
            <DashboardPropertiesChart entries={entries} isRefetching={true} />,
        )

        expect(
            screen.getByTestId("dashboard-properties-chart").className,
        ).toMatch(/opacity-70/)
    })
})