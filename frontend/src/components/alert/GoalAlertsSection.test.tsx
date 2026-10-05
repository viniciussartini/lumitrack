import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { GoalAlertsSection } from "@/components/alert/GoalAlertsSection"
import { goalService } from "@/services/goal.service"
import type { GoalAlert } from "@/types/goal.types"

vi.mock("@/services/goal.service", () => ({
    goalService: { alerts: vi.fn() },
}))

const makeAlert = (override: Partial<GoalAlert> = {}): GoalAlert => ({
    goalId: "goal-1",
    propertyId: "prop-1",
    propertyName: "Casa",
    year: 2026,
    alertPercent: 85,
    monthly: { percent: 60, reached: false, notified: false },
    annual: { percent: 42.5, reached: false, notified: false },
    ...override,
})

const renderSection = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <GoalAlertsSection />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("GoalAlertsSection", () => {
    it("mostra o carregamento", () => {
        vi.mocked(goalService.alerts).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(screen.getByRole("status")).toHaveTextContent("Carregando...")
    })

    it("mostra erro quando o estado dos alertas falha", async () => {
        vi.mocked(goalService.alerts).mockRejectedValue(new Error("falha"))
        renderSection()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar os alertas de meta.",
        )
    })

    it("sem metas no ano corrente, avisa e leva às metas", async () => {
        vi.mocked(goalService.alerts).mockResolvedValue([])
        renderSection()

        expect(await screen.findByTestId("goal-alerts-empty")).toHaveTextContent(
            "Nenhuma meta cadastrada para o ano corrente.",
        )
        expect(screen.getByRole("link", { name: "Ir para as metas" })).toHaveAttribute(
            "href",
            "/configuracoes/metas",
        )
    })

    it("mostra a meta, o percentual de alerta e os percentuais do mês e do ano", async () => {
        vi.mocked(goalService.alerts).mockResolvedValue([makeAlert()])
        renderSection()

        const row = await screen.findByTestId("goal-alert-row-goal-1")
        expect(row).toHaveTextContent("Casa · 2026")
        expect(row).toHaveTextContent("85%")
        expect(row).toHaveTextContent("60,0%")
        expect(row).toHaveTextContent("42,5%")
        expect(within(row).getAllByText("Dentro da meta")).toHaveLength(2)
    })

    it("distingue notificado, atingido e dentro da meta em cada período", async () => {
        vi.mocked(goalService.alerts).mockResolvedValue([
            makeAlert({
                monthly: { percent: 91.25, reached: true, notified: true },
                annual: { percent: 88, reached: true, notified: false },
            }),
        ])
        renderSection()

        const row = await screen.findByTestId("goal-alert-row-goal-1")
        const [monthCell, yearCell] = Array.from(row.querySelectorAll("td")).slice(2)
        expect(monthCell).toHaveTextContent("91,3%")
        expect(monthCell).toHaveTextContent("Notificado")
        expect(yearCell).toHaveTextContent("88,0%")
        expect(yearCell).toHaveTextContent("Atingido")
    })

    it('período sem leitura mostra "-" e nenhuma etiqueta', async () => {
        vi.mocked(goalService.alerts).mockResolvedValue([
            makeAlert({
                monthly: { percent: null, reached: false, notified: false },
                annual: { percent: null, reached: false, notified: false },
            }),
        ])
        renderSection()

        const row = await screen.findByTestId("goal-alert-row-goal-1")
        const [monthCell, yearCell] = Array.from(row.querySelectorAll("td")).slice(2)
        expect(monthCell).toHaveTextContent("-")
        expect(yearCell).toHaveTextContent("-")
        expect(
            within(row).queryByText(/Notificado|Atingido|Dentro da meta/),
        ).not.toBeInTheDocument()
    })

    it("lista uma linha por meta, de propriedades diferentes", async () => {
        vi.mocked(goalService.alerts).mockResolvedValue([
            makeAlert(),
            makeAlert({ goalId: "goal-2", propertyId: "prop-2", propertyName: "Sítio" }),
        ])
        renderSection()

        expect(await screen.findByTestId("goal-alert-row-goal-1")).toBeInTheDocument()
        expect(screen.getByTestId("goal-alert-row-goal-2")).toHaveTextContent("Sítio · 2026")
    })
})
