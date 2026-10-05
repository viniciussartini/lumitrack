import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { GoalsPage } from "@/pages/settings/GoalsPage"
import { goalService } from "@/services/goal.service"
import { propertyService } from "@/services/property.service"
import { storage } from "@/lib/storage"
import type { Goal, GoalProgress } from "@/types/goal.types"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { list: vi.fn() },
}))

vi.mock("@/services/goal.service", () => ({
    goalService: {
        list: vi.fn(),
        progress: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const property = (id: string, name: string): Property => ({
    id,
    userId: "user-1",
    distributorId: "dist-1",
    name,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const paged = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 31,
})

const makeGoal = (year: number, override: Partial<Goal> = {}): Goal => ({
    id: `goal-${year}`,
    propertyId: "prop-a",
    year,
    unit: "KWH",
    referenceYear: year - 1,
    monthlyTargets: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...override,
})

const makeProgress = (year: number, override: Partial<GoalProgress> = {}): GoalProgress => ({
    goalId: `goal-${year}`,
    year,
    unit: "KWH",
    months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 400,
        realized: year === 2026 && i < 6 ? 380 : null,
    })),
    yearTarget: 4800,
    realized: null,
    deviationPercent: null,
    currentMonthTarget: year === 2026 ? 400 : null,
    situation: "IN_PROGRESS",
    ...override,
})

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <GoalsPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Só a data é simulada: 15/06/2026, meio do ano em São Paulo.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-15T15:00:00.000Z") })
    vi.mocked(propertyService.list).mockResolvedValue(paged([property("prop-a", "Casa")]))
    vi.mocked(goalService.list).mockResolvedValue(paged([]))
    vi.mocked(goalService.progress).mockResolvedValue([])
})

afterEach(() => {
    vi.useRealTimers()
})

describe("GoalsPage — estados da página", () => {
    it("mostra o carregamento enquanto as propriedades não chegam", () => {
        vi.mocked(propertyService.list).mockReturnValue(new Promise(() => {}))
        renderPage()

        expect(screen.getByRole("status")).toHaveTextContent("Carregando...")
    })

    it("mostra erro quando as propriedades falham", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(new Error("falha"))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar suas propriedades.",
        )
    })

    it("sem propriedade, leva ao cadastro", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(paged([]))
        renderPage()

        expect(await screen.findByText("Nenhuma propriedade cadastrada")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Ir para o cadastro" })).toHaveAttribute(
            "href",
            "/configuracoes/cadastro",
        )
        expect(goalService.list).not.toHaveBeenCalled()
    })

    it("mostra erro quando as metas falham", async () => {
        vi.mocked(goalService.list).mockRejectedValue(new Error("falha"))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar as metas.",
        )
    })

    it("com uma só propriedade, não mostra o seletor", async () => {
        renderPage()

        await screen.findByTestId("goal-summary")
        expect(screen.queryByTestId("property-selector")).not.toBeInTheDocument()
    })

    it("com duas propriedades, troca a lista de metas ao escolher a outra", async () => {
        vi.mocked(propertyService.list).mockResolvedValue(
            paged([property("prop-a", "Casa"), property("prop-b", "Loja")]),
        )
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-summary")
        expect(goalService.list).toHaveBeenLastCalledWith("prop-a", { page: 1, pageSize: 31 })

        await user.click(screen.getByTestId("property-selector-prop-b"))

        await waitFor(() =>
            expect(goalService.list).toHaveBeenLastCalledWith("prop-b", {
                page: 1,
                pageSize: 31,
            }),
        )
        expect(storage.get("lumitrack:selected-property")).toBe("prop-b")
    })
})

describe("GoalsPage — metas", () => {
    it("descreve a meta do ano corrente e lista o histórico, do mais recente ao mais antigo", async () => {
        vi.mocked(goalService.list).mockResolvedValue(
            paged([makeGoal(2027), makeGoal(2026), makeGoal(2025)]),
        )
        renderPage()

        const summary = await screen.findByTestId("goal-summary")
        expect(summary).toHaveTextContent("Teto de 4.800 kWh para 2026")
        expect(summary).toHaveTextContent("meta do mês 400 kWh")

        const rows = within(screen.getByTestId("goal-history")).getAllByRole("row")
        expect(rows[1]).toHaveTextContent("2027")
        expect(rows[2]).toHaveTextContent("2026")
        expect(rows[3]).toHaveTextContent("2025")
    })

    it("sem meta no ano corrente, avisa e mantém o botão de nova meta", async () => {
        renderPage()

        expect(await screen.findByTestId("goal-summary")).toHaveTextContent(
            "Nenhuma meta cadastrada para 2026.",
        )
        expect(screen.getByRole("button", { name: "Nova meta" })).toBeInTheDocument()
        expect(screen.getByTestId("goal-history-empty")).toBeInTheDocument()
    })

    it("ano corrente e futuro oferecem editar e excluir; ano passado, só usar como referência", async () => {
        vi.mocked(goalService.list).mockResolvedValue(
            paged([makeGoal(2027), makeGoal(2026), makeGoal(2025)]),
        )
        vi.mocked(goalService.progress).mockResolvedValue([
            makeProgress(2027),
            makeProgress(2026),
            makeProgress(2025, { situation: null }),
        ])
        renderPage()
        await screen.findByTestId("goal-progress")

        for (const year of [2027, 2026]) {
            const row = screen.getByTestId(`goal-row-${year}`)
            expect(
                within(row).getByRole("button", { name: `Editar meta de ${year}` }),
            ).toBeInTheDocument()
            expect(
                within(row).getByRole("button", { name: `Excluir meta de ${year}` }),
            ).toBeInTheDocument()
            expect(row).toHaveTextContent("Em andamento")
        }
        const past = screen.getByTestId("goal-row-2025")
        expect(
            within(past).queryByRole("button", { name: /Editar|Excluir/ }),
        ).not.toBeInTheDocument()
        expect(
            within(past).getByRole("button", { name: "Usar a meta de 2025 como referência" }),
        ).toBeInTheDocument()
        expect(past).toHaveTextContent("-")
    })
})

describe("GoalsPage — acompanhamento", () => {
    it("mostra o gráfico e os cards da meta do ano corrente e o realizado na tabela", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026), makeGoal(2025)]))
        vi.mocked(goalService.progress).mockResolvedValue([
            makeProgress(2026, { realized: 2280, deviationPercent: 3.6 }),
            makeProgress(2025, { realized: 4680, deviationPercent: -2.5, situation: "MET" }),
        ])
        renderPage()

        const section = await screen.findByTestId("goal-progress")
        expect(within(section).getByText("2026 · meta vs. realizado")).toBeInTheDocument()
        expect(within(section).getByText("Realizado até junho")).toBeInTheDocument()
        expect(within(section).getByText("+3,6%")).toBeInTheDocument()
        expect(goalService.progress).toHaveBeenCalledWith("prop-a")

        expect(screen.getByTestId("goal-row-2026")).toHaveTextContent("2.280 kWh")
        const past = screen.getByTestId("goal-row-2025")
        expect(past).toHaveTextContent("4.680 kWh")
        expect(past).toHaveTextContent("Cumprida")
    })

    it("sem meta no ano corrente, não mostra o bloco de acompanhamento", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2027)]))
        vi.mocked(goalService.progress).mockResolvedValue([makeProgress(2027)])
        renderPage()

        await screen.findByTestId("goal-history")
        expect(screen.queryByTestId("goal-progress")).not.toBeInTheDocument()
    })

    it("se o acompanhamento falhar, avisa só ali e mantém a lista de metas", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        vi.mocked(goalService.progress).mockRejectedValue(new Error("falha"))
        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar o acompanhamento das metas.",
        )
        expect(screen.getByTestId("goal-row-2026")).toHaveTextContent("4.800 kWh")
        expect(screen.getByRole("button", { name: "Nova meta" })).toBeInTheDocument()
    })
})

describe("GoalsPage — criar", () => {
    it("cria a meta: o consumo específico preenche os 12 meses e o ano sugerido é o primeiro livre", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        vi.mocked(goalService.create).mockResolvedValue(makeGoal(2027))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog", { name: /nova meta de consumo/i })
        expect(within(dialog).getByLabelText("Ano da meta")).toHaveValue(2027)
        expect(within(dialog).getByLabelText("Ano de referência")).toHaveValue(2025)

        await user.type(within(dialog).getByLabelText(/consumo específico alvo/i), "500")
        expect(within(dialog).getByLabelText("jan")).toHaveValue(500)
        expect(within(dialog).getByLabelText("dez")).toHaveValue(500)
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        await waitFor(() =>
            expect(goalService.create).toHaveBeenCalledWith({
                propertyId: "prop-a",
                year: 2027,
                unit: "KWH",
                referenceYear: 2025,
                monthlyTargets: Array.from({ length: 12 }, () => 500),
                alertPercent: 85,
            }),
        )
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("não envia com meses em branco e mostra o motivo", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(/12 meses/)
        expect(goalService.create).not.toHaveBeenCalled()
    })

    it("não deixa repetir um ano que a propriedade já tem", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog")
        const year = within(dialog).getByLabelText("Ano da meta")
        await user.clear(year)
        await user.type(year, "2026")
        await user.type(within(dialog).getByLabelText(/consumo específico alvo/i), "500")
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(/já tem uma meta/i)
        expect(goalService.create).not.toHaveBeenCalled()
    })

    it("avisa quando o servidor recusa e mantém o modal aberto", async () => {
        vi.mocked(goalService.create).mockRejectedValue(
            new Error("Esta propriedade já tem uma meta"),
        )
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog")
        await user.type(within(dialog).getByLabelText(/consumo específico alvo/i), "500")
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar a meta", {
                description: "Esta propriedade já tem uma meta",
            }),
        )
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
})

describe("GoalsPage — usar como referência", () => {
    const realizedMonths = (kwh: (number | null)[]) =>
        Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            target: 400,
            realized: kwh[i] ?? null,
        }))

    it("abre a meta nova preenchida com o realizado do ano escolhido e a cria", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026), makeGoal(2025)]))
        vi.mocked(goalService.progress).mockResolvedValue([
            makeProgress(2026),
            makeProgress(2025, {
                situation: "MET",
                months: realizedMonths([300, null, ...Array.from({ length: 10 }, () => 500)]),
            }),
        ])
        vi.mocked(goalService.create).mockResolvedValue(makeGoal(2027))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(
            await screen.findByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )
        const dialog = await screen.findByRole("dialog", { name: /nova meta de consumo/i })
        expect(within(dialog).getByLabelText("Ano da meta")).toHaveValue(2027)
        expect(within(dialog).getByLabelText("Ano de referência")).toHaveValue(2025)
        expect(within(dialog).getByLabelText("jan")).toHaveValue(300)
        expect(within(dialog).getByLabelText("fev")).toHaveValue(null)
        expect(within(dialog).getByLabelText("mar")).toHaveValue(500)

        // O mês sem leitura continua vazio: o usuário precisa preenchê-lo antes de salvar.
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))
        expect(await within(dialog).findByRole("alert")).toHaveTextContent(/12 meses/)
        expect(goalService.create).not.toHaveBeenCalled()

        await user.type(within(dialog).getByLabelText("fev"), "450")
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        await waitFor(() =>
            expect(goalService.create).toHaveBeenCalledWith({
                propertyId: "prop-a",
                year: 2027,
                unit: "KWH",
                referenceYear: 2025,
                monthlyTargets: [300, 450, ...Array.from({ length: 10 }, () => 500)],
                alertPercent: 85,
            }),
        )
    })

    it("pula o ano seguinte se a propriedade já tem meta para ele", async () => {
        vi.mocked(goalService.list).mockResolvedValue(
            paged([makeGoal(2027), makeGoal(2026), makeGoal(2025)]),
        )
        vi.mocked(goalService.progress).mockResolvedValue([
            makeProgress(2027),
            makeProgress(2026),
            makeProgress(2025, { situation: "MET" }),
        ])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(
            await screen.findByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )
        const dialog = await screen.findByRole("dialog")

        expect(within(dialog).getByLabelText("Ano da meta")).toHaveValue(2028)
    })

    it("sem o acompanhamento, abre com a referência e os meses vazios", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2025)]))
        vi.mocked(goalService.progress).mockRejectedValue(new Error("falha"))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(
            await screen.findByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )
        const dialog = await screen.findByRole("dialog")

        expect(within(dialog).getByLabelText("Ano de referência")).toHaveValue(2025)
        expect(within(dialog).getByLabelText("jan")).toHaveValue(null)
    })

    it("o botão de nova meta depois dele volta ao rascunho padrão, sem os dados da referência", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2025)]))
        vi.mocked(goalService.progress).mockResolvedValue([
            makeProgress(2025, { situation: "MET", months: realizedMonths([300]) }),
        ])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(
            await screen.findByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }),
        )
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        await user.click(screen.getByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog")

        expect(within(dialog).getByLabelText("Ano da meta")).toHaveValue(2026)
        expect(within(dialog).getByLabelText("jan")).toHaveValue(null)
    })
})

describe("GoalsPage — editar e excluir", () => {
    it("edita só os valores: o ano fica travado e o corpo não leva ano nem propriedade", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        vi.mocked(goalService.update).mockResolvedValue(makeGoal(2026, { alertPercent: 90 }))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Editar meta de 2026" }))
        const dialog = await screen.findByRole("dialog", { name: /editar meta de consumo/i })
        expect(within(dialog).getByLabelText("Ano da meta")).toBeDisabled()
        expect(within(dialog).getByLabelText("jan")).toHaveValue(400)

        const alert = within(dialog).getByLabelText(/alerta ao atingir/i)
        await user.clear(alert)
        await user.type(alert, "90")
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        await waitFor(() =>
            expect(goalService.update).toHaveBeenCalledWith("goal-2026", {
                referenceYear: 2025,
                monthlyTargets: Array.from({ length: 12 }, () => 400),
                alertPercent: 90,
            }),
        )
    })

    it("exclui depois da confirmação", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2027)]))
        vi.mocked(goalService.remove).mockResolvedValue(undefined)
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Excluir meta de 2027" }))
        expect(goalService.remove).not.toHaveBeenCalled()
        const dialog = await screen.findByRole("dialog")
        expect(dialog).toHaveTextContent("A meta de 2027 será removida")
        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(goalService.remove).toHaveBeenCalledWith("goal-2027"))
    })

    it("avisa quando o servidor recusa a exclusão", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2027)]))
        vi.mocked(goalService.remove).mockRejectedValue(new Error("Metas de anos anteriores"))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Excluir meta de 2027" }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível excluir a meta", {
                description: "Metas de anos anteriores",
            }),
        )
    })
})

describe("GoalsPage — metas de custo (R$)", () => {
    const brl = (year: number, override: Partial<Goal> = {}) =>
        makeGoal(year, { id: `goal-brl-${year}`, unit: "BRL", ...override })
    const brlProgress = (year: number, override: Partial<GoalProgress> = {}) =>
        makeProgress(year, { goalId: `goal-brl-${year}`, unit: "BRL", ...override })

    it("começa em consumo e troca a página inteira para custo ao escolher R$", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026), brl(2026)]))
        vi.mocked(goalService.progress).mockResolvedValue([makeProgress(2026), brlProgress(2026)])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        expect(await screen.findByText("Metas de consumo anual")).toBeInTheDocument()
        expect(screen.getByTestId("goal-summary")).toHaveTextContent("kWh")

        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))

        expect(await screen.findByText("Metas de custo anual")).toBeInTheDocument()
        expect(screen.getByTestId("goal-summary")).toHaveTextContent("R$ 4.800")
        expect(screen.getByTestId("goal-history")).toHaveTextContent("R$ 4.800")
        expect(
            within(screen.getByTestId("goal-history")).getAllByTestId("goal-row-2026"),
        ).toHaveLength(1)
    })

    it("cada unidade só mostra as próprias metas no histórico", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026), brl(2027)]))
        vi.mocked(goalService.progress).mockResolvedValue([makeProgress(2026), brlProgress(2027)])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-row-2026")
        expect(screen.queryByTestId("goal-row-2027")).not.toBeInTheDocument()

        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))

        expect(await screen.findByTestId("goal-row-2027")).toBeInTheDocument()
        expect(screen.queryByTestId("goal-row-2026")).not.toBeInTheDocument()
    })

    it("sem meta de custo no ano corrente, avisa pela unidade", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        vi.mocked(goalService.progress).mockResolvedValue([makeProgress(2026)])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-summary")
        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))

        expect(await screen.findByTestId("goal-summary")).toHaveTextContent(
            "Nenhuma meta de custo cadastrada para 2026.",
        )
    })

    it("cria a meta de custo na unidade escolhida, com os rótulos em reais", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026)]))
        vi.mocked(goalService.create).mockResolvedValue(brl(2026))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-summary")
        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))
        await user.click(await screen.findByRole("button", { name: "Nova meta" }))
        const dialog = await screen.findByRole("dialog", { name: /nova meta de custo/i })
        // O ano 2026 já tem meta em kWh, mas não em reais: ainda é o sugerido.
        expect(within(dialog).getByLabelText("Ano da meta")).toHaveValue(2026)
        expect(within(dialog).getByText("Meta mês a mês · R$")).toBeInTheDocument()

        await user.type(within(dialog).getByLabelText("Custo mensal alvo · R$"), "500")
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))

        await waitFor(() =>
            expect(goalService.create).toHaveBeenCalledWith({
                propertyId: "prop-a",
                year: 2026,
                unit: "BRL",
                referenceYear: 2025,
                monthlyTargets: Array.from({ length: 12 }, () => 500),
                alertPercent: 85,
            }),
        )
    })

    it("o ano já usado numa unidade não bloqueia a outra", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([makeGoal(2026), brl(2026)]))
        vi.mocked(goalService.progress).mockResolvedValue([makeProgress(2026), brlProgress(2026)])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await user.click(await screen.findByRole("button", { name: "Nova meta" }))

        // Em kWh, 2026 já existe: sugere 2027.
        expect(await screen.findByLabelText("Ano da meta")).toHaveValue(2027)
    })

    it("usar como referência mantém a unidade e traz o custo realizado", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([brl(2025)]))
        vi.mocked(goalService.progress).mockResolvedValue([
            brlProgress(2025, {
                situation: "MET",
                months: Array.from({ length: 12 }, (_, i) => ({
                    month: i + 1,
                    target: 400,
                    realized: 380.4,
                })),
            }),
        ])
        vi.mocked(goalService.create).mockResolvedValue(brl(2027))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-summary")
        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))
        await user.click(
            await screen.findByRole("button", { name: "Usar a meta de 2025 como referência" }),
        )
        const dialog = await screen.findByRole("dialog", { name: /nova meta de custo/i })

        expect(within(dialog).getByLabelText("jan")).toHaveValue(380)
        await user.click(within(dialog).getByRole("button", { name: "Salvar meta" }))
        await waitFor(() =>
            expect(goalService.create).toHaveBeenCalledWith(
                expect.objectContaining({ unit: "BRL", year: 2027, referenceYear: 2025 }),
            ),
        )
    })

    it("edita a meta de custo com o título e a unidade dela", async () => {
        vi.mocked(goalService.list).mockResolvedValue(paged([brl(2026)]))
        vi.mocked(goalService.progress).mockResolvedValue([brlProgress(2026)])
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderPage()

        await screen.findByTestId("goal-summary")
        await user.click(screen.getByRole("tab", { name: "Custo (R$)" }))
        await user.click(await screen.findByRole("button", { name: "Editar meta de 2026" }))

        const dialog = await screen.findByRole("dialog", { name: /editar meta de custo/i })
        expect(within(dialog).getByLabelText("Custo mensal alvo · R$")).toBeInTheDocument()
        expect(within(dialog).getByLabelText("Ano da meta")).toBeDisabled()
    })
})
