import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { GoalSection } from "@/components/dashboard/GoalSection"
import { consumptionService } from "@/services/consumption.service"
import { goalService } from "@/services/goal.service"
import { meterService } from "@/services/meter.service"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { GoalProgress, GoalUnit } from "@/types/goal.types"
import type { Meter } from "@/types/meter.types"

vi.mock("@/services/goal.service", () => ({
    goalService: { progress: vi.fn() },
}))
vi.mock("@/services/meter.service", () => ({
    meterService: { byTarget: vi.fn() },
}))
vi.mock("@/services/consumption.service", () => ({
    consumptionService: { list: vi.fn() },
}))

// 16/10/2026 em São Paulo: 15 dias fechados num mês de 31 dias.
const NOW = new Date(2026, 9, 16, 12)

const meter = { id: "meter-1", targetType: "PROPERTY", propertyId: "prop-1" } as Meter

const progress = (unit: GoalUnit, override: Partial<GoalProgress> = {}): GoalProgress => ({
    goalId: `goal-${unit}`,
    year: 2026,
    unit,
    months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        target: 100,
        realized: i < 9 ? 100 : i === 9 ? 50 : null,
    })),
    yearTarget: 1200,
    realized: 950,
    deviationPercent: 0,
    currentMonthTarget: 300,
    situation: "IN_PROGRESS",
    ...override,
})

const day = (n: number, kwh: number, costBrl?: number): ConsumptionBucket => ({
    bucketStart: `2026-10-${String(n).padStart(2, "0")}T00:00:00.000Z`,
    kwhConsumed: kwh,
    avgPowerW: 0,
    ...(costBrl !== undefined && { costBrl }),
})

const firstFifteenDays = (kwh: number, cost?: number): ConsumptionBucket[] =>
    Array.from({ length: 15 }, (_, i) => day(i + 1, kwh, cost))

const mockConsumption = (items: ConsumptionBucket[]) =>
    vi.mocked(consumptionService.list).mockResolvedValue({
        items,
        total: items.length,
        page: 1,
        pageSize: 31,
        granularity: "day",
    })

const renderSection = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                <GoalSection propertyId="prop-1" propertyName="Casa" />
            </QueryClientProvider>
        </MemoryRouter>,
    )
}

const stat = (label: string | RegExp): HTMLElement =>
    screen.getByText(label).nextElementSibling as HTMLElement

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.mocked(meterService.byTarget).mockResolvedValue(meter)
    vi.mocked(goalService.progress).mockResolvedValue([progress("KWH"), progress("BRL")])
    mockConsumption(firstFifteenDays(10))
})

afterEach(() => {
    vi.useRealTimers()
})

describe("GoalSection — Mês em kWh", () => {
    it("mostra a meta do mês, o acumulado dos dias fechados, a projeção e a situação", async () => {
        renderSection()

        expect(await screen.findByText("Acumulado · até o dia 15")).toBeInTheDocument()
        expect(stat("Meta do mês")).toHaveTextContent("300 kWh")
        expect(stat("Acumulado · até o dia 15")).toHaveTextContent("150 kWh")
        // 150 kWh em 15 dias → 10/dia × 31 dias
        expect(stat("Projeção de fechamento")).toHaveTextContent("310 kWh")
        expect(stat("Situação")).toHaveTextContent("+3,3% vs. meta")
        expect(stat("Situação")).toHaveClass("text-status-danger")
    })

    it("pede o consumo diário dos dias fechados do mês corrente, em ordem crescente", async () => {
        renderSection()
        await screen.findByText("Acumulado · até o dia 15")

        expect(consumptionService.list).toHaveBeenCalledWith(
            expect.objectContaining({
                targetType: "PROPERTY",
                targetId: "prop-1",
                granularity: "day",
                from: new Date(2026, 9, 1),
                to: new Date(2026, 9, 16),
                order: "asc",
            }),
        )
    })

    it("projeção abaixo da meta fica em verde", async () => {
        mockConsumption(firstFifteenDays(8))
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")

        expect(stat("Situação")).toHaveTextContent("−17,3% vs. meta")
        expect(stat("Situação")).toHaveClass("text-status-success")
    })

    it("dia sem leitura é '-' na tabela e fica fora do acumulado", async () => {
        mockConsumption([day(1, 10), day(3, 10)])
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")

        expect(stat("Acumulado · até o dia 15")).toHaveTextContent("20 kWh")
        const rows = within(screen.getByRole("table", { hidden: true })).getAllByRole("row", {
            hidden: true,
        })
        // linha 0 é o cabeçalho; o dia 2 não tem leitura
        expect(within(rows[2]!).getByText("-")).toBeInTheDocument()
    })

    it("sem nenhuma leitura no mês, acumulado, projeção e situação são '-', nunca 0", async () => {
        mockConsumption([])
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")

        expect(stat("Acumulado · até o dia 15")).toHaveTextContent(/^-$/)
        expect(stat("Projeção de fechamento")).toHaveTextContent(/^-$/)
        expect(stat("Situação")).toHaveTextContent(/^-$/)
    })

    it("meta zerada: projeta, mas não há situação", async () => {
        vi.mocked(goalService.progress).mockResolvedValue([
            progress("KWH", { currentMonthTarget: 0 }),
        ])
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")

        expect(stat("Projeção de fechamento")).toHaveTextContent("310 kWh")
        expect(stat("Situação")).toHaveTextContent(/^-$/)
    })

    it("propriedade sem medidor mostra o aviso e não consulta o consumo", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)
        renderSection()

        expect(await screen.findByText(/configure um medidor/i)).toBeInTheDocument()
        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})

describe("GoalSection — Mês em R$", () => {
    it("soma o custo diário e avisa que ele não traz as cobranças fixas", async () => {
        mockConsumption(firstFifteenDays(10, 8))
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")
        await userEvent.setup().click(screen.getByTestId("goal-unit-BRL"))

        expect(stat("Acumulado · até o dia 15")).toHaveTextContent("R$ 120")
        expect(stat("Projeção de fechamento")).toHaveTextContent("R$ 248")
        expect(screen.getByTestId("goal-note")).toHaveTextContent(/sem cobranças fixas/i)
    })

    it("sem custo diário (Grupo A e Tarifa Branca) explica e mostra '-', sem 0", async () => {
        mockConsumption(firstFifteenDays(10))
        renderSection()

        await screen.findByText("Acumulado · até o dia 15")
        await userEvent.setup().click(screen.getByTestId("goal-unit-BRL"))

        expect(screen.getByTestId("goal-note")).toHaveTextContent(/custo diário não é calculado/i)
        expect(stat("Acumulado · até o dia 15")).toHaveTextContent(/^-$/)
        expect(stat("Projeção de fechamento")).toHaveTextContent(/^-$/)
    })
})

describe("GoalSection — Ano", () => {
    const openYear = async () => {
        renderSection()
        await screen.findByText("Acumulado · até o dia 15")
        await userEvent.setup().click(screen.getByTestId("goal-period-year"))
    }

    it("usa o acompanhamento da meta: acumulado dos meses com leitura e projeção pelos meses fechados", async () => {
        await openYear()

        expect(stat("Meta do ano")).toHaveTextContent("1.200 kWh")
        expect(stat("Acumulado · até out")).toHaveTextContent("950 kWh")
        // 9 meses fechados de 100 → 100/mês × 12
        expect(stat("Projeção de fechamento")).toHaveTextContent("1.200 kWh")
        expect(stat("Situação")).toHaveTextContent("+0,0% vs. meta")
    })

    it("mês sem leitura fica '-' na tabela e fora do acumulado", async () => {
        vi.mocked(goalService.progress).mockResolvedValue([
            progress("KWH", {
                months: Array.from({ length: 12 }, (_, i) => ({
                    month: i + 1,
                    target: 100,
                    realized: i === 0 ? 100 : i === 1 ? null : i === 2 ? 100 : null,
                })),
            }),
        ])
        await openYear()

        expect(stat("Acumulado · até out")).toHaveTextContent("200 kWh")
        // média dos dois meses fechados com leitura (jan e mar) × 12
        expect(stat("Projeção de fechamento")).toHaveTextContent("1.200 kWh")
    })
})

describe("GoalSection — sem meta e estados", () => {
    it("unidade sem meta mostra o vazio com o link para criá-la, sem esconder a outra", async () => {
        vi.mocked(goalService.progress).mockResolvedValue([progress("KWH")])
        renderSection()
        await screen.findByText("Acumulado · até o dia 15")
        const user = userEvent.setup()

        await user.click(screen.getByTestId("goal-unit-BRL"))

        const empty = screen.getByTestId("goal-empty")
        expect(empty).toHaveTextContent("Nenhuma meta de custo cadastrada para 2026.")
        expect(within(empty).getByRole("link", { name: "Criar meta" })).toHaveAttribute(
            "href",
            "/configuracoes/metas?propertyId=prop-1",
        )

        await user.click(screen.getByTestId("goal-unit-KWH"))
        expect(await screen.findByText("Acumulado · até o dia 15")).toBeInTheDocument()
    })

    it("meta de ano passado não vale: sem meta do ano corrente é estado vazio", async () => {
        vi.mocked(goalService.progress).mockResolvedValue([progress("KWH", { year: 2025 })])
        renderSection()

        expect(await screen.findByTestId("goal-empty")).toHaveTextContent(
            "Nenhuma meta cadastrada para 2026.",
        )
    })

    it("o link do cabeçalho leva às metas da propriedade", async () => {
        renderSection()

        expect(await screen.findByRole("link", { name: "Configurar meta" })).toHaveAttribute(
            "href",
            "/configuracoes/metas?propertyId=prop-1",
        )
    })

    it("mostra o alerta com nova tentativa quando o acompanhamento falha", async () => {
        vi.mocked(goalService.progress).mockRejectedValue(new Error("Falha de rede"))
        renderSection()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("Falha de rede")
        expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument()
    })

    it("mostra o skeleton enquanto o acompanhamento carrega", () => {
        vi.mocked(goalService.progress).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(screen.getByLabelText("Carregando meta de consumo")).toBeInTheDocument()
    })
})

describe("GoalSection — gráfico acessível", () => {
    it("o desenho fica fora da árvore de acessibilidade e a tabela sr-only traz os valores", async () => {
        renderSection()
        await screen.findByText("Acumulado · até o dia 15")

        expect(screen.getByTestId("goal-pace-chart-graphic")).toHaveAttribute("aria-hidden", "true")
        const table = screen.getByRole("table", { hidden: true })
        expect(table).toHaveClass("sr-only")
        expect(within(table).getByText("Acumulado e meta acumulada por dia do mês")).toBeTruthy()
        // dia 1: acumulado 10 kWh, meta acumulada 300/31
        const rows = within(table).getAllByRole("row", { hidden: true })
        expect(rows).toHaveLength(32)
        expect(within(rows[1]!).getAllByRole("cell", { hidden: true })[0]).toHaveTextContent(
            "10 kWh",
        )
    })
})
