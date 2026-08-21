import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { RealtimeChartCard } from "@/components/realtime/RealtimeChartCard"
import { meterReadingService } from "@/services/meterReading.service"

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { list: vi.fn() },
}))

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderCard = () => {
    const queryClient = createTestQueryClient()
    return render(
        <RealtimeChartCard
            targetType="AREA"
            targetId="area-1"
            meterId="meter-1"
            title="Consumo em tempo real"
            subtitle="Sala"
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
})

describe("RealtimeChartCard", () => {
    it("busca o histórico com o alvo certo e mostra o subtítulo com a janela padrão (1h)", async () => {
        vi.mocked(meterReadingService.list).mockResolvedValue({ items: [], granularity: "minute" })

        renderCard()

        await waitFor(() => {
            expect(meterReadingService.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    targetType: "AREA",
                    targetId: "area-1",
                    granularity: "minute",
                }),
            )
        })
        expect(screen.getByText("Consumo em tempo real")).toBeInTheDocument()
        expect(screen.getByText(/Sala · última hora/)).toBeInTheDocument()
    })

    it("não busca nada sem meterId (alvo ainda sem medidor confirmado)", () => {
        const queryClient = createTestQueryClient()
        render(
            <RealtimeChartCard
                targetType="AREA"
                targetId="area-1"
                meterId=""
                title="Consumo em tempo real"
                subtitle="Sala"
            />,
            {
                wrapper: ({ children }) => (
                    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
                ),
            },
        )

        expect(meterReadingService.list).not.toHaveBeenCalled()
    })

    it("com baldes retornados, renderiza o gráfico (não o estado vazio)", async () => {
        const now = new Date()
        const bucketStart = new Date(now)
        bucketStart.setMinutes(now.getMinutes() - 1, 0, 0)

        vi.mocked(meterReadingService.list).mockResolvedValue({
            items: [{ bucketStart: bucketStart.toISOString(), avgPowerW: 1500 }],
            granularity: "minute",
        })

        renderCard()

        expect(await screen.findByTestId("realtime-power-chart")).toBeInTheDocument()
    })

    it("troca pra 24h via toggle e refaz a busca com granularidade hour", async () => {
        vi.mocked(meterReadingService.list).mockResolvedValue({ items: [], granularity: "minute" })

        renderCard()
        await waitFor(() => expect(meterReadingService.list).toHaveBeenCalled())

        const user = userEvent.setup()
        await user.click(screen.getByTestId("realtime-window-24h"))

        await waitFor(() => {
            expect(meterReadingService.list).toHaveBeenCalledWith(
                expect.objectContaining({ granularity: "hour" }),
            )
        })
        expect(screen.getByText(/Sala · 24 horas/)).toBeInTheDocument()
    })
})
