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
import type { Goal } from "@/types/goal.types"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { list: vi.fn() },
}))

vi.mock("@/services/goal.service", () => ({
    goalService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
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
    referenceYear: year - 1,
    monthlyKwh: Array.from({ length: 12 }, () => 400),
    alertPercent: 85,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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

    it("ano corrente e futuro oferecem editar e excluir; ano passado, nenhum dos dois", async () => {
        vi.mocked(goalService.list).mockResolvedValue(
            paged([makeGoal(2027), makeGoal(2026), makeGoal(2025)]),
        )
        renderPage()
        await screen.findByTestId("goal-history")

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
        expect(within(past).queryByRole("button")).not.toBeInTheDocument()
        expect(past).toHaveTextContent("-")
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
                referenceYear: 2025,
                monthlyKwh: Array.from({ length: 12 }, () => 500),
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
                monthlyKwh: Array.from({ length: 12 }, () => 400),
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
