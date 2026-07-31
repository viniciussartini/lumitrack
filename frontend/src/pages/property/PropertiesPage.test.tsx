import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import {
    render,
    screen,
    waitFor,
    type RenderOptions,
} from "@testing-library/react"
import { PropertiesPage } from "@/pages/property/PropertiesPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

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

const mockProperty1: Property = {
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

const mockProperty2: Property = {
    ...mockProperty1,
    id: "prop-2",
    name: "Escritório Centro",
    city: "Contagem",
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

interface RenderPageOptions extends Omit<RenderOptions, "wrapper"> {
    queryClient?: QueryClient
}

const renderPage = (options: RenderPageOptions = {}) => {
    const queryClient = options.queryClient ?? createTestQueryClient()
    return render(<PropertiesPage />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>{children}</MemoryRouter>
            </QueryClientProvider>
        ),
        ...options,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertiesPage — header", () => {
    it("renderiza título e link de nova propriedade", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([]))
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            screen.getByRole("heading", { name: /propriedades/i, level: 1 }),
        ).toBeInTheDocument()

        const newButton = await screen.findByRole("link", {
            name: /nova propriedade/i,
        })
        expect(newButton).toHaveAttribute("href", "/propriedades/nova")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertiesPage — loading", () => {
    it("exibe skeleton enquanto ambas queries carregam", () => {
        // Promises nunca resolvidas — fica em loading
        vi.mocked(propertyService.list).mockReturnValue(new Promise(() => {}))
        vi.mocked(distributorService.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        expect(
            screen.getByLabelText(/carregando propriedades/i),
        ).toBeInTheDocument()
    })

    it("continua em loading se distributors ainda carrega mesmo com properties prontas", () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockProperty1]))
        vi.mocked(distributorService.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        expect(
            screen.getByLabelText(/carregando propriedades/i),
        ).toBeInTheDocument()
    })

    it("continua em loading se properties ainda carrega mesmo com distributors prontas", () => {
        vi.mocked(propertyService.list).mockReturnValue(new Promise(() => {}))
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))

        renderPage()

        expect(
            screen.getByLabelText(/carregando propriedades/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertiesPage — empty state", () => {
    it("exibe empty state quando não há propriedades", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([]))
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(/nenhuma propriedade cadastrada/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", {
                name: /cadastrar primeira propriedade/i,
            }),
        ).toHaveAttribute("href", "/propriedades/nova")
    })

    it("não renderiza grid quando lista está vazia", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([]))
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        await screen.findByText(/nenhuma propriedade cadastrada/i)
        expect(screen.queryByTestId("properties-grid")).not.toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sucesso
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertiesPage — sucesso", () => {
    it("renderiza um card por propriedade", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockProperty1, mockProperty2]),
        )
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))

        renderPage()

        await waitFor(() => {
            expect(screen.getByTestId("property-card-prop-1")).toBeInTheDocument()
            expect(screen.getByTestId("property-card-prop-2")).toBeInTheDocument()
        })
    })

    it("resolve o nome da distribuidora em cada card", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockProperty1, mockProperty2]),
        )
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))

        renderPage()

        await waitFor(() => {
            expect(screen.getAllByText(/cemig/i)).toHaveLength(2)
        })
    })

    it("mostra fallback quando a distribuidora vinculada não está na lista", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockProperty1]))
        // Lista vazia — caso hipotético onde a distribuidora foi removida
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(/distribuidora removida/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertiesPage — erro", () => {
    it("exibe estado de erro com retry quando properties falha", async () => {
        const user = userEvent.setup()

        vi.mocked(propertyService.list).mockRejectedValue(
            new Error("Falhou geral"),
        )
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText(/falhou geral/i)).toBeInTheDocument()

        // Retry chama list de novo
        vi.mocked(propertyService.list).mockResolvedValueOnce(paginated([]))
        await user.click(
            screen.getByRole("button", { name: /tentar novamente/i }),
        )

        await waitFor(() => {
            expect(propertyService.list).toHaveBeenCalledTimes(2)
        })
    })

    it("exibe estado de erro quando distributors falha", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockProperty1]))
        vi.mocked(distributorService.list).mockRejectedValue(
            new Error("API caiu"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText(/api caiu/i)).toBeInTheDocument()
    })

    it("prioriza mensagem de erro de properties sobre distributors", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(
            new Error("Erro em properties"),
        )
        vi.mocked(distributorService.list).mockRejectedValue(
            new Error("Erro em distributors"),
        )

        renderPage()

        expect(
            await screen.findByText(/erro em properties/i),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(/erro em distributors/i),
        ).not.toBeInTheDocument()
    })
})
