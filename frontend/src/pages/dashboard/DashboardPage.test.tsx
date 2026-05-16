import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { propertyService } from "@/services/property.service"
import { reportService } from "@/services/report.service"
import type { Property } from "@/types/property.types"
import type { ReportResult } from "@/types/report.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { list: vi.fn() },
}))

vi.mock("@/services/report.service", () => ({
    reportService: { generateByProperty: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    extractErrorMessage: (e: unknown) =>
        e instanceof Error ? e.message : "Erro",
}))

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: () => ({
        user: {
            id: "u1",
            firstName: "Maria",
            email: "maria@example.com",
            userType: "INDIVIDUAL",
        },
    }),
}))

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

beforeEach(() => {
    vi.clearAllMocks()
})

const makeProperty = (overrides: Partial<Property> = {}): Property => ({
    id: "p1",
    userId: "u1",
    distributorId: "d1",
    name: "Casa",
    address: "Rua A, 1",
    city: "São Paulo",
    state: "SP",
    zipCode: "01234-567",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
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

/**
 * Sonda que reflete o location.search atual — usada pra asserts de
 * URL sync. Usa useLocation (React Router) em vez de window.location
 * porque o MemoryRouter não sincroniza com a URL real do browser.
 */
const LocationProbe = () => {
    const location = useLocation()
    return <div data-testid="location-search">{location.search}</div>
}

const renderPage = (initialEntry = "/dashboard") => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialEntry]}>
                <Routes>
                    <Route path="/dashboard" element={<DashboardPage />} />
                </Routes>
                <LocationProbe />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — header", () => {
    it("renderiza saudação com firstName do user", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([])
        renderPage()

        expect(
            await screen.findByRole("heading", { name: /olá, maria/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — sem propriedades", () => {
    it("mostra CTA para cadastrar primeira propriedade", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([])
        renderPage()

        const cta = await screen.findByTestId("dashboard-cta-create-property")
        expect(cta).toBeInTheDocument()
        expect(cta).toHaveAttribute("href", "/propriedades/nova")

        // Não dispara report queries
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — erro fatal", () => {
    it("mostra banner quando propertyService.list falha", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(
            new Error("Sem permissão"),
        )
        renderPage()

        const alert = await screen.findByTestId("dashboard-error")
        expect(alert).toHaveTextContent(/sem permissão/i)

        // Não chega a tentar nenhum report
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// URL sync
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — URL sync", () => {
    it("usa MONTHLY como default quando URL não tem period", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([makeProperty()])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult(),
        )
        renderPage()

        await waitFor(() => {
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "p1",
                expect.objectContaining({ period: "MONTHLY" }),
            )
        })
    })

    it("inicia com filtros da URL quando presente", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([makeProperty()])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult({ period: "DAILY" }),
        )

        renderPage(
            "/dashboard?period=DAILY&dateFrom=2025-01-01&dateTo=2025-01-31",
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

    it("ignora period inválido e cai em MONTHLY", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([makeProperty()])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult(),
        )

        renderPage("/dashboard?period=HOURLY")

        await waitFor(() => {
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "p1",
                expect.objectContaining({ period: "MONTHLY" }),
            )
        })
    })

    it("ao trocar period via chip, atualiza URL e refaz a query", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([makeProperty()])
        vi.mocked(reportService.generateByProperty).mockResolvedValue(
            makeResult(),
        )

        const user = userEvent.setup()
        renderPage()

        // Espera primeiro render concluir
        await screen.findByTestId("dashboard-view")

        await user.click(screen.getByTestId("report-period-chip-annual"))

        await waitFor(() => {
            expect(screen.getByTestId("location-search").textContent).toBe(
                "?period=ANNUAL",
            )
        })

        await waitFor(() => {
            expect(
                reportService.generateByProperty,
            ).toHaveBeenLastCalledWith(
                "p1",
                expect.objectContaining({ period: "ANNUAL" }),
            )
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integração de sucesso
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — integração", () => {
    it("renderiza DashboardView com agregação correta", async () => {
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

        renderPage()

        await screen.findByTestId("dashboard-view")

        // Summary total
        expect(
            screen.getByTestId("dashboard-summary-totalKwh"),
        ).toHaveTextContent("300,00 kWh")

        // Ambas propriedades na tabela
        expect(
            screen.getByTestId("dashboard-property-row-p1"),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId("dashboard-property-row-p2"),
        ).toBeInTheDocument()
    })

    it("renderiza banner parcial quando 1 de 2 reports falha", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([
            makeProperty({ id: "p1", name: "Casa" }),
            makeProperty({ id: "p2", name: "Escritório" }),
        ])
        vi.mocked(reportService.generateByProperty)
            .mockResolvedValueOnce(makeResult())
            .mockRejectedValueOnce(new Error("Timeout"))

        renderPage()

        const banner = await screen.findByTestId("dashboard-partial-error")
        expect(banner).toHaveTextContent("1 de 2")

        // A propriedade que falhou ainda aparece na tabela como linha de erro
        const errorRow = screen.getByTestId("dashboard-property-row-p2")
        expect(errorRow).toHaveTextContent(/timeout/i)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("DashboardPage — loading", () => {
    it("renderiza skeleton enquanto propriedades carregam", () => {
        // Promise pendente
        vi.mocked(propertyService.list).mockImplementation(
            () => new Promise(() => {}),
        )

        renderPage()

        expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument()
    })
})