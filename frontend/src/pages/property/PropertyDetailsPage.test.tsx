import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyDetailsPage } from "@/pages/property/PropertyDetailsPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import { areaService } from "@/services/area.service"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import type { Area } from "@/types/area.types"
import { consumptionService } from "@/services/consumption.service"

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

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
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

const mockDistributor: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
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
            <MemoryRouter initialEntries={["/propriedades/prop-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:id"
                        element={<PropertyDetailsPage />}
                    />
                    <Route
                        path="/propriedades"
                        element={<div>Lista de propriedades</div>}
                    />
                    <Route
                        path="/propriedades/:id/editar"
                        element={<div>Edição</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(consumptionService.listByProperty).mockResolvedValue([])
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — loading", () => {
    it("exibe skeleton enquanto a propriedade carrega", () => {
        // Promise nunca resolvida — fica em loading
        vi.mocked(propertyService.getById).mockReturnValue(
            new Promise(() => {}),
        )
        vi.mocked(distributorService.getById).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        expect(
            screen.getByLabelText(/carregando dados da propriedade/i),
        ).toBeInTheDocument()
    })

    it("renderiza link de voltar mesmo durante loading", () => {
        vi.mocked(propertyService.getById).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        expect(
            screen.getByRole("link", { name: /voltar para propriedades/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — erro", () => {
    it("exibe ErrorState quando getById falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Propriedade não encontrada"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(
            screen.getByText(/propriedade não encontrada/i),
        ).toBeInTheDocument()
    })

    it("oferece link de volta no estado de erro", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Forbidden"),
        )

        renderPage()

        await screen.findByRole("alert")

        // Há dois links pra propriedades (o BackLink no topo + o "Voltar para a lista" no estado de erro)
        const backLinks = screen.getAllByRole("link", {
            name: /voltar/i,
        })
        expect(backLinks.length).toBeGreaterThanOrEqual(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — dados da propriedade
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — header", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(
            mockDistributor,
        )
        vi.mocked(areaService.list).mockResolvedValue([])
    })

    it("renderiza nome da propriedade como heading principal", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /casa principal/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza endereço completo formatado", async () => {
        renderPage()

        expect(
            await screen.findByText(
                "Rua das Flores, 100, Belo Horizonte/MG",
            ),
        ).toBeInTheDocument()
    })

    it("renderiza botão Editar com link correto", async () => {
        renderPage()

        const editButton = await screen.findByRole("link", {
            name: /editar propriedade/i,
        })

        expect(editButton).toHaveAttribute("href", "/propriedades/prop-1/editar")
    })

    it("renderiza menu de opções (sem item Editar — só Excluir)", async () => {
        const user = userEvent.setup()
        renderPage()

        const menuTrigger = await screen.findByRole("button", {
            name: /opções de Casa Principal/i,
        })

        await user.click(menuTrigger)

        // Editar foi REMOVIDO do menu (já tem botão explícito no header)
        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).not.toBeInTheDocument()

        // Excluir continua presente
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chips com dados da distribuidora
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — chips de distribuidora", () => {
    it("renderiza nome da distribuidora vinculada", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(
            mockDistributor,
        )

        renderPage()

        expect(
            await screen.findByText(/CEMIG Distribuição S\.A\./i),
        ).toBeInTheDocument()
    })

    it("renderiza sistema elétrico traduzido para português", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(
            mockDistributor,
        )

        renderPage()

        // TRIPHASIC → Trifásico
        expect(await screen.findByText(/trifásico/i)).toBeInTheDocument()
    })

    it("renderiza voltagem com unidade V", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(
            mockDistributor,
        )

        renderPage()

        expect(await screen.findByText(/220V/i)).toBeInTheDocument()
    })

    it("renderiza preço do kWh formatado em BRL", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(
            mockDistributor,
        )

        renderPage()

        // 0.75 → R$ 0,75/kWh (com NBSP entre R$ e número, depende do locale)
        expect(
            await screen.findByText(/R\$\s?0,75\/kWh/i),
        ).toBeInTheDocument()
    })

    it("mostra fallback quando distribuidora não está disponível", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockRejectedValue(
            new Error("Distribuidora removida"),
        )

        renderPage()

        // O nome da propriedade aparece (página renderiza)
        await screen.findByRole("heading", { name: /casa principal/i })

        // Mas onde estariam os chips, vemos o fallback
        await waitFor(() => {
            expect(
                screen.getByText(/distribuidora não disponível/i),
            ).toBeInTheDocument()
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Áreas — comportamento dinâmico
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — seção de áreas (vazia)", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(areaService.list).mockResolvedValue([])
    })

    it("renderiza seção 'Áreas' como heading", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", { level: 2, name: /áreas/i }),
        ).toBeInTheDocument()
    })

    it("renderiza EmptyState quando não há áreas", async () => {
        renderPage()

        expect(
            await screen.findByText(/nenhuma área cadastrada/i),
        ).toBeInTheDocument()
    })

    it("link 'Adicionar área' aponta para a página de criação", async () => {
            renderPage()

            const addLink = await screen.findByRole("link", {
                name: /adicionar área/i,
            })

            expect(addLink).toHaveAttribute(
                "href",
                "/propriedades/prop-1/areas/nova",
            )
        })

    it("renderiza a marca 'Em breve' explicitamente", async () => {
        renderPage()

        expect(
            await screen.findByTestId("areas-coming-soon"),
        ).toBeInTheDocument()
    })
})

describe("PropertyDetailsPage — seção de áreas (com dados)", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
    })

    it("renderiza grid de cards quando há áreas", async () => {
        vi.mocked(areaService.list).mockResolvedValue([
            mockArea,
            { ...mockArea, id: "area-2", name: "Cozinha" },
        ])

        renderPage()

        // Testid do grid
        expect(await screen.findByTestId("areas-grid")).toBeInTheDocument()
        // Cards individuais por testid
        expect(screen.getByTestId("area-card-area-1")).toBeInTheDocument()
        expect(screen.getByTestId("area-card-area-2")).toBeInTheDocument()
        // Names visíveis
        expect(screen.getByText(/sala/i)).toBeInTheDocument()
        expect(screen.getByText(/cozinha/i)).toBeInTheDocument()
        // EmptyState não aparece
        expect(
            screen.queryByText(/nenhuma área cadastrada/i),
        ).not.toBeInTheDocument()
    })

    it("card aponta para a página de detalhes da área", async () => {
        vi.mocked(areaService.list).mockResolvedValue([mockArea])

        renderPage()

        const card = await screen.findByTestId("area-card-area-1")

        expect(card).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })
})

describe("PropertyDetailsPage — seção de áreas (erro)", () => {
    it("renderiza alerta inline quando o fetch das áreas falha", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(areaService.list).mockRejectedValue(
            new Error("Falha ao listar áreas"),
        )

        renderPage()

        // Header da propriedade ainda aparece (erro nas áreas não é fatal)
        await screen.findByRole("heading", {
            level: 1,
            name: /casa principal/i,
        })

        // Alerta inline com a mensagem de erro.
        // Pode haver mais de um role="alert" na página, então buscamos
        // diretamente pelo texto da mensagem específica:
        expect(
            await screen.findByText(/falha ao listar áreas/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — seção de consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(areaService.list).mockResolvedValue([])
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

    it("invoca listByProperty com o id da URL", async () => {
        renderPage()

        await waitFor(() => {
            expect(consumptionService.listByProperty).toHaveBeenCalledWith(
                "prop-1",
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

    it("EmptyState menciona 'propriedade' (entityLabel correto)", async () => {
        renderPage()

        // Mensagem default (sem filtro): "...consumo desta propriedade..."
        expect(
            await screen.findByText(/desta propriedade/i),
        ).toBeInTheDocument()
    })
})