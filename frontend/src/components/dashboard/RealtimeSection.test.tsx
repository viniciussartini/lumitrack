import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import { useRealtime } from "@/contexts/RealtimeContext"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import type { ConsumptionBucket } from "@/types/consumption.types"
import type { ReadingPayload } from "@/lib/sse/appStream"

vi.mock("@/services/meter.service", () => ({
    meterService: {
        byTarget: vi.fn(),
        list: vi.fn(),
        getById: vi.fn(),
    },
}))

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        list: vi.fn(),
    },
}))

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtime: vi.fn(() => ({ readingsByMeterId: {} })),
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

const paginatedConsumption = (
    items: ConsumptionBucket[],
): Paginated<ConsumptionBucket> & { granularity: "hour" } => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 3,
    granularity: "hour",
})

const mockReading = (powerW: number, receivedAt = new Date().toISOString()): ReadingPayload => ({
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW,
    powerFactor: 0.98,
    receivedAt,
})

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderSection = (propertyId = "prop-1") => {
    const queryClient = createTestQueryClient()
    return render(<RealtimeSection propertyId={propertyId} />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>{children}</MemoryRouter>
            </QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRealtime).mockReturnValue({ readingsByMeterId: {} })
    vi.mocked(consumptionService.list).mockResolvedValue(paginatedConsumption([]))
})

describe("RealtimeSection — sem medidor", () => {
    it("mostra estado vazio com link pra propriedade quando não há medidor vinculado", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)

        renderSection()

        expect(
            await screen.findByText(/não tem medidor vinculado/i),
        ).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /ver propriedade/i })).toHaveAttribute(
            "href",
            "/propriedades/prop-1",
        )
    })
})

describe("RealtimeSection — com medidor", () => {
    it("mostra '—' quando ainda não chegou nenhuma leitura", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)

        renderSection()

        expect(await screen.findByTestId("realtime-power-chart-empty")).toBeInTheDocument()
        const dashes = screen.getAllByText("—")
        expect(dashes.length).toBeGreaterThanOrEqual(2) // Potência agora + Custo estimado
    })

    it("atualiza o KPI 'Potência agora' quando uma leitura chega", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtime).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1500) },
        })

        renderSection()

        expect(await screen.findByText("1,50kW")).toBeInTheDocument()
    })

    it("calcula o custo estimado a partir do bucket de consumo mais recente", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtime).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1000) }, // 1 kW
        })
        vi.mocked(consumptionService.list).mockResolvedValue(
            paginatedConsumption([
                {
                    bucketStart: new Date().toISOString(),
                    kwhConsumed: 2,
                    costBrl: 1, // tarifa efetiva R$0,50/kWh
                    avgPowerW: 1000,
                },
            ]),
        )

        renderSection()

        // 1 kW × R$0,50/kWh = R$0,50/h
        expect(await screen.findByText(/≈ R\$\s?0,50\/h/)).toBeInTheDocument()
    })

    it("troca a janela do gráfico via toggle", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtime).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1000) },
        })

        renderSection()
        await screen.findByTestId("realtime-power-chart")

        const btn24h = screen.getByTestId("realtime-window-24h")
        expect(btn24h).toHaveAttribute("aria-selected", "false")

        const user = userEvent.setup()
        await user.click(btn24h)

        await waitFor(() => {
            expect(btn24h).toHaveAttribute("aria-selected", "true")
        })
    })
})
