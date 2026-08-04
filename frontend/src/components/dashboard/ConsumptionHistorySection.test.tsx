import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { ConsumptionHistorySection } from "@/components/dashboard/ConsumptionHistorySection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import type { ConsumptionBucket, Granularity } from "@/types/consumption.types"

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

const paginated = (items: ConsumptionBucket[]): Paginated<ConsumptionBucket> & { granularity: Granularity } => ({
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
