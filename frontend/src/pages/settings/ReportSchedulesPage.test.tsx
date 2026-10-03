import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { ReportSchedulesPage } from "@/pages/settings/ReportSchedulesPage"
import { propertyService } from "@/services/property.service"
import { reportScheduleService } from "@/services/report-schedule.service"
import type { PropertyTree } from "@/types/property.types"
import type { ReportSchedule } from "@/types/report.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

vi.mock("@/services/report-schedule.service", () => ({
    reportScheduleService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const TREE: PropertyTree = {
    total: 1,
    items: [
        {
            id: "prop-1",
            name: "Casa Principal",
            tariffGroup: "GROUP_B",
            areas: [{ id: "area-1", name: "Sala", devices: [] }],
        },
    ],
}

const makeSchedule = (overrides: Partial<ReportSchedule> = {}): ReportSchedule => ({
    id: "sch-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 5,
    recipients: ["financeiro@example.com"],
    active: true,
    nextRunAt: "2026-08-05T09:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
})

const paged = (items: ReportSchedule[], total = items.length, page = 1) => ({
    items,
    total,
    page,
    pageSize: 10,
})

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <ReportSchedulesPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
    vi.mocked(reportScheduleService.list).mockResolvedValue(paged([]))
})

describe("ReportSchedulesPage — estados da página", () => {
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

    it("sem propriedades: orienta a cadastrar", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ total: 0, items: [] })
        renderPage()

        expect(await screen.findByText("Nada para agendar ainda")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Ir para o cadastro" })).toHaveAttribute(
            "href",
            "/configuracoes/cadastro",
        )
    })
})

describe("ReportSchedulesPage — formulário de criação", () => {
    it("abre com o relatório mensal, a frequência mensal travada e o envio desativado até ter destinatário", async () => {
        renderPage()

        const scope = await screen.findByLabelText("Escopo")
        expect(
            within(scope).getByRole("option", { name: "Casa Principal · Sala" }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText("Tipo de relatório")).toHaveValue("MONTHLY")
        expect(screen.getByLabelText("Frequência")).toBeDisabled()
        expect(screen.getByLabelText("Frequência")).toHaveValue("MONTHLY")
        expect(screen.getByLabelText("Dia do envio")).toHaveValue(1)
        expect(screen.getByRole("button", { name: "Salvar configuração" })).toBeDisabled()
        expect(await screen.findByTestId("report-schedule-empty")).toBeInTheDocument()
    })

    it("o dia muda de natureza conforme a frequência", async () => {
        const user = userEvent.setup()
        renderPage()

        await user.selectOptions(await screen.findByLabelText("Tipo de relatório"), "CONSUMPTION")
        const frequency = screen.getByLabelText("Frequência")
        expect(frequency).toBeEnabled()

        await user.selectOptions(frequency, "WEEKLY")
        const weekday = screen.getByLabelText("Dia do envio")
        expect(within(weekday).getByRole("option", { name: "Domingo" })).toBeInTheDocument()

        await user.selectOptions(frequency, "DAILY")
        expect(screen.queryByLabelText("Dia do envio")).not.toBeInTheDocument()
        expect(screen.getByText("Todo dia, às 06:00.")).toBeInTheDocument()

        await user.selectOptions(frequency, "ANNUAL")
        expect(screen.getByLabelText("Dia do envio")).toHaveValue(1)
    })

    it("escolher de novo o relatório mensal volta a fixar a frequência", async () => {
        const user = userEvent.setup()
        renderPage()

        const type = await screen.findByLabelText("Tipo de relatório")
        await user.selectOptions(type, "CONSUMPTION")
        await user.selectOptions(screen.getByLabelText("Frequência"), "DAILY")
        await user.selectOptions(type, "MONTHLY")

        expect(screen.getByLabelText("Frequência")).toHaveValue("MONTHLY")
        expect(screen.getByLabelText("Frequência")).toBeDisabled()
    })

    it("valida destinatário e dia antes de enviar", async () => {
        const user = userEvent.setup()
        renderPage()
        const submit = await screen.findByRole("button", { name: "Salvar configuração" })

        await user.type(screen.getByLabelText("Destinatários"), "sem-arroba")
        expect(await screen.findByRole("alert")).toHaveTextContent("E-mail inválido: sem-arroba")
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText("Destinatários"))
        await user.type(screen.getByLabelText("Destinatários"), "ok@example.com")
        await user.clear(screen.getByLabelText("Dia do envio"))
        await user.type(screen.getByLabelText("Dia do envio"), "32")
        expect(await screen.findByRole("alert")).toHaveTextContent("entre 1 e 31")
        expect(submit).toBeDisabled()
    })

    it("cria a configuração com o corpo montado do formulário", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.create).mockResolvedValue(makeSchedule())
        renderPage()

        await user.type(
            await screen.findByLabelText("Destinatários"),
            "Financeiro@Example.com; ceo@example.com",
        )
        await user.clear(screen.getByLabelText("Dia do envio"))
        await user.type(screen.getByLabelText("Dia do envio"), "15")
        await user.click(screen.getByRole("button", { name: "CSV" }))
        await user.click(screen.getByRole("button", { name: "Desativada" }))
        await user.click(screen.getByRole("button", { name: "Salvar configuração" }))

        await waitFor(() =>
            expect(reportScheduleService.create).toHaveBeenCalledWith({
                targetType: "PROPERTY",
                targetId: "prop-1",
                type: "MONTHLY",
                format: "CSV",
                frequency: "MONTHLY",
                sendDay: 15,
                recipients: ["financeiro@example.com", "ceo@example.com"],
                active: false,
            }),
        )
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Configuração salva"))
    })

    it("avisa quando a criação falha", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.create).mockRejectedValue(new Error("Limite atingido"))
        renderPage()

        await user.type(await screen.findByLabelText("Destinatários"), "a@example.com")
        await user.click(screen.getByRole("button", { name: "Salvar configuração" }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível salvar a configuração", {
                description: "Limite atingido",
            }),
        )
    })
})

describe("ReportSchedulesPage — lista", () => {
    it("mostra título, periodicidade, formato, destinatários, situação e próximo envio", async () => {
        vi.mocked(reportScheduleService.list).mockResolvedValue(
            paged([
                makeSchedule(),
                makeSchedule({
                    id: "sch-2",
                    active: false,
                    nextRunAt: null,
                    frequency: "DAILY",
                    sendDay: null,
                }),
            ]),
        )
        renderPage()

        const list = await screen.findByTestId("report-schedule-list")
        expect(await within(list).findAllByText("Consumo · Casa Principal")).toHaveLength(2)
        expect(
            within(list).getByText("Mensal · dia 5 · PDF · financeiro@example.com"),
        ).toBeInTheDocument()
        expect(within(list).getByText("Próximo envio: 05/08/2026 às 06:00")).toBeInTheDocument()
        expect(within(list).getByText("Ativa")).toBeInTheDocument()
        expect(within(list).getByText("Pausada")).toBeInTheDocument()
        // Só a configuração ativa tem próximo envio.
        expect(within(list).getAllByText(/Próximo envio/)).toHaveLength(1)
    })

    it("mostra erro quando a listagem falha", async () => {
        vi.mocked(reportScheduleService.list).mockRejectedValue(new Error("falhou"))
        renderPage()

        expect(
            await screen.findByText("Não foi possível carregar as configurações."),
        ).toBeInTheDocument()
    })

    it("edita numa janela preenchida com a configuração e salva o corpo completo", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.list).mockResolvedValue(paged([makeSchedule()]))
        vi.mocked(reportScheduleService.update).mockResolvedValue(makeSchedule())
        renderPage()

        await user.click(await screen.findByRole("button", { name: /^Editar/ }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByLabelText("Destinatários")).toHaveValue("financeiro@example.com")
        expect(within(dialog).getByLabelText("Tipo de relatório")).toHaveValue("CONSUMPTION")

        await user.selectOptions(within(dialog).getByLabelText("Frequência"), "WEEKLY")
        await user.selectOptions(within(dialog).getByLabelText("Dia do envio"), "3")
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }))

        await waitFor(() =>
            expect(reportScheduleService.update).toHaveBeenCalledWith("sch-1", {
                targetType: "PROPERTY",
                targetId: "prop-1",
                type: "CONSUMPTION",
                format: "PDF",
                frequency: "WEEKLY",
                sendDay: 3,
                recipients: ["financeiro@example.com"],
                active: true,
            }),
        )
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("cancelar a edição não salva", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.list).mockResolvedValue(paged([makeSchedule()]))
        renderPage()

        await user.click(await screen.findByRole("button", { name: /^Editar/ }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }),
        )

        expect(reportScheduleService.update).not.toHaveBeenCalled()
    })

    it("pede confirmação antes de excluir e só então remove", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.list).mockResolvedValue(paged([makeSchedule()]))
        vi.mocked(reportScheduleService.remove).mockResolvedValue(undefined)
        renderPage()

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        expect(reportScheduleService.remove).not.toHaveBeenCalled()
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() => expect(reportScheduleService.remove).toHaveBeenCalledWith("sch-1"))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Configuração excluída"))
    })

    it("avisa quando a exclusão falha", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.list).mockResolvedValue(paged([makeSchedule()]))
        vi.mocked(reportScheduleService.remove).mockRejectedValue(new Error("offline"))
        renderPage()

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível excluir a configuração", {
                description: "offline",
            }),
        )
    })

    it("volta uma página ao excluir o último item da última", async () => {
        const user = userEvent.setup()
        vi.mocked(reportScheduleService.list).mockImplementation(async ({ page = 1 }) =>
            page === 1
                ? paged([makeSchedule({ id: "sch-1" })], 11, 1)
                : paged([makeSchedule({ id: "sch-11" })], 11, 2),
        )
        vi.mocked(reportScheduleService.remove).mockResolvedValue(undefined)
        renderPage()

        await screen.findByTestId("pagination")
        await user.click(screen.getByRole("button", { name: /próxima/i }))
        await waitFor(() =>
            expect(reportScheduleService.list).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }),
        )
        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() => expect(reportScheduleService.remove).toHaveBeenCalledWith("sch-11"))
        await waitFor(() =>
            expect(reportScheduleService.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }),
        )
    })
})

describe("ReportSchedulesPage — tipos de relatório", () => {
    const groupA = (): PropertyTree => ({
        total: 1,
        items: [{ ...TREE.items[0]!, tariffGroup: "GROUP_A" }],
    })

    it("a demanda só é oferecida para propriedade do Grupo A e trava a frequência mensal", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(groupA())
        renderPage()

        const type = await screen.findByLabelText("Tipo de relatório")
        await user.selectOptions(type, "ALERTS")
        await user.selectOptions(screen.getByLabelText("Frequência"), "WEEKLY")
        expect(screen.getByLabelText("Frequência")).toBeEnabled()

        await user.selectOptions(type, "DEMAND")
        expect(screen.getByLabelText("Frequência")).toBeDisabled()
        expect(screen.getByLabelText("Frequência")).toHaveValue("MONTHLY")
    })

    it("propriedade do Grupo B não oferece a demanda", async () => {
        renderPage()

        const type = await screen.findByLabelText("Tipo de relatório")
        const options = within(type)
            .getAllByRole("option")
            .map((option) => option.textContent)
        expect(options).toEqual(["Mensal", "Consumo", "Alertas", "Qualidade de energia"])
    })
})
