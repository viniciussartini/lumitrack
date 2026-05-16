import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useDashboard } from "@/hooks/queries/useDashboard"
import { propertyService } from "@/services/property.service"
import { reportService } from "@/services/report.service"
import type { Property } from "@/types/property.types"
import type { ReportFilters, ReportResult } from "@/types/report.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
    },
}))

vi.mock("@/services/report.service", () => ({
    reportService: {
        generateByProperty: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (e: unknown) =>
        e instanceof Error ? e.message : "Erro",
}))

const makeProperty = (overrides: Partial<Property> = {}): Property => ({
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa",
    address: "Rua A, 1",
    city: "São Paulo",
    state: "SP",
    zipCode: "01234-567",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

const makeResult = (overrides: Partial<ReportResult> = {}): ReportResult => ({
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
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

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo principal
// ─────────────────────────────────────────────────────────────────────────────

describe("useDashboard — fluxo de sucesso", () => {
    it("retorna dashboardData agregado quando todas as queries respondem", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1", name: "Casa" }),
            makeProperty({ id: "p2", name: "Escritório" }),
        ])

        vi.mocked(reportService.generateByProperty)
            .mockResolvedValueOnce(
                makeResult({
                    summary: {
                        totalKwh: 100,
                        totalCostBrl: 50,
                        recordCount: 1,
                        avgKwhPerRecord: 100,
                        trend: "STABLE",
                    },
                }),
            )
            .mockResolvedValueOnce(
                makeResult({
                    summary: {
                        totalKwh: 200,
                        totalCostBrl: 100,
                        recordCount: 2,
                        avgKwhPerRecord: 100,
                        trend: "INCREASING",
                    },
                }),
            )

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(result.current.dashboardData).not.toBeNull()
        })

        expect(result.current.dashboardData!.summary.totalKwh).toBe(300)
        expect(result.current.dashboardData!.summary.recordCount).toBe(3)
        expect(result.current.dashboardData!.perProperty).toHaveLength(2)
        // Ranking: Escritório (200) primeiro
        expect(
            result.current.dashboardData!.perProperty[0]!.propertyName,
        ).toBe("Escritório")
    })

    it("chama reportService com os filtros corretos", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1" }),
        ])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult(),
        )

        const filters: ReportFilters = {
            period: "DAILY",
            dateFrom: "2025-01-01",
            dateTo: "2025-01-31",
        }

        renderHook(
            () => useDashboard({ filters }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "p1",
                {
                    period: "DAILY",
                    dateFrom: "2025-01-01",
                    dateTo: "2025-01-31",
                },
            )
        })
    })

    it("dashboardData fica null enquanto reports ainda carregam", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1" }),
        ])

        // Promise que não resolve — simula loading infinito
        vi.mocked(reportService.generateByProperty).mockImplementation(
            () => new Promise(() => {}),
        )

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(result.current.isLoadingReports).toBe(true)
        })

        expect(result.current.dashboardData).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// User sem propriedades
// ─────────────────────────────────────────────────────────────────────────────

describe("useDashboard — user sem propriedades", () => {
    it("dashboardData fica com summary zerado e perProperty vazio", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([])

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(result.current.dashboardData).not.toBeNull()
        })

        expect(result.current.dashboardData!.summary.propertyCount).toBe(0)
        expect(result.current.dashboardData!.perProperty).toEqual([])
        expect(result.current.dashboardData!.timeSeries).toEqual([])

        // Não disparou nenhuma report query
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erros parciais
// ─────────────────────────────────────────────────────────────────────────────

describe("useDashboard — erros parciais", () => {
    it("isPartial=true e errorCount=1 quando 1 de 2 reports falha", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1", name: "Casa" }),
            makeProperty({ id: "p2", name: "Escritório" }),
        ])

        vi.mocked(reportService.generateByProperty)
            .mockResolvedValueOnce(makeResult())
            .mockRejectedValueOnce(new Error("Falha de rede"))

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        // Aguarda até o errorCount estabilizar em 1 — mais preciso que
        // isLoadingReports porque garante que AMBAS as queries terminaram
        // (1 com sucesso, 1 com erro) antes de checar isPartial.
        await waitFor(() => {
            expect(result.current.errorCount).toBe(1)
            expect(result.current.isLoadingReports).toBe(false)
        })

        expect(result.current.isPartial).toBe(true)
        expect(result.current.dashboardData).not.toBeNull()

        // A entry com sucesso continua acessível
        const successEntry = result.current.dashboardData!.perProperty.find(
            (e) => e.status === "success",
        )
        expect(successEntry).toBeDefined()

        // E a com erro também está representada
        const errorEntry = result.current.dashboardData!.perProperty.find(
            (e) => e.status === "error",
        )
        expect(errorEntry).toBeDefined()
        expect(errorEntry!.error).toBe("Falha de rede")
    })

    it("isPartial=false quando TODAS falham (errorCount=length)", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1" }),
            makeProperty({ id: "p2" }),
        ])

        // mockRejectedValueOnce x2 garante que ambas as queries falham,
        // independentemente da ordem de execução em jsdom.
        vi.mocked(reportService.generateByProperty)
            .mockRejectedValueOnce(new Error("X"))
            .mockRejectedValueOnce(new Error("X"))

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(result.current.errorCount).toBe(2)
            expect(result.current.isLoadingReports).toBe(false)
        })

        // É erro total — UI decide o que fazer (não usa isPartial pra isso)
        expect(result.current.isPartial).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal — falha em listar propriedades
// ─────────────────────────────────────────────────────────────────────────────

describe("useDashboard — falha em listar propriedades", () => {
    it("retorna isErrorProperties=true e dashboardData=null", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(
            new Error("Sem permissão"),
        )

        const { result } = renderHook(
            () => useDashboard({ filters: { period: "MONTHLY" } }),
            { wrapper: createWrapper() },
        )

        await waitFor(() => {
            expect(result.current.isErrorProperties).toBe(true)
        })

        expect(result.current.dashboardData).toBeNull()
        // Nenhuma report query foi disparada
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Re-fetch ao mudar filtros
// ─────────────────────────────────────────────────────────────────────────────

describe("useDashboard — mudança de filtros", () => {
    it("dispara novas queries quando period muda", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1" }),
        ])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult(),
        )

        const initialFilters: ReportFilters = { period: "MONTHLY" }
        const dailyFilters: ReportFilters = { period: "DAILY" }

        const { result, rerender } = renderHook<
            ReturnType<typeof useDashboard>,
            { filters: ReportFilters }
        >(
            ({ filters }) => useDashboard({ filters }),
            {
                wrapper: createWrapper(),
                initialProps: { filters: initialFilters },
            },
        )

        await waitFor(() => {
            expect(result.current.dashboardData).not.toBeNull()
        })

        const initialCallCount = vi.mocked(reportService.generateByProperty)
            .mock.calls.length

        rerender({ filters: dailyFilters })

        await waitFor(() => {
            const newCalls = vi.mocked(reportService.generateByProperty).mock
                .calls.length
            expect(newCalls).toBeGreaterThan(initialCallCount)
        })

        // Última chamada foi com DAILY
        const lastCall = vi.mocked(reportService.generateByProperty).mock.calls
            .at(-1)
        expect(lastCall![1]).toEqual(
            expect.objectContaining({ period: "DAILY" }),
        )
    })
})