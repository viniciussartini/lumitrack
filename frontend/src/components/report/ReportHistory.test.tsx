import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { ReportHistory } from "@/components/report/ReportHistory"
import { reportService } from "@/services/report.service"
import { downloadFile } from "@/lib/download/downloadFile"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import type { Report } from "@/types/report.types"

vi.mock("@/services/report.service", () => ({
    reportService: { list: vi.fn(), remove: vi.fn(), download: vi.fn(), create: vi.fn() },
}))

vi.mock("@/lib/download/downloadFile", () => ({ downloadFile: vi.fn() }))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const GROUPS: CompareTargetGroup[] = [
    {
        label: "Propriedades",
        options: [
            { key: "PROPERTY:prop-1", targetType: "PROPERTY", targetId: "prop-1", label: "Casa" },
        ],
    },
]

const makeReport = (overrides: Partial<Report> = {}): Report => ({
    id: "rep-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "MONTHLY",
    format: "PDF",
    origin: "MANUAL",
    periodStart: "2026-07-01T03:00:00.000Z",
    periodEnd: "2026-08-01T03:00:00.000Z",
    fileName: "lumitrack-relatorio-monthly-2026-07.pdf",
    sizeBytes: 100,
    createdAt: "2026-08-01T12:30:00.000Z",
    ...overrides,
})

const page = (items: Report[], total = items.length, pageNumber = 1) => ({
    items,
    total,
    page: pageNumber,
    pageSize: 10,
})

const renderHistory = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <ReportHistory groups={GROUPS} />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ReportHistory", () => {
    it("mostra o carregamento, depois as linhas com título, origem e data", async () => {
        vi.mocked(reportService.list).mockResolvedValue(
            page([makeReport(), makeReport({ id: "rep-2", origin: "SCHEDULED", format: "CSV" })]),
        )
        renderHistory()

        expect(screen.getByRole("status")).toHaveTextContent("Carregando...")
        expect(await screen.findAllByText("Mensal · Casa · julho de 2026")).toHaveLength(2)
        expect(screen.getByText("Geração manual · PDF")).toBeInTheDocument()
        expect(screen.getByText("Envio agendado · CSV")).toBeInTheDocument()
    })

    it("sem relatórios, mostra o texto vazio", async () => {
        vi.mocked(reportService.list).mockResolvedValue(page([]))
        renderHistory()

        expect(await screen.findByTestId("report-history-empty")).toHaveTextContent(
            "Nenhum relatório gerado até agora.",
        )
    })

    it("mostra erro quando a listagem falha", async () => {
        vi.mocked(reportService.list).mockRejectedValue(new Error("falhou"))
        renderHistory()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar o histórico de relatórios.",
        )
    })

    it("baixa o arquivo da linha escolhida", async () => {
        const user = userEvent.setup()
        const blob = new Blob(["%PDF"], { type: "application/pdf" })
        vi.mocked(reportService.list).mockResolvedValue(page([makeReport()]))
        vi.mocked(reportService.download).mockResolvedValue({ fileName: "x.pdf", blob })
        renderHistory()

        await user.click(await screen.findByRole("button", { name: /^Baixar/ }))

        await waitFor(() =>
            expect(reportService.download).toHaveBeenCalledWith(
                expect.objectContaining({ id: "rep-1" }),
            ),
        )
        await waitFor(() =>
            expect(downloadFile).toHaveBeenCalledWith("x.pdf", "application/pdf", blob),
        )
    })

    it("pede confirmação antes de excluir e só então remove", async () => {
        const user = userEvent.setup()
        vi.mocked(reportService.list).mockResolvedValue(page([makeReport()]))
        vi.mocked(reportService.remove).mockResolvedValue(undefined)
        renderHistory()

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        expect(reportService.remove).not.toHaveBeenCalled()

        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(reportService.remove).toHaveBeenCalledWith("rep-1"))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Relatório excluído"))
    })

    it("cancelar a confirmação não exclui", async () => {
        const user = userEvent.setup()
        vi.mocked(reportService.list).mockResolvedValue(page([makeReport()]))
        renderHistory()

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        const dialog = await screen.findByRole("dialog")
        await user.click(within(dialog).getByRole("button", { name: "Cancelar" }))

        expect(reportService.remove).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("avisa quando a exclusão falha", async () => {
        const user = userEvent.setup()
        vi.mocked(reportService.list).mockResolvedValue(page([makeReport()]))
        vi.mocked(reportService.remove).mockRejectedValue(new Error("offline"))
        renderHistory()

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("Não foi possível excluir o relatório", {
                description: "offline",
            }),
        )
    })

    it("navega entre páginas e volta uma página ao excluir o último item da última", async () => {
        const user = userEvent.setup()
        vi.mocked(reportService.list).mockImplementation(async ({ page: pageNumber = 1 }) =>
            pageNumber === 1
                ? page([makeReport({ id: "rep-1" })], 11, 1)
                : page([makeReport({ id: "rep-11" })], 11, 2),
        )
        vi.mocked(reportService.remove).mockResolvedValue(undefined)
        renderHistory()

        await screen.findByTestId("pagination")
        await user.click(screen.getByRole("button", { name: /próxima/i }))
        await waitFor(() =>
            expect(reportService.list).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }),
        )

        await user.click(await screen.findByRole("button", { name: /^Excluir/ }))
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", { name: "Excluir" }),
        )

        await waitFor(() => expect(reportService.remove).toHaveBeenCalledWith("rep-11"))
        await waitFor(() =>
            expect(reportService.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }),
        )
    })
})
