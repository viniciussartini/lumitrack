import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, type RenderOptions } from "@testing-library/react"
import { AuthProvider } from "@/contexts/AuthContext"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { propertyService } from "@/services/property.service"
import { authService } from "@/services/auth.service"
import { storage, STORAGE_KEYS } from "@/lib/storage"
import type { Property } from "@/types/property.types"
import type { Paginated } from "@/types/pagination.types"

// Mock do service inteiro — testes ficam unitários, sem rede
vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    },
}))

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        verifyMfaLogin: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
        register: vi.fn(),
        refresh: vi.fn(),
    },
}))

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
})

const mockPropertyA: Property = {
    id: "prop-a",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockPropertyB: Property = {
    ...mockPropertyA,
    id: "prop-b",
    name: "Loja",
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
    return render(<DashboardPage />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <AuthProvider>{children}</AuthProvider>
                </MemoryRouter>
            </QueryClientProvider>
        ),
        ...options,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(authService.getCurrentUser).mockResolvedValue(null)
})

describe("DashboardPage — loading", () => {
    it("exibe skeleton enquanto carrega", () => {
        vi.mocked(propertyService.list).mockReturnValue(new Promise(() => {}))

        renderPage()

        expect(screen.getByLabelText(/carregando painel/i)).toBeInTheDocument()
    })
})

describe("DashboardPage — erro", () => {
    it("exibe ErrorState e permite tentar novamente", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(new Error("Falha de rede"))

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText("Falha de rede")).toBeInTheDocument()

        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA]))
        const user = userEvent.setup()
        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        expect(await screen.findByTestId("property-selector")).toBeInTheDocument()
    })
})

describe("DashboardPage — vazio", () => {
    it("exibe EmptyState com CTA quando não há propriedades", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(/nenhuma propriedade cadastrada/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /cadastrar propriedade/i }),
        ).toHaveAttribute("href", "/propriedades")
    })
})

describe("DashboardPage — seletor de propriedade", () => {
    it("renderiza um botão por propriedade, com a primeira selecionada por padrão", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockPropertyA, mockPropertyB]),
        )

        renderPage()

        const btnA = await screen.findByTestId("property-selector-prop-a")
        const btnB = screen.getByTestId("property-selector-prop-b")

        expect(btnA).toHaveAttribute("aria-selected", "true")
        expect(btnB).toHaveAttribute("aria-selected", "false")
    })

    it("troca a seleção ao clicar e persiste em localStorage", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockPropertyA, mockPropertyB]),
        )

        renderPage()

        const btnB = await screen.findByTestId("property-selector-prop-b")
        const user = userEvent.setup()
        await user.click(btnB)

        expect(btnB).toHaveAttribute("aria-selected", "true")
        expect(screen.getByTestId("property-selector-prop-a")).toHaveAttribute(
            "aria-selected",
            "false",
        )
        expect(storage.get(STORAGE_KEYS.SELECTED_PROPERTY)).toBe("prop-b")
    })

    it("nasce com a propriedade persistida em localStorage já selecionada", async () => {
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, "prop-b")
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockPropertyA, mockPropertyB]),
        )

        renderPage()

        const btnB = await screen.findByTestId("property-selector-prop-b")
        expect(btnB).toHaveAttribute("aria-selected", "true")
    })

    it("cai para a primeira propriedade quando o id persistido não existe mais na lista", async () => {
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, "prop-orfao")
        vi.mocked(propertyService.list).mockResolvedValue(
            paginated([mockPropertyA, mockPropertyB]),
        )

        renderPage()

        const btnA = await screen.findByTestId("property-selector-prop-a")
        await waitFor(() => {
            expect(btnA).toHaveAttribute("aria-selected", "true")
        })
        expect(storage.get(STORAGE_KEYS.SELECTED_PROPERTY)).toBe("prop-a")
    })
})
