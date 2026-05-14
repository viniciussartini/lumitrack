import { describe, it, expect, beforeAll, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { UseQueryResult } from "@tanstack/react-query"
import { ReportView } from "@/components/report/ReportView"
import type {
    ReportFilters as ReportFiltersType,
    ReportResult,
} from "@/types/report.types"
import type { ConsumptionRecord } from "@/types/consumption.types"

// Mock do download — ReportActions (dentro do ReportView) importa downloadFile
vi.mock("@/lib/download/downloadFile", () => ({
    downloadFile: vi.fn(),
}))

// Mock do api — extractErrorMessage agora é importado pelo ReportView
vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro inesperado.",
}))

// Mock do Recharts (mesma config dos outros testes que tocam o chart)
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

// Mock do download — evita Blob real nos testes do view
vi.mock("@/lib/download/downloadFile", () => ({
    downloadFile: vi.fn(),
}))

const baseFilters: ReportFiltersType = { period: "MONTHLY" }
const baseEntityLabel = { artigo: "desta" as const, nome: "propriedade" }

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

const baseResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
    dateRange: { from: "2025-01-01", to: "2025-12-31" },
    summary: {
        totalKwh: 100,
        totalCostBrl: 75,
        recordCount: 1,
        avgKwhPerRecord: 100,
        trend: "STABLE",
    },
    records: [baseRecord],
}

const buildQuery = (
    overrides: Partial<UseQueryResult<ReportResult>>,
): UseQueryResult<ReportResult> => {
    const base = {
        data: undefined,
        error: null,
        isLoading: false,
        isSuccess: false,
        isError: false,
        isPending: false,
        isFetching: false,
        status: "success",
        fetchStatus: "idle",
        refetch: vi.fn(),
    }
    return { ...base, ...overrides } as unknown as UseQueryResult<ReportResult>
}

// ─────────────────────────────────────────────────────────────────────────────
// Estados (PR2 preservados)
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportView — loading", () => {
    it("renderiza skeleton enquanto a query carrega", () => {
        render(
            <ReportView
                query={buildQuery({ isLoading: true, isPending: true })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(screen.getByTestId("report-skeleton")).toBeInTheDocument()
    })

    it("NÃO renderiza ReportActions durante loading (PR3)", () => {
        render(
            <ReportView
                query={buildQuery({ isLoading: true, isPending: true })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(
            screen.queryByTestId("report-actions"),
        ).not.toBeInTheDocument()
    })
})

describe("ReportView — error", () => {
    it("renderiza alerta com mensagem do erro", () => {
        render(
            <ReportView
                query={buildQuery({
                    isError: true,
                    error: new Error("Falha de rede"),
                })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(screen.getByRole("alert")).toHaveTextContent(/falha de rede/i)
    })

    it("NÃO renderiza ReportActions em estado de erro (PR3)", () => {
        render(
            <ReportView
                query={buildQuery({
                    isError: true,
                    error: new Error("X"),
                })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(
            screen.queryByTestId("report-actions"),
        ).not.toBeInTheDocument()
    })

    it("aplica print-hide no banner de erro (PR3)", () => {
        render(
            <ReportView
                query={buildQuery({
                    isError: true,
                    error: new Error("X"),
                })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        const alert = screen.getByRole("alert")
        expect(alert.className).toMatch(/print-hide/)
    })
})

describe("ReportView — success com records", () => {
    it("renderiza meta, ações, summary, chart e tabela (PR3)", () => {
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: baseResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(screen.getByTestId("report-meta")).toBeInTheDocument()
        expect(screen.getByTestId("report-actions")).toBeInTheDocument()
        expect(screen.getByTestId("report-summary-cards")).toBeInTheDocument()
        expect(screen.getByTestId("report-chart")).toBeInTheDocument()
        expect(screen.getByTestId("report-records-table")).toBeInTheDocument()
    })

    it("Actions ficam visíveis na mesma linha do meta (não num bloco separado)", () => {
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: baseResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        // Pai imediato do meta deve conter também o actions, garantindo
        // que estão no mesmo container (flex justify-between).
        const meta = screen.getByTestId("report-meta")
        const actions = screen.getByTestId("report-actions")
        expect(meta.parentElement).toBe(actions.parentElement)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty (PR2)
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportView — success com records vazios", () => {
    const emptyResult: ReportResult = {
        ...baseResult,
        summary: {
            totalKwh: 0,
            totalCostBrl: 0,
            recordCount: 0,
            avgKwhPerRecord: 0,
            trend: "INSUFFICIENT_DATA",
        },
        records: [],
    }

    it("renderiza summary mesmo com 0 registros", () => {
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: emptyResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(screen.getByTestId("report-summary-cards")).toBeInTheDocument()
    })

    it("renderiza EmptyState NO LUGAR do chart e da tabela", () => {
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: emptyResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(
            screen.getByText(/sem registros no intervalo/i),
        ).toBeInTheDocument()
        expect(screen.queryByTestId("report-chart")).not.toBeInTheDocument()
    })

    it("renderiza ReportActions MESMO com records=[] (PR3)", () => {
        // Decisão consciente: actions seguem disponíveis em empty.
        // Imprimir um relatório vazio (com summary zerado) é caso
        // válido — comprova ao seu chefe que "esta área não consumiu".
        // O CSV exporta o cabeçalho + tabela vazia.
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: emptyResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(screen.getByTestId("report-actions")).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Refetch silencioso (PR2)
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportView — refetch silencioso", () => {
    it("renderiza indicator quando isFetching=true E há data", () => {
        render(
            <ReportView
                query={buildQuery({
                    isSuccess: true,
                    isFetching: true,
                    data: baseResult,
                })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        expect(
            screen.getByTestId("report-refetching-indicator"),
        ).toBeInTheDocument()
    })

    it("aplica print-hide no refetch indicator (PR3)", () => {
        render(
            <ReportView
                query={buildQuery({
                    isSuccess: true,
                    isFetching: true,
                    data: baseResult,
                })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        const indicator = screen.getByTestId("report-refetching-indicator")
        expect(indicator.className).toMatch(/print-hide/)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// print-hide nos blocos decorativos (PR3)
// ─────────────────────────────────────────────────────────────────────────────

describe("ReportView — print-hide (PR3)", () => {
    it("aplica print-hide no wrapper do ReportFilters", () => {
        render(
            <ReportView
                query={buildQuery({ isSuccess: true, data: baseResult })}
                filters={baseFilters}
                onFiltersChange={vi.fn()}
                entityLabel={baseEntityLabel}
            />,
        )

        const filters = screen.getByTestId("report-filters")
        // O wrapper PAI do ReportFilters tem print-hide
        expect(filters.parentElement?.className).toMatch(/print-hide/)
    })
})