import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SeriesAnalysisSection } from "@/components/analysis/SeriesAnalysisSection"
import { meterReadingService } from "@/services/meterReading.service"
import type { MeterReadingSeriesBucket } from "@/types/meterReadingSeries.types"

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { series: vi.fn() },
}))

const createTestQueryClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

const renderSection = () => {
    const queryClient = createTestQueryClient()
    return render(
        <QueryClientProvider client={queryClient}>
            <SeriesAnalysisSection
                targetType="PROPERTY"
                targetId="prop-1"
                targetName="Casa Principal"
            />
        </QueryClientProvider>,
    )
}

const submitDiaForm = async () => {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Dia"), "2026-01-15")
    await user.click(screen.getByRole("button", { name: /Gerar análise/i }))
}

const DIA_ITEMS: MeterReadingSeriesBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    bucketStart: `2026-01-15T${String(hour).padStart(2, "0")}:00:00.000Z`,
    min: 218 + hour,
    avg: 220 + hour,
    max: 222 + hour,
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe("SeriesAnalysisSection", () => {
    it("mostra o estado inicial 'Defina os parâmetros e clique em Gerar análise' antes do primeiro submit", () => {
        renderSection()

        expect(screen.getByTestId("series-analysis-idle")).toHaveTextContent(
            "Defina os parâmetros e clique em Gerar análise.",
        )
        expect(meterReadingService.series).not.toHaveBeenCalled()
    })

    it("ao submeter, chama o endpoint da série com os parâmetros do formulário e mostra os resultados", async () => {
        vi.mocked(meterReadingService.series).mockResolvedValue({
            items: DIA_ITEMS,
            metric: "tensao",
            window: "dia",
        })

        renderSection()
        await submitDiaForm()

        await waitFor(() => {
            expect(meterReadingService.series).toHaveBeenCalledWith(
                expect.objectContaining({
                    targetType: "PROPERTY",
                    targetId: "prop-1",
                    metric: "tensao",
                    window: "dia",
                    day: "2026-01-15",
                }),
            )
        })

        expect(await screen.findByTestId("series-analysis-table")).toBeInTheDocument()
        expect(screen.queryByTestId("series-analysis-idle")).not.toBeInTheDocument()
        // 24 baldes de `dia` — a tabela nunca omite um balde, mesmo cheia.
        expect(screen.getAllByRole("row")).toHaveLength(25) // cabeçalho + 24 linhas
    })

    it("balde sem leitura mostra '-' na tabela, nunca 0", async () => {
        vi.mocked(meterReadingService.series).mockResolvedValue({
            items: [{ bucketStart: "2026-01-15T00:00:00.000Z", min: null, avg: null, max: null }],
            metric: "tensao",
            window: "dia",
        })

        renderSection()
        await submitDiaForm()

        const row = await screen.findByText("00h")
        const cells = row.closest("tr")!.querySelectorAll("td")
        expect(cells[1]).toHaveTextContent("-")
        expect(cells[2]).toHaveTextContent("-")
        expect(cells[3]).toHaveTextContent("-")
    })

    it("erro na busca mostra mensagem genérica, não trava em 'Carregando'", async () => {
        vi.mocked(meterReadingService.series).mockRejectedValue(new Error("falha de rede"))

        renderSection()
        await submitDiaForm()

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Não foi possível carregar a análise.",
        )
    })
})
