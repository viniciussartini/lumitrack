import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, type RenderOptions } from "@testing-library/react"
import { AuthProvider } from "@/contexts/AuthContext"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { propertyService } from "@/services/property.service"
import { authService } from "@/services/auth.service"
import { demandService } from "@/services/demand.service"
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

vi.mock("@/services/demand.service", () => ({
    demandService: { overview: vi.fn() },
}))

vi.mock("@/services/auth.service", () => ({
    authService: {
        login: vi.fn(),
        verifyMfaLogin: vi.fn(),
        logout: vi.fn(),
        getCurrentUser: vi.fn(),
        register: vi.fn(),
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
    groupBModality: "CONVENTIONAL",
    receivesBillingDiscount: false,
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
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

        expect(await screen.findByText(/nenhuma propriedade cadastrada/i)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /cadastrar propriedade/i })).toHaveAttribute(
            "href",
            "/propriedades",
        )
    })
})

describe("DashboardPage — seletor de propriedade", () => {
    it("renderiza um botão por propriedade, com a primeira selecionada por padrão", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA, mockPropertyB]))

        renderPage()

        const btnA = await screen.findByTestId("property-selector-prop-a")
        const btnB = screen.getByTestId("property-selector-prop-b")

        expect(btnA).toHaveAttribute("aria-selected", "true")
        expect(btnB).toHaveAttribute("aria-selected", "false")
    })

    it("troca a seleção ao clicar e persiste em localStorage", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA, mockPropertyB]))

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
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA, mockPropertyB]))

        renderPage()

        const btnB = await screen.findByTestId("property-selector-prop-b")
        expect(btnB).toHaveAttribute("aria-selected", "true")
    })

    it("cai para a primeira propriedade quando o id persistido não existe mais na lista", async () => {
        storage.set(STORAGE_KEYS.SELECTED_PROPERTY, "prop-orfao")
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA, mockPropertyB]))

        renderPage()

        const btnA = await screen.findByTestId("property-selector-prop-a")
        await waitFor(() => {
            expect(btnA).toHaveAttribute("aria-selected", "true")
        })
        expect(storage.get(STORAGE_KEYS.SELECTED_PROPERTY)).toBe("prop-a")
    })
})

describe("DashboardPage — ordem dos blocos", () => {
    it("os blocos novos vêm logo abaixo do seletor, na ordem do design, antes dos que o Painel já tinha", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA]))

        renderPage()

        const selector = await screen.findByTestId("property-selector")
        const today = await screen.findByTestId("today-consumption-section")
        const weight = await screen.findByTestId("area-weight-section")
        const goal = await screen.findByTestId("goal-section")
        const history = await screen.findByTestId("consumption-history-section")

        const follows = (before: HTMLElement, after: HTMLElement) =>
            Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)
        expect(follows(selector, today)).toBe(true)
        expect(follows(today, weight)).toBe(true)
        expect(follows(weight, goal)).toBe(true)
        expect(follows(goal, history)).toBe(true)
    })
})

describe("DashboardPage — demanda do Grupo A", () => {
    const groupA: Property = { ...mockPropertyA, id: "prop-ga", tariffGroup: "GROUP_A" }

    it("o bloco de demanda só aparece para propriedade do Grupo A, acima dos demais", async () => {
        vi.mocked(demandService.overview).mockReturnValue(new Promise(() => {}))
        vi.mocked(propertyService.list).mockResolvedValue(paginated([groupA]))

        renderPage()

        const demand = await screen.findByTestId("demand-section")
        const today = await screen.findByTestId("today-consumption-section")
        expect(demandService.overview).toHaveBeenCalledWith("prop-ga")
        expect(
            Boolean(demand.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBe(true)
    })

    it("propriedade do Grupo B não mostra o bloco nem chama o endpoint", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([mockPropertyA]))

        renderPage()

        await screen.findByTestId("today-consumption-section")
        expect(screen.queryByTestId("demand-section")).not.toBeInTheDocument()
        expect(demandService.overview).not.toHaveBeenCalled()
    })

    it("trocar de Grupo A para Grupo B tira o bloco", async () => {
        vi.mocked(demandService.overview).mockReturnValue(new Promise(() => {}))
        vi.mocked(propertyService.list).mockResolvedValue(paginated([groupA, mockPropertyB]))

        renderPage()
        await screen.findByTestId("demand-section")
        await userEvent.setup().click(screen.getByTestId("property-selector-prop-b"))

        expect(screen.queryByTestId("demand-section")).not.toBeInTheDocument()
    })
})
