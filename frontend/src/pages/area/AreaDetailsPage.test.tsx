import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
import type { Paginated } from "@/types/pagination.types"
import { deviceService } from "@/services/device.service"
import type { Device } from "@/types/device.types"
import { consumptionService } from "@/services/consumption.service"
import { meterService } from "@/services/meter.service"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        list: vi.fn(),
    },
}))

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
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
})

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    electricalSystem: "MONOPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
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
            <MemoryRouter initialEntries={["/propriedades/prop-1/areas/area-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<AreaDetailsPage />}
                    />
                    <Route path="/propriedades/:id" element={<div>Detalhes da propriedade</div>} />
                    <Route path="/propriedades" element={<div>Lista de propriedades</div>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meterService.byTarget).mockResolvedValue(null)
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — loading", () => {
    it("renderiza skeleton enquanto a área carrega", () => {
        vi.mocked(areaService.getById).mockReturnValue(new Promise(() => {}))
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(screen.queryByText(/sala/i)).not.toBeInTheDocument()
        expect(screen.getByRole("link", { name: /voltar para propriedade/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — erro fatal (área)", () => {
    it("renderiza ErrorState quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(new Error("Área não encontrada"))
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(await screen.findByText(/área não encontrada/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — header", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome da área como heading principal", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /sala/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza a descrição quando presente", async () => {
        renderPage()

        expect(await screen.findByText(/área principal de convivência/i)).toBeInTheDocument()
    })

    it("não renderiza descrição quando é null", async () => {
        vi.mocked(areaService.getById).mockResolvedValue({
            ...mockArea,
            description: null,
        })

        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })
        expect(screen.queryByText(/área principal/i)).not.toBeInTheDocument()
    })

    it("renderiza chip com nome da propriedade pai", async () => {
        renderPage()

        expect(await screen.findByText(/casa principal/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — botão Editar área
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — botão Editar área", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("abre o modal de edição ao clicar em 'Editar área'", async () => {
        const user = userEvent.setup()
        renderPage()

        const editButton = await screen.findByRole("button", {
            name: /editar área/i,
        })
        await user.click(editButton)

        expect(await screen.findByRole("dialog", { name: /editar área/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — menu ⋯
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — menu ⋯", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o botão de opções (AreaMenu) com o nome da área", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        expect(screen.getByRole("button", { name: /opções de Sala/i })).toBeInTheDocument()
    })

    it("menu NÃO mostra item 'Editar' (já existe botão dedicado no header)", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))

        expect(screen.queryByRole("menuitem", { name: /editar/i })).not.toBeInTheDocument()

        // Mas mostra o item Excluir
        expect(screen.getByRole("menuitem", { name: /excluir/i })).toBeInTheDocument()
    })

    it("após excluir, navega de volta para a propriedade pai", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        expect(await screen.findByText(/detalhes da propriedade/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chip — fallbacks
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — chip da propriedade", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
    })

    it("mostra fallback quando a query da property falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(new Error("Propriedade removida"))

        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await waitFor(() =>
            expect(screen.getByText(/propriedade não disponível/i)).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Dispositivos — comportamento dinâmico
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — seção de dispositivos (vazia)", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(deviceService.list).mockResolvedValue(paginated([]))
    })

    it("renderiza seção 'Dispositivos' como heading", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /dispositivos/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza EmptyState quando não há dispositivos", async () => {
        renderPage()

        expect(await screen.findByText(/nenhum dispositivo cadastrado/i)).toBeInTheDocument()
    })

    it("abre o modal de criação ao clicar em 'Adicionar dispositivo'", async () => {
        const user = userEvent.setup()
        renderPage()

        const addButton = await screen.findByRole("button", {
            name: /adicionar dispositivo/i,
        })
        await user.click(addButton)

        expect(
            await screen.findByRole("dialog", { name: /adicionar dispositivo/i }),
        ).toBeInTheDocument()
    })

    it("renderiza a marca 'Em breve' explicitamente", async () => {
        renderPage()

        expect(await screen.findByTestId("devices-coming-soon")).toBeInTheDocument()
    })
})

describe("AreaDetailsPage — seção de dispositivos (com dados)", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza grid de cards quando há dispositivos", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(
            paginated([mockDevice, { ...mockDevice, id: "device-2", name: "TV" }]),
        )

        renderPage()

        expect(await screen.findByTestId("devices-grid")).toBeInTheDocument()
        expect(screen.getByTestId("device-card-device-1")).toBeInTheDocument()
        expect(screen.getByTestId("device-card-device-2")).toBeInTheDocument()
        expect(screen.getByText(/ar-condicionado/i)).toBeInTheDocument()
        expect(screen.getByText(/^tv$/i)).toBeInTheDocument()
        expect(screen.queryByText(/nenhum dispositivo cadastrado/i)).not.toBeInTheDocument()
    })

    it("card do dispositivo aponta para a página de detalhes do device", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(paginated([mockDevice]))

        renderPage()

        const card = await screen.findByTestId("device-card-device-1")

        expect(card).toHaveAttribute("href", "/propriedades/prop-1/areas/area-1/devices/device-1")
    })
})

describe("AreaDetailsPage — seção de dispositivos (erro)", () => {
    it("renderiza alerta inline quando o fetch dos dispositivos falha", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(deviceService.list).mockRejectedValue(new Error("Falha ao listar dispositivos"))

        renderPage()

        // Header da área aparece (erro nos dispositivos não é fatal)
        await screen.findByRole("heading", { level: 1, name: /sala/i })

        // Alerta inline com a mensagem específica
        expect(await screen.findByText(/falha ao listar dispositivos/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Medidor / Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — seção de medidor/consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(deviceService.list).mockResolvedValue(paginated([]))
    })

    it("renderiza a seção 'Medidor'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^medidor$/i,
            }),
        ).toBeInTheDocument()
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

    it("consulta o medidor do alvo AREA", async () => {
        renderPage()

        await waitFor(() => {
            expect(meterService.byTarget).toHaveBeenCalledWith("AREA", "area-1")
        })
    })

    it("sem medidor vinculado, não chama /api/consumption", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /^consumo$/i })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navegação — voltar
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — navegação", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("link de voltar aponta para a propriedade pai", async () => {
        renderPage()

        const backLink = await screen.findByRole("link", {
            name: /voltar para propriedade/i,
        })

        expect(backLink).toHaveAttribute("href", "/propriedades/prop-1")
    })
})
