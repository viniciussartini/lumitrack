import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PropertyReportPage } from "@/pages/report/PropertyReportPage"
import { reportService } from "@/services/report.service"
import { propertyService } from "@/services/property.service"
import type { ReportResult } from "@/types/report.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/report.service", () => ({
    reportService: {
        generateByProperty: vi.fn(),
        generateByArea: vi.fn(),
        generateByDevice: vi.fn(),
    },
}))

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

// Mock do download para evitar Blob real nos testes de integração
vi.mock("@/lib/download/downloadFile", () => ({
    downloadFile: vi.fn(),
}))

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

/**
 * totalKwh (100) e avgKwhPerRecord (100) formatam para "100,00 kWh".
 * Para evitar "Found multiple elements" em findByText("100,00 kWh"),
 * diferenciamos os dois valores:
 *   - totalKwh: 120    → "120,00 kWh"
 *   - avgKwhPerRecord: 60    → "60,00 kWh"
 *
 * Desta forma cada valor é único na página e podemos usar findByText
 * sem within() quando necessário. Testes que precisam confirmar o card
 * correto continuam usando within(getByTestId("report-summary-totalKwh")).
 */
const mockResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
    dateRange: null,
    summary: {
        totalKwh: 120,
        totalCostBrl: 75,
        recordCount: 2,
        avgKwhPerRecord: 60,
        trend: "STABLE",
    },
    records: [
        {
            id: "rec-1",
            propertyId: "prop-1",
            areaId: null,
            deviceId: null,
            period: "MONTHLY",
            referenceDate: "2025-01-15T12:00:00.000Z",
            kwhConsumed: 120,
            costBrl: 75,
            notes: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ],
}

const LocationSpy = () => {
    const location = useLocation()
    return (
        <span data-testid="location-search">
            {location.search}
        </span>
    )
}

const renderPage = (initialEntry = "/propriedades/prop-1/relatorio") => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[initialEntry]}>
                <LocationSpy />
                <Routes>
                    <Route
                        path="/propriedades/:id/relatorio"
                        element={<PropertyReportPage />}
                    />
                    <Route
                        path="/propriedades/:id"
                        element={<div>Detalhes da propriedade</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    vi.mocked(reportService.generateByProperty).mockResolvedValue(mockResult)
})

describe("PropertyReportPage — render inicial", () => {
    it("renderiza heading 'Relatório de consumo' e nome da propriedade", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /relatório de consumo/i,
            }),
        ).toBeInTheDocument()
        expect(
            await screen.findByText(/casa principal/i),
        ).toBeInTheDocument()
    })

    it("renderiza link de voltar para a página de detalhes", () => {
        renderPage()

        const back = screen.getByRole("link", {
            name: /voltar para propriedade/i,
        })
        expect(back).toHaveAttribute("href", "/propriedades/prop-1")
    })

    it("chama generateByProperty com period MONTHLY (default)", async () => {
        renderPage()

        await waitFor(() =>
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "prop-1",
                { period: "MONTHLY", dateFrom: undefined, dateTo: undefined },
            ),
        )
    })

    it("renderiza summary cards após query carregar", async () => {
        renderPage()

        // Aguarda os cards aparecerem
        await screen.findByTestId("report-summary-cards")

        // Usa within() para escopar ao card de kWh — evita ambiguidade com
        // o card de média (que poderia ter o mesmo valor formatado).
        const totalKwhCard = screen.getByTestId("report-summary-totalKwh")
        expect(
            within(totalKwhCard).getByText("120,00 kWh"),
        ).toBeInTheDocument()
    })
})

describe("PropertyReportPage — URL sync", () => {
    it("inicia com filtros da URL quando presente", async () => {
        renderPage(
            "/propriedades/prop-1/relatorio?period=DAILY&dateFrom=2025-01-01",
        )

        await waitFor(() =>
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "prop-1",
                {
                    period: "DAILY",
                    dateFrom: "2025-01-01",
                    dateTo: undefined,
                },
            ),
        )
    })

    it("ignora period inválido da URL e cai no default MONTHLY", async () => {
        renderPage("/propriedades/prop-1/relatorio?period=HOURLY")

        await waitFor(() =>
            expect(reportService.generateByProperty).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({ period: "MONTHLY" }),
            ),
        )
    })

    it("ao trocar period, atualiza URL e refaz a query", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByTestId("report-summary-cards")

        await user.click(screen.getByTestId("report-period-chip-annual"))

        await waitFor(() =>
            expect(
                screen.getByTestId("location-search").textContent,
            ).toBe("?period=ANNUAL"),
        )

        await waitFor(() =>
            expect(reportService.generateByProperty).toHaveBeenLastCalledWith(
                "prop-1",
                expect.objectContaining({ period: "ANNUAL" }),
            ),
        )
    })
})

describe("PropertyReportPage — erro de query", () => {
    it("renderiza banner de erro mantendo filtros editáveis", async () => {
        vi.mocked(reportService.generateByProperty).mockRejectedValue(
            new Error("Falha de rede"),
        )

        renderPage()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent(/falha de rede/i)
        expect(screen.getByTestId("report-filters")).toBeInTheDocument()
    })
})