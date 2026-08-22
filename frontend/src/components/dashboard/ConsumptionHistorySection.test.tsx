import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { ConsumptionHistorySection } from "@/components/dashboard/ConsumptionHistorySection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import { resolveMonthlyHistoryWindow } from "@/lib/consumptionWindow"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import type { BucketSize, ConsumptionBucket, Granularity } from "@/types/consumption.types"

// `ConsumptionChart` usa `ResponsiveContainer` do recharts, que não mede
// largura real em jsdom (container fica 0×0) — o SVG não renderiza nenhum
// rótulo, então testes deste arquivo não conseguem inspecionar o que o
// chart desenha. O mock expõe só o que este componente É RESPONSÁVEL por
// decidir (quais buckets, em que ordem, com que bucketSize) — a formatação
// do rótulo em si já é coberta por `lib/formatters/consumption.test.ts`, e
// o desenho do gráfico é responsabilidade do próprio `ConsumptionChart`.
vi.mock("@/components/consumption/ConsumptionChart", () => ({
    ConsumptionChart: ({
        buckets,
        bucketSize,
    }: {
        buckets: ConsumptionBucket[]
        bucketSize: BucketSize
    }) => (
        <div data-testid="consumption-chart" data-bucket-size={bucketSize}>
            {buckets.map((b) => (
                <span key={b.bucketStart} data-testid="chart-bucket">
                    {b.bucketStart}
                </span>
            ))}
        </div>
    ),
}))

vi.mock("@/services/meter.service", () => ({
    meterService: {
        byTarget: vi.fn(),
        list: vi.fn(),
        getById: vi.fn(),
    },
}))

vi.mock("@/services/consumption.service", () => ({
    consumptionService: { list: vi.fn() },
}))

const mockMeter: Meter = {
    id: "meter-1",
    name: "Medidor da entrada",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    protocol: "MQTT",
    host: "broker.local",
    port: 1883,
    topic: "lumitrack/meter-1",
    address: null,
    extra: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const bucket = (month: string, kwh: number): ConsumptionBucket => ({
    bucketStart: month,
    kwhConsumed: kwh,
    costBrl: kwh * 0.8,
    avgPowerW: 500,
})

const paginated = (
    items: ConsumptionBucket[],
): Paginated<ConsumptionBucket> & { granularity: Granularity } => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 6,
    granularity: "month",
})

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderSection = (propertyId = "prop-1", propertyName = "Casa") => {
    const queryClient = createTestQueryClient()
    return render(
        <ConsumptionHistorySection propertyId={propertyId} propertyName={propertyName} />,
        {
            wrapper: ({ children }) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            ),
        },
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("ConsumptionHistorySection — sem medidor", () => {
    it("mostra estado vazio quando a propriedade não tem medidor", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)

        renderSection()

        expect(await screen.findByText(/sem histórico para exibir/i)).toBeInTheDocument()
        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})

describe("ConsumptionHistorySection — carregando/erro", () => {
    it("mostra skeleton enquanto o consumo carrega", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockReturnValue(new Promise(() => {}))

        renderSection()

        expect(await screen.findByLabelText(/carregando histórico de consumo/i)).toBeInTheDocument()
    })

    it("mostra alerta quando falha ao carregar o consumo", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockRejectedValue(new Error("Falha de rede"))

        renderSection()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText("Falha de rede")).toBeInTheDocument()
    })
})

describe("ConsumptionHistorySection — com medidor", () => {
    it("mostra o gráfico e o subtítulo com o nome da propriedade", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(
            paginated([bucket("2026-07-01T00:00:00.000Z", 120)]),
        )

        renderSection("prop-1", "Casa")

        expect(await screen.findByTestId("consumption-chart")).toBeInTheDocument()
        expect(screen.getByText(/Casa · consumo mensal \(kWh\)/)).toBeInTheDocument()
    })

    it("busca 6 meses por padrão e troca pra 12 meses via toggle", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))

        renderSection()
        await screen.findByTestId("history-range-toggle")

        await waitFor(() => {
            expect(consumptionService.list).toHaveBeenCalledWith(
                expect.objectContaining({ granularity: "month", page: 1, pageSize: 6 }),
            )
        })

        const user = userEvent.setup()
        await user.click(screen.getByTestId("history-range-12"))

        await waitFor(() => {
            expect(consumptionService.list).toHaveBeenCalledWith(
                expect.objectContaining({ granularity: "month", page: 1, pageSize: 12 }),
            )
        })
        expect(screen.getByTestId("history-range-12")).toHaveAttribute("aria-selected", "true")
    })
})

describe("ConsumptionHistorySection — Mensal (issue #230)", () => {
    it("troca pra granularity=day, pageSize=31 e envia a janela do dia 1 até ontem, order=asc", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))

        renderSection()
        await screen.findByTestId("history-range-toggle")

        // Janela real (não mockamos o relógio — ver nota no mock de
        // ConsumptionChart acima sobre por que fake timers ficam de fora
        // deste arquivo): a matemática de `from`/`to` já está coberta,
        // fixada em datas determinísticas, em `consumptionWindow.test.ts`.
        // Aqui o que importa é que o componente REPASSA o resultado dela.
        const expectedWindow = resolveMonthlyHistoryWindow()

        const user = userEvent.setup()
        await user.click(screen.getByTestId("history-range-month"))

        await waitFor(() => {
            expect(consumptionService.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    granularity: "day",
                    page: 1,
                    pageSize: 31,
                    from: expectedWindow.from,
                    to: expectedWindow.to,
                    order: "asc",
                }),
            )
        })
        expect(screen.getByTestId("history-range-month")).toHaveAttribute("aria-selected", "true")
    })

    it("passa os buckets ao gráfico na ordem recebida da API, sem inverter (a API já devolve asc)", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(
            paginated([
                bucket("2026-08-01T00:00:00.000Z", 10),
                bucket("2026-08-02T00:00:00.000Z", 20),
            ]),
        )

        renderSection("prop-1", "Casa")
        await screen.findByTestId("history-range-toggle")

        const user = userEvent.setup()
        await user.click(screen.getByTestId("history-range-month"))

        const chart = await screen.findByTestId("consumption-chart")
        expect(chart).toHaveAttribute("data-bucket-size", "day")
        const order = (await screen.findAllByTestId("chart-bucket")).map((el) => el.textContent)
        expect(order).toEqual(["2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z"])
    })

    it("6/12 meses continuam invertendo (a API devolve desc, o gráfico lê cronológico)", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(
            paginated([
                bucket("2026-08-01T00:00:00.000Z", 10),
                bucket("2026-07-01T00:00:00.000Z", 20),
            ]),
        )

        renderSection()

        const chart = await screen.findByTestId("consumption-chart")
        expect(chart).toHaveAttribute("data-bucket-size", "month")
        const order = (await screen.findAllByTestId("chart-bucket")).map((el) => el.textContent)
        expect(order).toEqual(["2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"])
    })

    it("atualiza o subtítulo pra refletir a visão diária", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))

        renderSection("prop-1", "Casa")
        await screen.findByTestId("history-range-toggle")

        const user = userEvent.setup()
        await user.click(screen.getByTestId("history-range-month"))

        expect(
            await screen.findByText(/Casa · consumo diário do mês corrente \(kWh\)/),
        ).toBeInTheDocument()
    })

    it("janela sem dias fechados ainda (ex.: dia 1 do mês) não é tratada como erro", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))

        renderSection()
        await screen.findByTestId("history-range-toggle")

        const user = userEvent.setup()
        await user.click(screen.getByTestId("history-range-month"))

        expect(await screen.findByTestId("consumption-chart")).toBeInTheDocument()
        expect(screen.queryAllByTestId("chart-bucket")).toHaveLength(0)
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })
})
