import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { ReportUpcoming } from "@/components/report/ReportUpcoming"
import { reportScheduleService } from "@/services/report-schedule.service"
import type { CompareTargetGroup } from "@/lib/periodComparison"
import type { ReportSchedule } from "@/types/report.types"

vi.mock("@/services/report-schedule.service", () => ({
    reportScheduleService: { list: vi.fn() },
}))

const GROUPS: CompareTargetGroup[] = [
    {
        label: "Propriedades",
        options: [
            { key: "PROPERTY:prop-1", label: "Casa", targetType: "PROPERTY", targetId: "prop-1" },
        ],
    },
]

const schedule = (override: Partial<ReportSchedule>): ReportSchedule => ({
    id: "sch-1",
    targetType: "PROPERTY",
    targetId: "prop-1",
    type: "CONSUMPTION",
    format: "PDF",
    frequency: "MONTHLY",
    sendDay: 15,
    recipients: ["financeiro@example.com"],
    active: true,
    nextRunAt: "2026-07-15T09:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...override,
})

const respondWith = (items: ReportSchedule[]) =>
    vi.mocked(reportScheduleService.list).mockResolvedValue({
        items,
        total: items.length,
        page: 1,
        pageSize: 20,
    })

const renderBlock = () =>
    render(
        <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
            <MemoryRouter>
                <ReportUpcoming groups={GROUPS} />
            </MemoryRouter>
        </QueryClientProvider>,
    )

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"))
})

afterEach(() => {
    vi.useRealTimers()
})

describe("ReportUpcoming", () => {
    it("lista as configurações com envio nos próximos 15 dias, da mais próxima à mais distante", async () => {
        respondWith([
            schedule({ id: "b", nextRunAt: "2026-07-20T09:00:00.000Z", type: "MONTHLY" }),
            schedule({ id: "a", nextRunAt: "2026-07-12T09:00:00.000Z" }),
            schedule({ id: "c", nextRunAt: "2026-08-20T09:00:00.000Z" }),
        ])

        renderBlock()

        const rows = await screen.findAllByTestId("report-upcoming-row")
        expect(rows).toHaveLength(2)
        expect(within(rows[0]!).getByText("Consumo · Casa")).toBeInTheDocument()
        expect(
            within(rows[0]!).getByText(/Próximo envio: 12\/07\/2026 às 06:00/),
        ).toBeInTheDocument()
        expect(within(rows[1]!).getByText("Mensal · Casa")).toBeInTheDocument()
    })

    it("mostra o estado vazio quando nada está previsto", async () => {
        respondWith([
            schedule({ active: false, nextRunAt: null }),
            schedule({ id: "longe", nextRunAt: "2026-09-01T09:00:00.000Z" }),
        ])

        renderBlock()

        expect(
            await screen.findByText("Nenhum envio ativo nos próximos 15 dias."),
        ).toBeInTheDocument()
        expect(screen.queryByTestId("report-upcoming-row")).not.toBeInTheDocument()
    })

    it("avisa quando não consegue carregar", async () => {
        vi.mocked(reportScheduleService.list).mockRejectedValue(new Error("falhou"))

        renderBlock()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar os envios agendados.",
        )
    })

    it("leva a Configurações → Relatórios pelo atalho Gerenciar", async () => {
        respondWith([])

        renderBlock()

        expect(await screen.findByRole("link", { name: "Gerenciar" })).toHaveAttribute(
            "href",
            "/configuracoes/relatorios",
        )
    })
})
