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
import type { PropertyTree, PropertyTreeNode } from "@/types/property.types"

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

const node = (id: string, name: string, areaNames: string[] = []): PropertyTreeNode => ({
    id,
    name,
    areas: areaNames.map((areaName, index) => ({
        id: `${id}-area-${index + 1}`,
        name: areaName,
        devices: [],
    })),
})

const treeOf = (...items: PropertyTreeNode[]): PropertyTree => ({ items, total: items.length })

const CASA = node("prop-1", "Casa Principal")

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

/** Todo `aria-describedby` de um botão tem de apontar para um elemento que existe. */
const expectDescribedByToResolve = (button: HTMLElement) => {
    const id = button.getAttribute("aria-describedby")
    if (id !== null) expect(document.getElementById(id)).not.toBeNull()
}

const areaButton = () => screen.getByRole("button", { name: /nova área/i })
const deviceButton = () => screen.getByRole("button", { name: /novo dispositivo/i })

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(distributorService.list).mockResolvedValue(paginated([]))
    vi.mocked(propertyService.getTree).mockResolvedValue(treeOf(CASA))
})

describe("RegistrationPage — com propriedades cadastradas", () => {
    it("mostra os três cards de cadastro com o botão de criar de cada um", async () => {
        renderPage()

        expect(await screen.findByRole("heading", { name: "Propriedade" })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Área" })).toBeInTheDocument()
        expect(screen.getByRole("heading", { name: "Dispositivo" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /nova propriedade/i })).toBeEnabled()
        await vi.waitFor(() => expect(areaButton()).toBeEnabled())
        expect(deviceButton()).toBeEnabled()
    })

    it("abre o modal de propriedade", async () => {
        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /nova propriedade/i }))

        expect(screen.getByRole("dialog", { name: /adicionar propriedade/i })).toBeInTheDocument()
    })

    it("abre o modal de área com o seletor de propriedade alimentado pela árvore", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { name: "Área" })
        await vi.waitFor(() => expect(areaButton()).toBeEnabled())
        await user.click(areaButton())

        expect(screen.getByRole("dialog", { name: /adicionar área/i })).toBeInTheDocument()
        expect(screen.getByLabelText("Propriedade")).toHaveValue("prop-1")
    })

    it("oferece todas as propriedades no seletor de área, sem cortar em 31", async () => {
        const user = userEvent.setup()
        const many = Array.from({ length: 40 }, (_, i) =>
            node(`prop-${i + 1}`, `Propriedade ${i + 1}`),
        )
        vi.mocked(propertyService.getTree).mockResolvedValue(treeOf(...many))
        renderPage()

        await screen.findByRole("heading", { name: "Área" })
        await vi.waitFor(() => expect(areaButton()).toBeEnabled())
        await user.click(areaButton())

        const options = screen.getByLabelText("Propriedade").querySelectorAll("option")
        expect(options).toHaveLength(40)
        expect(screen.getByRole("option", { name: "Propriedade 40" })).toBeInTheDocument()
    })

    it("abre o modal de dispositivo com as áreas da árvore, sem buscá-las de novo", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(
            treeOf(node("prop-1", "Casa", ["Sala", "Cozinha"]), node("prop-2", "Loja", ["Balcão"])),
        )
        renderPage()

        await screen.findByRole("heading", { name: "Dispositivo" })
        await vi.waitFor(() => expect(deviceButton()).toBeEnabled())
        await user.click(deviceButton())

        expect(screen.getByRole("dialog", { name: /adicionar dispositivo/i })).toBeInTheDocument()
        expect(screen.getByLabelText("Área")).toHaveValue("prop-1-area-1")
        expect(screen.getByRole("group", { name: "Loja" })).toBeInTheDocument()
        expect(areaService.list).not.toHaveBeenCalled()
    })

    it("explica no modal de dispositivo quando ainda não há nenhuma área", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { name: "Dispositivo" })
        await vi.waitFor(() => expect(deviceButton()).toBeEnabled())
        await user.click(deviceButton())

        expect(await screen.findByText(/nenhuma área cadastrada/i)).toBeInTheDocument()
    })

    it("mostra a árvore de cadastro abaixo dos cards", async () => {
        renderPage()

        expect(await screen.findByText("Estrutura cadastrada")).toBeInTheDocument()
        expect(await screen.findByText("Casa Principal")).toBeInTheDocument()
    })
})

describe("RegistrationPage — sem propriedades", () => {
    beforeEach(() => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ items: [], total: 0 })
    })

    it("desabilita Nova área e Novo dispositivo, com explicação, e mantém Nova propriedade", async () => {
        renderPage()

        expect(await screen.findByText(/cadastre uma propriedade primeiro/i)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /nova propriedade/i })).toBeEnabled()
        expect(areaButton()).toBeDisabled()
        expect(deviceButton()).toBeDisabled()
    })

    it("liga a explicação aos botões desabilitados via aria-describedby", async () => {
        renderPage()

        const explanation = await screen.findByText(/cadastre uma propriedade primeiro/i)

        expect(areaButton()).toHaveAttribute("aria-describedby", explanation.id)
        expect(deviceButton()).toHaveAttribute("aria-describedby", explanation.id)
    })
})

describe("RegistrationPage — carregamento e erro", () => {
    it("mantém Nova área e Novo dispositivo desabilitados enquanto carrega, sem referência quebrada", () => {
        vi.mocked(propertyService.getTree).mockReturnValue(new Promise(() => {}))
        renderPage()

        expect(areaButton()).toBeDisabled()
        expect(deviceButton()).toBeDisabled()
        expectDescribedByToResolve(areaButton())
        expectDescribedByToResolve(deviceButton())
    })

    it("falha fechado, explica e permite tentar de novo quando a árvore não carrega", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockRejectedValueOnce(new Error("boom"))
        vi.mocked(propertyService.getTree).mockResolvedValue(treeOf(CASA))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i)
        const explanation = await screen.findByText(/ficam indisponíveis/i)
        expect(areaButton()).toBeDisabled()
        expect(areaButton()).toHaveAttribute("aria-describedby", explanation.id)
        expect(deviceButton()).toHaveAttribute("aria-describedby", explanation.id)
        expectDescribedByToResolve(areaButton())

        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        await vi.waitFor(() => expect(areaButton()).toBeEnabled())
        expect(screen.queryByText(/ficam indisponíveis/i)).not.toBeInTheDocument()
    })
})
