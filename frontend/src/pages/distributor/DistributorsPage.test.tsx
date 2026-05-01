import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { render, screen, waitFor, type RenderOptions } from "@testing-library/react"
import { DistribuidorsPage } from "@/pages/distributor/DistributorsPage"
import { distributorService } from "@/services/distributor.service"
import { ThemeProvider } from "@/contexts/ThemeContext"
import type { Distributor } from "@/types/distributor.types"

// Mock do service inteiro — testes ficam unitários, sem rede
vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockDistributor1: Distributor = {
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

const mockDistributor2: Distributor = {
    ...mockDistributor1,
    id: "dist-2",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
    electricalSystem: "BIPHASIC",
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
    it("renderiza título e botão de nova distribuidora", async () => {
        vi.mocked(distributorService.list).mockResolvedValue([])

        renderPage()

        expect(
            screen.getByRole("heading", { name: /distribuidoras/i, level: 1 }),
        ).toBeInTheDocument()

        const newButton = await screen.findByRole("link", {
            name: /nova distribuidora/i,
        })
        expect(newButton).toHaveAttribute("href", "/distribuidoras/nova")
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
        vi.mocked(distributorService.list).mockResolvedValue([])

        renderPage()

        expect(
            await screen.findByText(/nenhuma distribuidora cadastrada/i),
        ).toBeInTheDocument()

        const cta = screen.getByRole("link", {
            name: /cadastrar primeira distribuidora/i,
        })
        expect(cta).toHaveAttribute("href", "/distribuidoras/nova")
    })
})

describe("DistribuidorsPage — sucesso", () => {
    it("renderiza um card para cada distribuidora", async () => {
        vi.mocked(distributorService.list).mockResolvedValue([
            mockDistributor1,
            mockDistributor2,
        ])

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
            .mockResolvedValueOnce([mockDistributor1])

        renderPage()

        await screen.findByText(/não foi possível carregar/i)

        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        await waitFor(() => {
            expect(screen.getByText("CEMIG Distribuição S.A.")).toBeInTheDocument()
        })
    })
})