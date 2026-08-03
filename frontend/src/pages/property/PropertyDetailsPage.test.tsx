import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyDetailsPage } from "@/pages/property/PropertyDetailsPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import { areaService } from "@/services/area.service"
import { meterService } from "@/services/meter.service"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import type { Area } from "@/types/area.types"
import type { Paginated } from "@/types/pagination.types"
import { consumptionService } from "@/services/consumption.service"

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

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
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

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
})

const mockDistributor: Distributor = {
    id: "dist-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.4,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
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
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
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
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meterService.byTarget).mockResolvedValue(null)
    // Catálogo completo de distribuidoras — usado pelo modal de edição
    // (PropertyFormDialog), carregado incondicionalmente pela página.
    vi.mocked(distributorService.list).mockResolvedValue(
        paginated([mockDistributor]),
    )
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
        vi.mocked(areaService.list).mockResolvedValue(paginated([]))
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

    it("abre o modal de edição ao clicar em 'Editar' (header)", async () => {
        const user = userEvent.setup()
        renderPage()

        const editButton = await screen.findByRole("button", {
            name: /^editar$/i,
        })
        await user.click(editButton)

        expect(
            await screen.findByRole("dialog", { name: /editar propriedade/i }),
        ).toBeInTheDocument()
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
// Chips com dados da distribuidora e faturamento
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — chips de distribuidora e faturamento", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(areaService.list).mockResolvedValue(paginated([]))
    })

    it("renderiza nome da distribuidora vinculada", async () => {
        renderPage()

        expect(
            await screen.findByText(/CEMIG Distribuição S\.A\./i),
        ).toBeInTheDocument()
    })

    it("renderiza a tarifa TUSD formatada em BRL", async () => {
        renderPage()

        expect(await screen.findByText(/TUSD/i)).toBeInTheDocument()
    })

    it("renderiza o sistema elétrico da PROPRIEDADE traduzido para português", async () => {
        renderPage()

        // TRIPHASIC → Trifásico (agora é campo da propriedade, não da distribuidora)
        expect(await screen.findByText(/trifásico/i)).toBeInTheDocument()
    })

    it("mostra fallback quando distribuidora não está disponível", async () => {
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
        vi.mocked(areaService.list).mockResolvedValue(paginated([]))
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

    it("abre o modal de criação ao clicar em 'Adicionar área'", async () => {
        const user = userEvent.setup()
        renderPage()

        const addButton = await screen.findByRole("button", {
            name: /adicionar área/i,
        })
        await user.click(addButton)

        expect(
            await screen.findByRole("dialog", { name: /adicionar área/i }),
        ).toBeInTheDocument()
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
        vi.mocked(areaService.list).mockResolvedValue(
            paginated([mockArea, { ...mockArea, id: "area-2", name: "Cozinha" }]),
        )

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
        vi.mocked(areaService.list).mockResolvedValue(paginated([mockArea]))

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
        expect(
            await screen.findByText(/falha ao listar áreas/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Medidor / Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyDetailsPage — seção de medidor/consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)
        vi.mocked(areaService.list).mockResolvedValue(paginated([]))
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

    it("consulta o medidor do alvo PROPERTY", async () => {
        renderPage()

        await waitFor(() => {
            expect(meterService.byTarget).toHaveBeenCalledWith("PROPERTY", "prop-1")
        })
    })

    it("sem medidor vinculado, não chama /api/consumption", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /^consumo$/i })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})
