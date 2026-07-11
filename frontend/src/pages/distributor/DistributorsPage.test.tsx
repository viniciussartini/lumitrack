import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { render, screen, waitFor, type RenderOptions } from "@testing-library/react"
import { DistribuidorsPage } from "@/pages/distributor/DistributorsPage"
import { distributorService } from "@/services/distributor.service"
import { ThemeProvider } from "@/contexts/ThemeContext"
import type { Distributor } from "@/types/distributor.types"
import type { Paginated } from "@/types/pagination.types"

// Mock do service inteiro — testes ficam unitários, sem rede
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

const mockDistributor1: Distributor = {
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

const mockDistributor2: Distributor = {
    ...mockDistributor1,
    id: "dist-2",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
    state: "SP",
}

/**
 * Cria um QueryClient novo por teste — sem retries e sem cache compartilhado.
 * Sem isso, um teste que falhou poderia "vazar" estado pra outro.
 */
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
    return render(<DistribuidorsPage />, {
        wrapper: ({ children }) => (
            <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                    <MemoryRouter>{children}</MemoryRouter>
                </QueryClientProvider>
            </ThemeProvider>
        ),
        ...options,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Estados visuais
// ─────────────────────────────────────────────────────────────────────────────

describe("DistribuidorsPage — header", () => {
    it("renderiza título (catálogo somente leitura, sem botão de criação)", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            screen.getByRole("heading", { name: /distribuidoras/i, level: 1 }),
        ).toBeInTheDocument()

        expect(
            screen.queryByRole("link", { name: /nova distribuidora/i }),
        ).not.toBeInTheDocument()
    })
})

describe("DistribuidorsPage — loading", () => {
    it("exibe skeleton enquanto carrega", () => {
        // Promise nunca resolvida — fica em loading
        vi.mocked(distributorService.list).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        expect(
            screen.getByLabelText(/carregando distribuidoras/i),
        ).toBeInTheDocument()
    })
})

describe("DistribuidorsPage — vazio", () => {
    it("exibe EmptyState quando não há distribuidoras", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(/catálogo indisponível/i),
        ).toBeInTheDocument()
    })
})

describe("DistribuidorsPage — sucesso", () => {
    it("renderiza um card para cada distribuidora", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(
            paginated([mockDistributor1, mockDistributor2]),
        )

        renderPage()

        expect(
            await screen.findByText("CEMIG Distribuição S.A."),
        ).toBeInTheDocument()
        expect(screen.getByText("ENEL São Paulo")).toBeInTheDocument()

        const cards = screen
            .getByTestId("distributors-grid")
            .querySelectorAll("[data-testid^='distributor-card-']")
        expect(cards).toHaveLength(2)
    })

    it("renderiza a tarifa TUSD/TE de cada distribuidora", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(
            paginated([mockDistributor1]),
        )

        renderPage()

        expect(await screen.findByText(/TUSD/i)).toBeInTheDocument()
        expect(screen.getByText(/TE/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro
// ─────────────────────────────────────────────────────────────────────────────

describe("DistribuidorsPage — erro", () => {
    it("exibe mensagem de erro quando a query falha", async () => {
        vi.mocked(distributorService.list).mockRejectedValue(
            new Error("Erro de rede"),
        )

        renderPage()

        expect(
            await screen.findByText(/não foi possível carregar/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/erro de rede/i)).toBeInTheDocument()
    })

    it("permite tentar novamente após falha", async () => {
        const user = userEvent.setup()
        vi.mocked(distributorService.list)
            .mockRejectedValueOnce(new Error("Erro de rede"))
            .mockResolvedValueOnce(paginated([mockDistributor1]))

        renderPage()

        await screen.findByText(/não foi possível carregar/i)

        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        await waitFor(() => {
            expect(screen.getByText("CEMIG Distribuição S.A.")).toBeInTheDocument()
        })
    })
})
