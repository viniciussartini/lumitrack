import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { ConsumptionSection } from "@/components/consumption/ConsumptionSection"
import { meterService } from "@/services/meter.service"
import { consumptionService } from "@/services/consumption.service"
import type { Meter } from "@/types/meter.types"
import type { Paginated } from "@/types/pagination.types"
import {
    REPORT_GRANULARITIES,
    type ConsumptionBucket,
    type Granularity,
} from "@/types/consumption.types"

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

const renderSection = (granularities?: readonly Granularity[]) => {
    const queryClient = createTestQueryClient()
    return render(
        <ConsumptionSection
            targetType="PROPERTY"
            targetId="prop-1"
            granularities={granularities}
        />,
        {
            wrapper: ({ children }) => (
                <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            ),
        },
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
    vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))
})

describe("ConsumptionSection — título e legenda", () => {
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

    it("legenda cobre Mês e Ano — únicas granularidades extras usadas em /relatorios", async () => {
        renderSection(REPORT_GRANULARITIES)
        await screen.findByTestId("granularity-tabs")

        const user = userEvent.setup()
        await user.click(screen.getByTestId("granularity-tab-month"))
        expect(await screen.findByText("Consumo do mês corrente, dia a dia")).toBeInTheDocument()

        await user.click(screen.getByTestId("granularity-tab-year"))
        expect(await screen.findByText("Consumo do ano corrente, mês a mês")).toBeInTheDocument()
    })
})

describe("ConsumptionSection — seletor de janela de hora", () => {
    it("aparece só na aba Hora (padrão), some nas demais", async () => {
        renderSection()

        expect(await screen.findByTestId("hour-window-select")).toBeInTheDocument()

        const user = userEvent.setup()
        await user.click(screen.getByTestId("granularity-tab-day"))

        expect(screen.queryByTestId("hour-window-select")).not.toBeInTheDocument()
    })

    it("escolher outra hora muda a legenda e a janela consultada na API", async () => {
        renderSection()
        await screen.findByTestId("hour-window-select")
        vi.mocked(consumptionService.list).mockClear()

        const currentHour = new Date().getHours()
        const previousHour = currentHour > 0 ? currentHour - 1 : 0
        // Nada a testar sem uma hora anterior disponível (00h — só uma opção).
        if (previousHour === currentHour) return

        const user = userEvent.setup()
        await user.selectOptions(
            screen.getByTestId("hour-window-select"),
            `${previousHour}h - ${previousHour + 1}h`,
        )

        expect(
            await screen.findByText(
                `Consumo de ${previousHour}h às ${previousHour + 1}h, minuto a minuto`,
            ),
        ).toBeInTheDocument()
        const calledWith = vi.mocked(consumptionService.list).mock.calls.at(-1)![0]
        expect(calledWith.from?.getHours()).toBe(previousHour)
        expect(calledWith.to?.getHours()).toBe(previousHour + 1)
    })

    it("voltar pra aba Hora depois de Dia reseta o seletor pra hora corrente", async () => {
        renderSection()
        await screen.findByTestId("hour-window-select")

        const currentHour = new Date().getHours()
        if (currentHour === 0) return

        const user = userEvent.setup()
        await user.selectOptions(screen.getByTestId("hour-window-select"), `0h - 1h`)
        await user.click(screen.getByTestId("granularity-tab-day"))
        await user.click(screen.getByTestId("granularity-tab-hour"))

        expect(await screen.findByTestId("hour-window-select")).toHaveValue(String(currentHour))
    })
})
