import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { HistoryPage } from "@/pages/history/HistoryPage"
import { propertyService } from "@/services/property.service"
import { meterReadingService } from "@/services/meterReading.service"
import type { PropertyTree } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { comparePeriods: vi.fn() },
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

    describe("depois de criar a comparação", () => {
        const submitValidComparison = async (user: ReturnType<typeof userEvent.setup>) => {
            await screen.findByLabelText("Alvo")
            const groupA = screen.getByRole("group", { name: "Período A" })
            const groupB = screen.getByRole("group", { name: "Período B" })
            await user.type(within(groupA).getByLabelText("Início"), "2026-01-01")
            await user.type(within(groupA).getByLabelText("Fim"), "2026-01-07")
            await user.type(within(groupB).getByLabelText("Início"), "2026-02-01")
            await user.type(within(groupB).getByLabelText("Fim"), "2026-02-07")
            await user.click(screen.getByRole("button", { name: /Criar comparação/i }))
        }

        const period = { from: "", to: "", items: [], summary: { min: null, avg: null, max: null } }

        it("busca com os instantes de São Paulo e mostra o gráfico com a legenda A/B", async () => {
            const user = userEvent.setup()
            vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
            vi.mocked(meterReadingService.comparePeriods).mockResolvedValue({
                metric: "tensao",
                granularity: "day",
                periodA: period,
                periodB: period,
                diff: { absolute: null, percent: null },
            })
            renderPage()

            await submitValidComparison(user)

            expect(await screen.findByTestId("period-comparison-chart")).toBeInTheDocument()
            expect(screen.getByTestId("period-comparison-differences")).toBeInTheDocument()
            expect(screen.getByText("A · 01/01/2026 – 07/01/2026")).toBeInTheDocument()
            expect(screen.getByText("B · 01/02/2026 – 07/02/2026")).toBeInTheDocument()
            expect(screen.queryByTestId("history-idle")).not.toBeInTheDocument()
            expect(meterReadingService.comparePeriods).toHaveBeenCalledWith(
                expect.objectContaining({
                    targetType: "PROPERTY",
                    targetId: "prop-1",
                    metric: "tensao",
                    fromA: "2026-01-01T03:00:00.000Z",
                    toB: "2026-02-08T03:00:00.000Z",
                }),
            )
        })

        it("enquanto a comparação carrega, mostra o estado de carregamento", async () => {
            const user = userEvent.setup()
            vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
            vi.mocked(meterReadingService.comparePeriods).mockReturnValue(new Promise(() => {}))
            renderPage()

            await submitValidComparison(user)

            expect(await screen.findByText("Carregando...")).toBeInTheDocument()
            expect(screen.queryByTestId("period-comparison-chart")).not.toBeInTheDocument()
            expect(screen.queryByTestId("period-comparison-differences")).not.toBeInTheDocument()
        })

        it("falha na comparação (ex.: alvo sem medidor): mostra erro, sem gráfico", async () => {
            const user = userEvent.setup()
            vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
            vi.mocked(meterReadingService.comparePeriods).mockRejectedValue(new Error("falhou"))
            renderPage()

            await submitValidComparison(user)

            expect(await screen.findByRole("alert")).toHaveTextContent(
                "Não foi possível carregar a comparação.",
            )
            expect(screen.queryByTestId("period-comparison-chart")).not.toBeInTheDocument()
            expect(screen.queryByTestId("period-comparison-differences")).not.toBeInTheDocument()
        })
    })
})
