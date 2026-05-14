import { describe, it, expect, beforeAll, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ReportChart } from "@/components/report/ReportChart"
import type { ConsumptionRecord } from "@/types/consumption.types"

/**
 * Recharts v3 usa ResizeObserver + getBoundingClientRect() para calcular
 * as dimensões do ResponsiveContainer antes de renderizar o SVG.
 *
 * Em jsdom todos retornam 0 por padrão. Sem os mocks abaixo, o
 * ResponsiveContainer vê width=0 e não renderiza nada (SVG nunca aparece).
 *
 * O que cada mock faz:
 *
 *   clientWidth / clientHeight (HTMLElement.prototype):
 *     Lido antes do ResizeObserver callback — informa ao ResponsiveContainer
 *     o tamanho inicial do container.
 *
 *   getBoundingClientRect (HTMLElement.prototype):
 *     Chamado pelo ResizeObserver observer para dimensionar o SVG.
 *     Precisa retornar um DOMRect-like com width e height > 0.
 *
 *   ResizeObserver (global):
 *     jsdom não implementa. Mock chama o callback imediatamente com
 *     contentRect fictício, simulando o que o browser faria ao montar.
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

    // getBoundingClientRect é o que o Recharts v3 usa internamente no
    // ResizeObserver callback para calcular as dimensões reais do SVG.
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
        width: 800,
        height: 320,
        top: 0,
        left: 0,
        bottom: 320,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
    }))

    // ResizeObserver: chama o callback imediatamente com o contentRect
    // simulado para que o ResponsiveContainer não fique aguardando o
    // evento de resize que nunca vem em jsdom.
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        private callback: ResizeObserverCallback

        constructor(cb: ResizeObserverCallback) {
            this.callback = cb
        }

        observe(target: Element) {
            // Dispara imediatamente, simulando o browser informando o tamanho
            this.callback(
                [
                    {
                        target,
                        contentRect: {
                            width: 800,
                            height: 320,
                            top: 0,
                            left: 0,
                            bottom: 320,
                            right: 800,
                            x: 0,
                            y: 0,
                            toJSON: () => {},
                        },
                        borderBoxSize: [],
                        contentBoxSize: [],
                        devicePixelContentBoxSize: [],
                    },
                ],
                this,
            )
        }

        unobserve = vi.fn()
        disconnect = vi.fn()
    }
})

const baseRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "MONTHLY",
    referenceDate: "2025-01-15T12:00:00.000Z",
    kwhConsumed: 100,
    costBrl: 75,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

describe("ReportChart — estado vazio", () => {
    it("renderiza placeholder 'Sem dados' quando records=[]", () => {
        render(<ReportChart records={[]} />)

        expect(screen.getByTestId("report-chart-empty")).toBeInTheDocument()
        expect(screen.getByText("Sem dados para o gráfico")).toBeInTheDocument()
    })

    it("NÃO renderiza o chart principal quando records=[]", () => {
        render(<ReportChart records={[]} />)
        expect(screen.queryByTestId("report-chart")).not.toBeInTheDocument()
    })

    it("mantém altura consistente do placeholder (h-80 = mesma que o chart)", () => {
        const { container } = render(<ReportChart records={[]} />)
        expect(container.querySelector(".h-80")).not.toBeNull()
    })
})

describe("ReportChart — com dados", () => {
    it("renderiza o container do chart quando há records", () => {
        render(<ReportChart records={[baseRecord]} />)

        expect(screen.getByTestId("report-chart")).toBeInTheDocument()
    })

    it("NÃO renderiza o placeholder de vazio quando há records", () => {
        render(<ReportChart records={[baseRecord]} />)
        expect(
            screen.queryByTestId("report-chart-empty"),
        ).not.toBeInTheDocument()
    })

    it("renderiza um SVG com múltiplos registros", () => {
        const records: ConsumptionRecord[] = [
            { ...baseRecord, id: "rec-1", kwhConsumed: 80 },
            {
                ...baseRecord,
                id: "rec-2",
                kwhConsumed: 95,
                referenceDate: "2025-02-15T12:00:00.000Z",
            },
            {
                ...baseRecord,
                id: "rec-3",
                kwhConsumed: 110,
                referenceDate: "2025-03-15T12:00:00.000Z",
            },
        ]

        const { container } = render(<ReportChart records={records} />)

        // Com getBoundingClientRect mockado retornando 800×320, o
        // ResponsiveContainer passa as dimensões pro BarChart e o SVG
        // é renderizado normalmente.
        const svg = container.querySelector("svg")
        expect(svg).not.toBeNull()
    })
})

describe("ReportChart — refetch", () => {
    it("aplica opacity reduzida quando isRefetching=true", () => {
        render(<ReportChart records={[baseRecord]} isRefetching />)

        const chart = screen.getByTestId("report-chart")
        expect(chart.className).toMatch(/opacity-60/)
    })

    it("NÃO aplica opacity quando isRefetching=false", () => {
        render(<ReportChart records={[baseRecord]} isRefetching={false} />)

        const chart = screen.getByTestId("report-chart")
        expect(chart.className).not.toMatch(/opacity-60/)
    })

    it("mantém o chart visível durante refetch (não desmonta)", () => {
        const { rerender } = render(<ReportChart records={[baseRecord]} />)
        expect(screen.getByTestId("report-chart")).toBeInTheDocument()

        rerender(<ReportChart records={[baseRecord]} isRefetching />)
        expect(screen.getByTestId("report-chart")).toBeInTheDocument()
    })
})