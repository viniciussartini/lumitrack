import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { ReportsPage } from "@/pages/report/ReportsPage"
import { propertyService } from "@/services/property.service"
import { reportService } from "@/services/report.service"
import { reportScheduleService } from "@/services/report-schedule.service"
import { downloadFile } from "@/lib/download/downloadFile"
import type { PropertyTree } from "@/types/property.types"
import type { Report } from "@/types/report.types"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

vi.mock("@/services/report.service", () => ({
    reportService: { create: vi.fn(), download: vi.fn(), list: vi.fn(), remove: vi.fn() },
}))

vi.mock("@/services/report-schedule.service", () => ({
    reportScheduleService: { list: vi.fn() },
}))

vi.mock("@/lib/download/downloadFile", () => ({ downloadFile: vi.fn() }))

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

const REPORT: Report = {
    id: "rep-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "MONTHLY",
    format: "PDF",
    origin: "MANUAL",
    periodStart: "2026-07-01T03:00:00.000Z",
    periodEnd: "2026-08-01T03:00:00.000Z",
    fileName: "lumitrack-relatorio-monthly-2026-07.pdf",
    sizeBytes: 1200,
    createdAt: "2026-08-01T09:00:00.000Z",
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <ReportsPage />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reportService.list).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 })
    vi.mocked(reportScheduleService.list).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
    })
})

describe("ReportsPage", () => {
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

        expect(await screen.findByText("Nada para reportar ainda")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Ir para o cadastro" })).toHaveAttribute(
            "href",
            "/configuracoes/cadastro",
        )
    })

    it("com propriedades: escopo com os alvos da árvore e o mensal como padrão", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        renderPage()

        const scope = await screen.findByLabelText("Escopo")
        expect(within(scope).getByRole("option", { name: "Casa Principal" })).toBeInTheDocument()
        expect(
            within(scope).getByRole("option", { name: "Casa Principal · Sala" }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText("Tipo de relatório")).toHaveValue("MONTHLY")
        expect(screen.getByLabelText("Mês")).toBeInTheDocument()
        expect(screen.queryByLabelText("Início")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "PDF" })).toHaveAttribute("aria-pressed", "true")
    })

    it("gera o relatório mensal com o mês escolhido e oferece o download", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        vi.mocked(reportService.create).mockResolvedValue(REPORT)
        const blob = new Blob(["%PDF"], { type: "application/pdf" })
        vi.mocked(reportService.download).mockResolvedValue({ fileName: REPORT.fileName, blob })
        renderPage()

        await screen.findByLabelText("Escopo")
        await user.click(screen.getByRole("button", { name: "CSV" }))
        await user.click(screen.getByRole("button", { name: /Gerar relatório/i }))

        await waitFor(() => expect(reportService.create).toHaveBeenCalledTimes(1))
        expect(vi.mocked(reportService.create).mock.calls[0]![0]).toMatchObject({
            type: "MONTHLY",
            targetType: "PROPERTY",
            targetId: "prop-1",
            format: "CSV",
            month: (screen.getByLabelText("Mês") as HTMLSelectElement).value,
        })

        expect(await screen.findByTestId("report-generated")).toHaveTextContent(REPORT.fileName)
        await user.click(screen.getByRole("button", { name: "Baixar" }))

        await waitFor(() =>
            expect(downloadFile).toHaveBeenCalledWith(REPORT.fileName, "application/pdf", blob),
        )
    })

    it("consumo: pede início e fim, bloqueia período inválido e envia instantes de São Paulo", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        vi.mocked(reportService.create).mockResolvedValue({ ...REPORT, type: "CONSUMPTION" })
        renderPage()

        await user.selectOptions(await screen.findByLabelText("Tipo de relatório"), "CONSUMPTION")
        const submit = screen.getByRole("button", { name: /Gerar relatório/i })
        expect(submit).toBeDisabled()

        await user.type(screen.getByLabelText("Início"), "2026-07-07")
        await user.type(screen.getByLabelText("Fim"), "2026-07-01")
        expect(await screen.findByRole("alert")).toHaveTextContent("anterior ao início")
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText("Fim"))
        await user.type(screen.getByLabelText("Fim"), "2026-07-09")
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
        await user.click(submit)

        await waitFor(() =>
            expect(reportService.create).toHaveBeenCalledWith({
                type: "CONSUMPTION",
                targetType: "PROPERTY",
                targetId: "prop-1",
                format: "PDF",
                from: "2026-07-07T03:00:00.000Z",
                to: "2026-07-10T03:00:00.000Z",
            }),
        )
    })

    it("avisa quando a geração falha e não mostra o bloco de relatório gerado", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        vi.mocked(reportService.create).mockRejectedValue(new Error("Este alvo não possui medidor"))
        renderPage()

        await screen.findByLabelText("Escopo")
        await user.click(screen.getByRole("button", { name: /Gerar relatório/i }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível gerar o relatório", {
                description: "Este alvo não possui medidor",
            }),
        )
        expect(screen.queryByTestId("report-generated")).not.toBeInTheDocument()
    })

    it("mostra o histórico e atualiza a lista depois de gerar", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        vi.mocked(reportService.create).mockResolvedValue(REPORT)
        renderPage()

        expect(await screen.findByTestId("report-history-empty")).toBeInTheDocument()
        vi.mocked(reportService.list).mockResolvedValue({
            items: [REPORT],
            total: 1,
            page: 1,
            pageSize: 10,
        })
        await user.click(screen.getByRole("button", { name: /Gerar relatório/i }))

        expect(
            await within(screen.getByTestId("report-history")).findByText(
                "Mensal · Casa Principal · julho de 2026",
            ),
        ).toBeInTheDocument()
    })

    it("avisa quando o download falha", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        vi.mocked(reportService.create).mockResolvedValue(REPORT)
        vi.mocked(reportService.download).mockRejectedValue(new Error("offline"))
        renderPage()

        await screen.findByLabelText("Escopo")
        await user.click(screen.getByRole("button", { name: /Gerar relatório/i }))
        await user.click(await screen.findByRole("button", { name: "Baixar" }))

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível baixar o relatório", {
                description: "offline",
            }),
        )
        expect(downloadFile).not.toHaveBeenCalled()
    })
})
