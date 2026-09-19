import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen } from "@testing-library/react"
import { RegistrationPage } from "@/pages/settings/RegistrationPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import { areaService } from "@/services/area.service"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getTree: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/distributor.service", () => ({
    distributorService: { list: vi.fn(), getById: vi.fn() },
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

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 31,
})

const PROPERTY = { id: "prop-1", name: "Casa Principal" } as Property

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <RegistrationPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(distributorService.list).mockResolvedValue(paginated([]))
    vi.mocked(propertyService.getTree).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(areaService.list).mockResolvedValue(paginated([]))
})

describe("RegistrationPage — com propriedades cadastradas", () => {
    beforeEach(() => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([PROPERTY]))
    })

    it("mostra os três cards de cadastro com o botão de criar de cada um", async () => {
        renderPage()

        expect(await screen.findByRole("heading", { name: "Propriedade" })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Área" })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Dispositivo" })).toBeInTheDocument()
        expect(await screen.findByRole("button", { name: /nova propriedade/i })).toBeEnabled()
        expect(await screen.findByRole("button", { name: /nova área/i })).toBeEnabled()
        expect(await screen.findByRole("button", { name: /novo dispositivo/i })).toBeEnabled()
    })

    it("abre o modal de propriedade", async () => {
        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /nova propriedade/i }))

        expect(screen.getByRole("dialog", { name: /adicionar propriedade/i })).toBeInTheDocument()
    })

    it("abre o modal de área com o seletor de propriedade", async () => {
        const user = userEvent.setup()
        renderPage()

        const button = await screen.findByRole("button", { name: /nova área/i })
        await vi.waitFor(() => expect(button).toBeEnabled())
        await user.click(button)

        expect(screen.getByRole("dialog", { name: /adicionar área/i })).toBeInTheDocument()
        expect(screen.getByLabelText("Propriedade")).toHaveValue("prop-1")
    })

    it("abre o modal de dispositivo", async () => {
        const user = userEvent.setup()
        renderPage()

        const button = await screen.findByRole("button", { name: /novo dispositivo/i })
        await vi.waitFor(() => expect(button).toBeEnabled())
        await user.click(button)

        expect(screen.getByRole("dialog", { name: /adicionar dispositivo/i })).toBeInTheDocument()
    })

    it("explica no modal de dispositivo quando ainda não há nenhuma área", async () => {
        const user = userEvent.setup()
        renderPage()

        const button = await screen.findByRole("button", { name: /novo dispositivo/i })
        await vi.waitFor(() => expect(button).toBeEnabled())
        await user.click(button)

        expect(await screen.findByText(/nenhuma área cadastrada/i)).toBeInTheDocument()
    })
})

describe("RegistrationPage — estrutura cadastrada", () => {
    it("mostra a árvore de cadastro abaixo dos cards", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([PROPERTY]))
        vi.mocked(propertyService.getTree).mockResolvedValue({
            total: 1,
            items: [{ id: "prop-1", name: "Casa Principal", areas: [] }],
        })
        renderPage()

        expect(await screen.findByText("Estrutura cadastrada")).toBeInTheDocument()
        expect(await screen.findByText("Casa Principal")).toBeInTheDocument()
    })
})

describe("RegistrationPage — sem propriedades", () => {
    beforeEach(() => {
        vi.mocked(propertyService.list).mockResolvedValue(paginated([]))
    })

    it("desabilita Nova área e Novo dispositivo, com explicação, e mantém Nova propriedade", async () => {
        renderPage()

        expect(await screen.findByText(/cadastre uma propriedade primeiro/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /nova propriedade/i })).toBeEnabled()
        expect(screen.getByRole("button", { name: /nova área/i })).toBeDisabled()
        expect(screen.getByRole("button", { name: /novo dispositivo/i })).toBeDisabled()
    })

    it("liga a explicação aos botões desabilitados via aria-describedby", async () => {
        renderPage()

        const explanation = await screen.findByText(/cadastre uma propriedade primeiro/i)
        const areaButton = screen.getByRole("button", { name: /nova área/i })

        expect(areaButton).toHaveAttribute("aria-describedby", explanation.id)
    })
})

describe("RegistrationPage — carregamento e erro", () => {
    it("mantém Nova área e Novo dispositivo desabilitados enquanto carrega", () => {
        vi.mocked(propertyService.list).mockReturnValue(new Promise(() => {}))
        renderPage()

        expect(screen.getByRole("button", { name: /nova área/i })).toBeDisabled()
        expect(screen.getByRole("button", { name: /novo dispositivo/i })).toBeDisabled()
    })

    it("falha fechado e permite tentar de novo quando a busca de propriedades falha", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.list).mockRejectedValueOnce(new Error("boom"))
        vi.mocked(propertyService.list).mockResolvedValue(paginated([PROPERTY]))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i)
        expect(screen.getByRole("button", { name: /nova área/i })).toBeDisabled()

        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        expect(await screen.findByRole("button", { name: /nova área/i })).toBeEnabled()
    })
})
