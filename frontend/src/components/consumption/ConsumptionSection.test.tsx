import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { ConsumptionSection } from "@/components/consumption/ConsumptionSection"
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

const paginated = (
    items: ConsumptionBucket[],
): Paginated<ConsumptionBucket> & { granularity: Granularity } => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 30,
    granularity: "hour",
})

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderSection = () => {
    const queryClient = createTestQueryClient()
    return render(<ConsumptionSection targetType="PROPERTY" targetId="prop-1" />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
    vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))
})

describe("ConsumptionSection — título e legenda (issue #241)", () => {
    it('título passa a ser "Histórico de consumo"', async () => {
        renderSection()

        expect(await screen.findByText("Histórico de consumo")).toBeInTheDocument()
    })

    it("legenda descreve a janela da hora corrente na aba Hora (padrão)", async () => {
        renderSection()

        expect(
            await screen.findByText("Consumo da hora corrente, minuto a minuto"),
        ).toBeInTheDocument()
    })

    it("legenda muda pra descrever o dia corrente ao trocar pra aba Dia", async () => {
        renderSection()
        await screen.findByTestId("granularity-tabs")

        const user = userEvent.setup()
        await user.click(screen.getByTestId("granularity-tab-day"))

        expect(await screen.findByText("Consumo do dia corrente, hora a hora")).toBeInTheDocument()
        expect(
            screen.queryByText("Consumo da hora corrente, minuto a minuto"),
        ).not.toBeInTheDocument()
    })
})
