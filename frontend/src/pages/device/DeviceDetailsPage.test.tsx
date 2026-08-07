import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { deviceService } from "@/services/device.service"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import { consumptionService } from "@/services/consumption.service"
import { meterService } from "@/services/meter.service"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        list: vi.fn(),
    },
}))

// MeterSection/ConsumptionSection consultam o medidor do alvo.
vi.mock("@/services/meter.service", () => ({
    meterService: {
        list: vi.fn(),
        byTarget: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
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

vi.mock("@/services/area.service", () => ({
    areaService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
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
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

const mockDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "MONOPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
            <MemoryRouter initialEntries={["/propriedades/prop-1/areas/area-1/devices/device-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={<DeviceDetailsPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<p>Área pai</p>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    // Sem medidor vinculado por padrão — MeterSection/ConsumptionSection
    // caem no EmptyState "Nenhum medidor vinculado" sem ficar em loading.
    vi.mocked(meterService.byTarget).mockResolvedValue(null)
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading e erro
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — loading", () => {
    it("renderiza skeleton enquanto o device carrega", () => {
        vi.mocked(deviceService.getById).mockImplementation(() => new Promise(() => {}))

        renderPage()

        // link de breadcrumb aparece mesmo em loading
        expect(screen.getByRole("link", { name: /voltar para área/i })).toBeInTheDocument()
    })
})

describe("DeviceDetailsPage — erro no device", () => {
    it("renderiza ErrorState quando a query do device falha", async () => {
        vi.mocked(deviceService.getById).mockRejectedValue(new Error("Dispositivo não encontrado"))

        renderPage()

        expect(await screen.findByText(/dispositivo não encontrado/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header / dados do device
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — header do device", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome do device como heading h1", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza chips de marca, modelo e potência", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })
        expect(screen.getByText(/daikin/i)).toBeInTheDocument()
        expect(screen.getByText(/split 12000 btu/i)).toBeInTheDocument()
        expect(screen.getByText(/1\s*200\s*W/i)).toBeInTheDocument()
    })

    it("renderiza chip da área pai com nome correto", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })
        expect(screen.getByText(/sala/i)).toBeInTheDocument()
    })

    it("renderiza chip da propriedade avó com nome correto", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })
        expect(screen.getByText(/casa principal/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fallbacks de chips quando queries de área/property falham
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — fallbacks de chips", () => {
    it("mostra fallback no chip da área quando a query falha", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockRejectedValue(new Error("Área removida"))

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await waitFor(() => expect(screen.getByText(/área não disponível/i)).toBeInTheDocument())
    })

    it("mostra fallback no chip da propriedade quando a query falha", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockRejectedValue(new Error("Propriedade removida"))

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await waitFor(() =>
            expect(screen.getByText(/propriedade não disponível/i)).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seções
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — seções", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza seção 'Medidor'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", { level: 2, name: /^medidor$/i }),
        ).toBeInTheDocument()

        expect(await screen.findByText(/nenhum medidor vinculado/i)).toBeInTheDocument()
    })

    it("renderiza seção 'Consumo'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^consumo$/i,
            }),
        ).toBeInTheDocument()
    })

    it("consulta o medidor do device (targetType=DEVICE)", async () => {
        renderPage()

        await waitFor(() => {
            expect(meterService.byTarget).toHaveBeenCalledWith("DEVICE", "device-1")
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — seção de consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza as abas de granularidade (Hora/Dia)", async () => {
        renderPage()

        expect(await screen.findByTestId("granularity-tabs")).toBeInTheDocument()
        expect(screen.getByTestId("granularity-tab-hour")).toBeInTheDocument()
        expect(screen.getByTestId("granularity-tab-day")).toBeInTheDocument()
    })

    it("sem medidor vinculado, não chama /api/consumption", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /^consumo$/i })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navegação
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — navegação", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("link de voltar aponta para a área pai", async () => {
        renderPage()

        const backLink = await screen.findByRole("link", {
            name: /voltar para área/i,
        })

        expect(backLink).toHaveAttribute("href", "/propriedades/prop-1/areas/area-1")
    })
})
