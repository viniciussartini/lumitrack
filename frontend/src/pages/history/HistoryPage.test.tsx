import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { HistoryPage } from "@/pages/history/HistoryPage"
import { propertyService } from "@/services/property.service"
import type { PropertyTree } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

const TREE: PropertyTree = {
    total: 1,
    items: [
        {
            id: "prop-1",
            name: "Casa Principal",
            areas: [
                {
                    id: "area-1",
                    name: "Sala",
                    devices: [{ id: "dev-1", name: "TV", powerWatts: 100 }],
                },
            ],
        },
    ],
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <HistoryPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("HistoryPage", () => {
    it("mostra o carregamento enquanto a árvore não chega", () => {
        vi.mocked(propertyService.getTree).mockReturnValue(new Promise(() => {}))
        renderPage()

        expect(screen.getByRole("status")).toHaveTextContent("Carregando...")
    })

    it("mostra erro quando a árvore falha", async () => {
        vi.mocked(propertyService.getTree).mockRejectedValue(new Error("falhou"))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar suas propriedades.",
        )
    })

    it("sem propriedades: orienta a cadastrar, com link para o cadastro", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ total: 0, items: [] })
        renderPage()

        expect(await screen.findByText("Nada para comparar ainda")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Ir para o cadastro" })).toHaveAttribute(
            "href",
            "/configuracoes/cadastro",
        )
    })

    it("com propriedades: formulário com os alvos da árvore e o texto de espera", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        renderPage()

        const target = await screen.findByLabelText("Alvo")
        expect(within(target).getByRole("option", { name: "Casa Principal" })).toBeInTheDocument()
        expect(
            within(target).getByRole("option", { name: "Casa Principal · Sala" }),
        ).toBeInTheDocument()
        expect(within(target).getByRole("option", { name: "Sala · TV" })).toBeInTheDocument()
        expect(screen.getByTestId("history-idle")).toHaveTextContent(
            "Defina os parâmetros e clique em Criar comparação.",
        )
    })

    it("depois de criar a comparação, o texto de espera some", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        renderPage()
        await screen.findByLabelText("Alvo")

        const groupA = screen.getByRole("group", { name: "Período A" })
        const groupB = screen.getByRole("group", { name: "Período B" })
        await user.type(within(groupA).getByLabelText("Início"), "2026-01-01")
        await user.type(within(groupA).getByLabelText("Fim"), "2026-01-07")
        await user.type(within(groupB).getByLabelText("Início"), "2026-02-01")
        await user.type(within(groupB).getByLabelText("Fim"), "2026-02-07")
        await user.click(screen.getByRole("button", { name: /Criar comparação/i }))

        expect(screen.queryByTestId("history-idle")).not.toBeInTheDocument()
    })
})
