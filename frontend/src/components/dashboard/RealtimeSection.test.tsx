import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import { meterReadingService } from "@/services/meterReading.service"
import { tariffFlagService } from "@/services/tariff-flag.service"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import type { Granularity } from "@/types/consumption.types"
import type { ReadingPayload } from "@/lib/sse/appStream"

// Deep dive nos KPIs/bandeira: DashboardKpiRow.test.tsx e
// TariffFlagListCard.test.tsx. Deep dive no gráfico em si:
// RealtimeChartCard.test.tsx. Aqui só a orquestração (gate de medidor,
// composição dos filhos).

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

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { list: vi.fn() },
}))

vi.mock("@/services/tariff-flag.service", () => ({
    tariffFlagService: { get: vi.fn() },
}))

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtimeReadings: vi.fn(() => ({ readingsByMeterId: {} })),
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

const paginatedConsumption = (): Paginated<never> & { granularity: Granularity } => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 3,
    granularity: "hour",
})

const mockReading = (powerW: number): ReadingPayload => ({
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW,
    powerFactor: 0.98,
    receivedAt: new Date().toISOString(),
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
    return render(<RealtimeSection propertyId={propertyId} propertyName={propertyName} />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>{children}</MemoryRouter>
            </QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRealtimeReadings).mockReturnValue({ readingsByMeterId: {} })
    vi.mocked(consumptionService.list).mockResolvedValue(paginatedConsumption())
    vi.mocked(meterReadingService.list).mockResolvedValue({ items: [], granularity: "minute" })
    vi.mocked(tariffFlagService.get).mockReturnValue(new Promise(() => {})) // não resolve — não é o foco destes testes
})

describe("RealtimeSection — sem medidor", () => {
    it("mostra estado vazio com link pra propriedade quando não há medidor vinculado", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)

        renderSection()

        expect(await screen.findByText(/não tem medidor vinculado/i)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /ver propriedade/i })).toHaveAttribute(
            "href",
            "/propriedades/prop-1",
        )
    })
})

describe("RealtimeSection — carregando/erro do medidor", () => {
    it("mostra skeleton enquanto o medidor carrega", () => {
        vi.mocked(meterService.byTarget).mockReturnValue(new Promise(() => {}))

        renderSection()

        expect(screen.getByLabelText(/carregando painel em tempo real/i)).toBeInTheDocument()
    })

    it("mostra alerta quando falha ao carregar o medidor", async () => {
        vi.mocked(meterService.byTarget).mockRejectedValue(new Error("Falha de rede"))

        renderSection()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText("Falha de rede")).toBeInTheDocument()
    })
})

describe("RealtimeSection — com medidor", () => {
    it("renderiza os KPIs, o card de bandeiras e o gráfico de tempo real", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)

        renderSection()

        expect(await screen.findByText("Potência agora")).toBeInTheDocument()
        expect(screen.getByText("Consumo hoje")).toBeInTheDocument()
        expect(screen.getByText("Custo projetado · mês")).toBeInTheDocument()
        expect(screen.getByText("Bandeira vigente")).toBeInTheDocument()
        expect(screen.getByTestId("tariff-flag-list-card")).toBeInTheDocument()
        expect(screen.getByText("Consumo em tempo real")).toBeInTheDocument()
        expect(screen.getByText(/Casa · última hora/)).toBeInTheDocument()
        expect(meterReadingService.list).toHaveBeenCalledWith(
            expect.objectContaining({ targetType: "PROPERTY", targetId: "prop-1" }),
        )
    })

    it("mostra o KPI 'Potência agora' quando uma leitura chega", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtimeReadings).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1500) },
        })

        renderSection()

        expect(await screen.findByText("1,50kW")).toBeInTheDocument()
    })

    it("não mostra o toggle de janela — só resta a última hora", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)

        renderSection()
        await screen.findByText("Consumo em tempo real")

        expect(screen.queryByTestId("realtime-window-toggle")).not.toBeInTheDocument()
        expect(screen.queryByTestId("realtime-window-24h")).not.toBeInTheDocument()
        expect(screen.getByText(/Casa · última hora/)).toBeInTheDocument()
        await waitFor(() => {
            expect(meterReadingService.list).toHaveBeenCalledWith(
                expect.objectContaining({ granularity: "minute" }),
            )
        })
    })
})
