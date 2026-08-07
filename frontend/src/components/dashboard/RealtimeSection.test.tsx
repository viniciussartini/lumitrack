import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen, waitFor } from "@testing-library/react"
import { RealtimeSection } from "@/components/dashboard/RealtimeSection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import { tariffFlagService } from "@/services/tariff-flag.service"
import { useRealtime } from "@/contexts/RealtimeContext"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import type { Granularity } from "@/types/consumption.types"
import type { ReadingPayload } from "@/lib/sse/appStream"

// Deep dive nos KPIs/bandeira: DashboardKpiRow.test.tsx e
// TariffFlagListCard.test.tsx. Aqui só a orquestração (gate de medidor,
// composição dos filhos, toggle do gráfico).

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

vi.mock("@/services/tariff-flag.service", () => ({
    tariffFlagService: { get: vi.fn() },
}))

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtime: vi.fn(() => ({ readingsByMeterId: {}, isConnected: false })),
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
    vi.mocked(useRealtime).mockReturnValue({ readingsByMeterId: {}, isConnected: false })
    vi.mocked(consumptionService.list).mockResolvedValue(paginatedConsumption())
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
    })

    it("mostra o KPI 'Potência agora' quando uma leitura chega", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtime).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1500) },
            isConnected: false,
        })

        renderSection()

        expect(await screen.findByText("1,50kW")).toBeInTheDocument()
    })

    it("troca a janela do gráfico via toggle e atualiza o subtítulo", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtime).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1000) },
            isConnected: false,
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
        expect(screen.getByText(/Casa · 24 horas/)).toBeInTheDocument()
    })
})
