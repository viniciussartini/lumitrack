import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor, within } from "@testing-library/react"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { deviceService } from "@/services/device.service"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import { consumptionService } from "@/services/consumption.service"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
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
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: null,
    city: null,
    state: null,
    zipCode: null,
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
                    "/propriedades/prop-1/areas/area-1/devices/device-1",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={<DeviceDetailsPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<div>Detalhes da área</div>}
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
    vi.mocked(consumptionService.listByDevice).mockResolvedValue([])
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — loading", () => {
    it("renderiza skeleton enquanto o dispositivo carrega", () => {
        vi.mocked(deviceService.getById).mockReturnValue(
            new Promise(() => {}),
        )
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(
            screen.queryByText(/ar-condicionado/i),
        ).not.toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para área/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — erro fatal", () => {
    it("renderiza ErrorState quando o fetch do device falha", async () => {
        vi.mocked(deviceService.getById).mockRejectedValue(
            new Error("Dispositivo não encontrado"),
        )
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(
            await screen.findByText(/dispositivo não encontrado/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — header", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome do dispositivo como heading principal", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza chip da propriedade avó com o nome", async () => {
        renderPage()

        const chip = await screen.findByTestId("device-property-chip")
        expect(within(chip).getByText(/casa principal/i)).toBeInTheDocument()
    })

    it("renderiza chip da área pai com o nome", async () => {
        renderPage()

        const chip = await screen.findByTestId("device-area-chip")
        expect(within(chip).getByText(/^sala$/i)).toBeInTheDocument()
    })

    it("renderiza chip de marca + modelo concatenados", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })

        expect(
            screen.getByText(/daikin · split 12000 btu/i),
        ).toBeInTheDocument()
    })

    it("renderiza chip de potência quando informada", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })

        expect(screen.getByText(/1200W/i)).toBeInTheDocument()
    })

    it("não renderiza chip de marca/modelo quando ambos são null", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue({
            ...mockDevice,
            brand: null,
            model: null,
        })

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        expect(
            screen.getByTestId("device-property-chip"),
        ).toBeInTheDocument()
        expect(screen.getByTestId("device-area-chip")).toBeInTheDocument()
        expect(screen.queryByText(/daikin/i)).not.toBeInTheDocument()
    })

    it("não renderiza chip de potência quando powerWatts é null", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue({
            ...mockDevice,
            powerWatts: null,
        })

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        expect(screen.queryByText(/W$/)).not.toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — botão Editar dispositivo
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — botão Editar dispositivo", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza link 'Editar dispositivo' apontando para a página de edição", async () => {
        renderPage()

        const editLink = await screen.findByRole("link", {
            name: /editar dispositivo/i,
        })

        expect(editLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/devices/device-1/editar",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — menu ⋯
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — menu ⋯", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o botão de opções (DeviceMenu) com o nome do dispositivo", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1 })

        expect(
            screen.getByRole("button", {
                name: /opções de Ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })

    it("menu NÃO mostra item 'Editar' (já existe botão dedicado no header)", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await user.click(
            screen.getByRole("button", {
                name: /opções de Ar-condicionado/i,
            }),
        )

        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).not.toBeInTheDocument()

        // Mas mostra o item Excluir
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })

    it("após excluir, navega de volta para a área pai", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await user.click(
            screen.getByRole("button", {
                name: /opções de Ar-condicionado/i,
            }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        expect(
            await screen.findByText(/detalhes da área/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chips — fallbacks
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — fallbacks dos chips", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
    })

    it("mostra fallback no chip da área quando a query da área falha", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Área removida"),
        )

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await waitFor(() =>
            expect(
                screen.getByText(/área não disponível/i),
            ).toBeInTheDocument(),
        )
    })

    it("mostra fallback no chip da propriedade quando a query falha", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Propriedade removida"),
        )

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        await waitFor(() =>
            expect(
                screen.getByText(/propriedade não disponível/i),
            ).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seções placeholder
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — seções placeholder", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza seção 'Alertas' com EmptyState e botão desabilitado", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^alertas$/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/nenhum alerta configurado/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /criar alerta/i }),
        ).toBeDisabled()
        expect(
            screen.getByTestId("alerts-coming-soon"),
        ).toBeInTheDocument()
    })

    it("renderiza seção 'Integração IoT' com EmptyState e botão desabilitado", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /integração iot/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/nenhuma configuração iot/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /configurar iot/i }),
        ).toBeDisabled()
        expect(screen.getByTestId("iot-coming-soon")).toBeInTheDocument()
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

    it("renderiza a seção 'Consumo'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^consumo$/i,
            }),
        ).toBeInTheDocument()
    })

    it("invoca listByDevice com a tripla de IDs da URL", async () => {
        renderPage()

        await waitFor(() => {
            expect(consumptionService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "device-1",
                undefined,
            )
        })
    })

    it("renderiza o filtro de período", async () => {
        renderPage()

        expect(
            await screen.findByTestId("consumption-period-filter"),
        ).toBeInTheDocument()
    })

    it("não exibe mais o testid antigo 'consumption-coming-soon'", async () => {
        renderPage()

        // Aguarda render terminar pra evitar passar via estado de loading
        await screen.findByRole("heading", { level: 2, name: /^consumo$/i })

        expect(screen.queryByTestId("consumption-coming-soon")).toBeNull()
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

        expect(backLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })
})