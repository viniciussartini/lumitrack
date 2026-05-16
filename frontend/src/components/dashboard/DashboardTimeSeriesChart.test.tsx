import { describe, it, expect, beforeAll, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { DashboardTimeSeriesChart } from "@/components/dashboard/DashboardTimeSeriesChart"
import type { DashboardTimeSeriesPoint } from "@/types/dashboard.types"

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

const makePoint = (
    overrides: Partial<DashboardTimeSeriesPoint> = {},
): DashboardTimeSeriesPoint => ({
    referenceDate: "2025-01-01T00:00:00.000Z",
    period: "MONTHLY",
    totalKwh: 100,
    totalCostBrl: 50,
    propertyCount: 1,
    ...overrides,
})

describe("DashboardTimeSeriesChart — empty state", () => {
    it("renderiza placeholder quando points está vazio", () => {
        render(
            <DashboardTimeSeriesChart points={[]} period="MONTHLY" />,
        )

        expect(
            screen.getByTestId("dashboard-time-series-empty"),
        ).toBeInTheDocument()
        expect(
            screen.queryByTestId("dashboard-time-series-chart"),
        ).not.toBeInTheDocument()
    })
})

describe("DashboardTimeSeriesChart — render", () => {
    it("renderiza o gráfico com 1+ point", () => {
        render(
            <DashboardTimeSeriesChart
                points={[makePoint()]}
                period="MONTHLY"
            />,
        )

        expect(
            screen.getByTestId("dashboard-time-series-chart"),
        ).toBeInTheDocument()
    })

    it("exibe contagem singular/plural no header", () => {
        const { rerender } = render(
            <DashboardTimeSeriesChart
                points={[makePoint()]}
                period="MONTHLY"
            />,
        )

        expect(
            screen.getByTestId("dashboard-time-series-chart"),
        ).toHaveTextContent("1 ponto")

        rerender(
            <DashboardTimeSeriesChart
                points={[
                    makePoint({ referenceDate: "2025-01-01T00:00:00.000Z" }),
                    makePoint({ referenceDate: "2025-02-01T00:00:00.000Z" }),
                    makePoint({ referenceDate: "2025-03-01T00:00:00.000Z" }),
                ]}
                period="MONTHLY"
            />,
        )

        expect(
            screen.getByTestId("dashboard-time-series-chart"),
        ).toHaveTextContent("3 pontos")
    })

    it("aplica opacity-70 quando isRefetching=true", () => {
        render(
            <DashboardTimeSeriesChart
                points={[makePoint()]}
                period="MONTHLY"
                isRefetching={true}
            />,
        )

        expect(
            screen.getByTestId("dashboard-time-series-chart").className,
        ).toMatch(/opacity-70/)
    })

    it("inclui título 'Evolução agregada no tempo'", () => {
        render(
            <DashboardTimeSeriesChart
                points={[makePoint()]}
                period="MONTHLY"
            />,
        )

        expect(
            screen.getByRole("heading", { name: /evolução agregada/i }),
        ).toBeInTheDocument()
    })
})