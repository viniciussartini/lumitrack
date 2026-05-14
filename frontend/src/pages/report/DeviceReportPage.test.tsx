import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { DeviceReportPage } from "@/pages/report/DeviceReportPage"
import { reportService } from "@/services/report.service"
import { deviceService } from "@/services/device.service"
import type { ReportResult } from "@/types/report.types"
import type { Device } from "@/types/device.types"

vi.mock("@/services/report.service", () => ({
    reportService: {
        generateByProperty: vi.fn(),
        generateByArea: vi.fn(),
        generateByDevice: vi.fn(),
    },
}))

vi.mock("@/services/device.service", () => ({
    deviceService: {
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

const mockDevice: Device = {
    id: "dev-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const emptyResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: {
        type: "DEVICE",
        propertyId: "prop-1",
        areaId: "area-1",
        deviceId: "dev-1",
    },
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
                    "/propriedades/prop-1/areas/area-1/devices/dev-1/relatorio",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId/relatorio"
                        element={<DeviceReportPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={<div>Detalhes do dispositivo</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
    vi.mocked(reportService.generateByDevice).mockResolvedValue(emptyResult)
})

describe("DeviceReportPage", () => {
    it("renderiza nome do device no header", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /relatório de consumo/i,
            }),
        ).toBeInTheDocument()
        expect(await screen.findByText("Ar-condicionado")).toBeInTheDocument()
    })

    it("chama generateByDevice com a tripla completa de IDs", async () => {
        renderPage()

        await waitFor(() =>
            expect(reportService.generateByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                { period: "MONTHLY", dateFrom: undefined, dateTo: undefined },
            ),
        )
    })

    it("NÃO chama generateByProperty nem generateByArea", async () => {
        renderPage()

        await screen.findByTestId("report-summary-cards")

        expect(reportService.generateByProperty).not.toHaveBeenCalled()
        expect(reportService.generateByArea).not.toHaveBeenCalled()
    })

    it("link de voltar aponta para o device pai", () => {
        renderPage()

        expect(
            screen.getByRole("link", { name: /voltar para dispositivo/i }),
        ).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/devices/dev-1",
        )
    })

    it("usa entityLabel 'deste dispositivo' no EmptyState", async () => {
        renderPage()

        expect(
            await screen.findByText(/deste dispositivo/i),
        ).toBeInTheDocument()
    })
})