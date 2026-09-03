import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
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
    // Hora fixa (19h) em vez do relógio real: os testes precisam de uma hora
    // anterior disponível (falha silenciosa entre 00:00-00:59 com o relógio
    // real, já que não haveria "hora anterior" a escolher).
    const NOW = new Date(2026, 7, 21, 19, 45, 30)

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("aparece só na aba Hora (padrão), some nas demais", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderSection()

        expect(await screen.findByTestId("hour-window-select")).toBeInTheDocument()

        await user.click(screen.getByTestId("granularity-tab-day"))

        expect(screen.queryByTestId("hour-window-select")).not.toBeInTheDocument()
    })

    it("escolher outra hora muda a legenda e a janela consultada na API", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderSection()
        await screen.findByTestId("hour-window-select")
        vi.mocked(consumptionService.list).mockClear()

        await user.selectOptions(screen.getByTestId("hour-window-select"), "18h - 19h")

        expect(
            await screen.findByText("Consumo de 18h às 19h, minuto a minuto"),
        ).toBeInTheDocument()
        const calledWith = vi.mocked(consumptionService.list).mock.calls.at(-1)![0]
        expect(calledWith.from?.getHours()).toBe(18)
        expect(calledWith.to?.getHours()).toBe(19)
    })

    it("voltar pra aba Hora depois de Dia reseta o seletor pra hora corrente", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        renderSection()
        await screen.findByTestId("hour-window-select")

        await user.selectOptions(screen.getByTestId("hour-window-select"), "0h - 1h")
        await user.click(screen.getByTestId("granularity-tab-day"))
        await user.click(screen.getByTestId("granularity-tab-hour"))

        expect(await screen.findByTestId("hour-window-select")).toHaveValue("19")
    })

    it("hora selecionada além da nova hora corrente (virada de dia, sem trocar de aba) é clampada, sem <select> em branco", async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        const { rerender } = renderSection()
        await screen.findByTestId("hour-window-select")

        await user.selectOptions(screen.getByTestId("hour-window-select"), "19h - 20h")

        // Virada de dia com a aba "Hora" ainda ativa, sem o usuário trocar de
        // aba: currentHour cai de 19 pra 0 na próxima renderização, ficando
        // menor que o selectedHour (19) guardado no estado. `rerender` força
        // uma nova passagem sem depender de nenhuma interação do usuário.
        vi.setSystemTime(new Date(2026, 7, 22, 0, 5, 0))
        rerender(<ConsumptionSection targetType="PROPERTY" targetId="prop-1" />)

        expect(await screen.findByTestId("hour-window-select")).toHaveValue("0")
        expect(
            await screen.findByText("Consumo da hora corrente, minuto a minuto"),
        ).toBeInTheDocument()
    })
})
