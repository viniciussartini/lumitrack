import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { AreaReportPage } from "@/pages/report/AreaReportPage"
import { reportService } from "@/services/report.service"
import { areaService } from "@/services/area.service"
import type { ReportResult } from "@/types/report.types"
import type { Area } from "@/types/area.types"

vi.mock("@/services/report.service", () => ({
    reportService: {
        generateByProperty: vi.fn(),
        generateByArea: vi.fn(),
        generateByDevice: vi.fn(),
    },
}))

vi.mock("@/services/area.service", () => ({
    areaService: {
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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const emptyResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "AREA", propertyId: "prop-1", areaId: "area-1" },
    dateRange: null,
    summary: {
        totalKwh: 0,
        totalCostBrl: 0,
        recordCount: 0,
        avgKwhPerRecord: 0,
        trend: "INSUFFICIENT_DATA",
    },
    records: [],
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter
                initialEntries={[
                    "/propriedades/prop-1/areas/area-1/relatorio",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/relatorio"
                        element={<AreaReportPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<div>Detalhes da área</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(areaService.getById).mockResolvedValue(mockArea)
    vi.mocked(reportService.generateByArea).mockResolvedValue(emptyResult)
})

describe("AreaReportPage", () => {
    it("renderiza nome da área no header", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /relatório de consumo/i,
            }),
        ).toBeInTheDocument()
        expect(await screen.findByText("Sala")).toBeInTheDocument()
    })

    it("chama generateByArea com propertyId e areaId corretos", async () => {
        renderPage()

        await waitFor(() =>
            expect(reportService.generateByArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                { period: "MONTHLY", dateFrom: undefined, dateTo: undefined },
            ),
        )
    })

    it("NÃO chama generateByProperty nem generateByDevice (target correto)", async () => {
        renderPage()

        await screen.findByTestId("report-summary-cards")

        expect(reportService.generateByProperty).not.toHaveBeenCalled()
        expect(reportService.generateByDevice).not.toHaveBeenCalled()
    })

    it("link de voltar aponta para a área pai", () => {
        renderPage()

        expect(
            screen.getByRole("link", { name: /voltar para área/i }),
        ).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })

    it("usa entityLabel 'desta área' no EmptyState quando records=[]", async () => {
        renderPage()

        expect(
            await screen.findByText(/desta área/i),
        ).toBeInTheDocument()
    })
})