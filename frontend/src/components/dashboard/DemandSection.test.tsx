import { beforeEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { AxiosError, type AxiosResponse } from "axios"
import { DemandSection } from "@/components/dashboard/DemandSection"
import { demandService } from "@/services/demand.service"
import type { DemandOverview, DemandPoint } from "@/types/demand.types"

vi.mock("@/services/demand.service", () => ({
    demandService: { overview: vi.fn() },
}))

// Meia-noite de São Paulo (UTC-3) de 16/10/2026.
const DAY_START = Date.UTC(2026, 9, 16, 3, 0)

const points = (override: (block: number) => Partial<DemandPoint> = () => ({})): DemandPoint[] =>
    Array.from({ length: 96 }, (_, block) => ({
        windowEnd: new Date(DAY_START + (block * 15 + 14) * 60_000).toISOString(),
        kw: block < 48 ? 120 : null,
        post: block >= 72 && block < 84 ? ("PEAK" as const) : ("OFF_PEAK" as const),
        contractedKw: 200,
        ...override(block),
    }))

const verde = (override: Partial<DemandOverview> = {}): DemandOverview => ({
    propertyId: "prop-1",
    modality: "GREEN",
    windowMinutes: 15,
    contracted: [{ post: null, kw: 200 }],
    current: { kw: 150, windowEnd: "2026-10-16T15:29:00.000Z" },
    monthMax: { kw: 180, windowEnd: "2026-10-09T21:14:00.000Z" },
    exceedancePercent: 0,
    day: { date: "2026-10-16", points: points() },
    ...override,
})

const httpError = (status: number, message?: string) =>
    new AxiosError("falha", "ERR_BAD_REQUEST", undefined, undefined, {
        status,
        data: message ? { status: "error", message } : {},
    } as AxiosResponse)

const renderSection = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <DemandSection propertyId="prop-1" propertyName="Galpão" />
        </QueryClientProvider>,
    )
}

const stat = (label: string): HTMLElement =>
    screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(demandService.overview).mockResolvedValue(verde())
})

describe("DemandSection — cards", () => {
    it("mostra a demanda atual, a máxima do mês, a contratada e 'sem ultrapassagem'", async () => {
        renderSection()

        expect(await screen.findByText("Demanda atual")).toBeInTheDocument()
        expect(stat("Demanda atual")).toHaveTextContent("150 kW")
        expect(stat("Máxima do mês")).toHaveTextContent("180 kW")
        expect(stat("Contratada")).toHaveTextContent("200 kW")
        expect(stat("Ultrapassagem")).toHaveTextContent("sem ultrapassagem")
        expect(stat("Ultrapassagem")).toHaveClass("text-status-success")
    })

    it("a nota diz a modalidade e a cadência da medição", async () => {
        renderSection()

        expect(
            await screen.findByText(/Galpão · modalidade Verde · medição a cada 15 min/),
        ).toBeInTheDocument()
    })

    it("pede a visão da propriedade", async () => {
        renderSection()
        await screen.findByText("Demanda atual")

        expect(demandService.overview).toHaveBeenCalledWith("prop-1")
    })

    it("ultrapassagem mostra o percentual sobre a contratada, e a máxima fica em vermelho", async () => {
        vi.mocked(demandService.overview).mockResolvedValue(
            verde({ monthMax: { kw: 230, windowEnd: null }, exceedancePercent: 15 }),
        )
        renderSection()

        expect(await screen.findByText("Ultrapassagem")).toBeInTheDocument()
        expect(stat("Ultrapassagem")).toHaveTextContent("+15,0%")
        expect(stat("Ultrapassagem")).toHaveClass("text-status-danger")
        expect(stat("Máxima do mês")).toHaveTextContent("230 kW")
        expect(stat("Máxima do mês")).toHaveClass("text-status-danger")
    })

    it("sem janela medida tudo é '-', nunca 0 kW", async () => {
        vi.mocked(demandService.overview).mockResolvedValue(
            verde({
                current: { kw: null, windowEnd: "2026-10-16T15:29:00.000Z" },
                monthMax: { kw: null, windowEnd: null },
                exceedancePercent: null,
                day: { date: "2026-10-16", points: points(() => ({ kw: null })) },
            }),
        )
        renderSection()

        expect(await screen.findByText("Demanda atual")).toBeInTheDocument()
        expect(stat("Demanda atual")).toHaveTextContent(/^-$/)
        expect(stat("Máxima do mês")).toHaveTextContent(/^-$/)
        expect(stat("Ultrapassagem")).toHaveTextContent(/^-$/)
        expect(stat("Contratada")).toHaveTextContent("200 kW")
    })

    it("Azul mostra as duas contratadas e a modalidade", async () => {
        vi.mocked(demandService.overview).mockResolvedValue(
            verde({
                modality: "BLUE",
                contracted: [
                    { post: "PEAK", kw: 150 },
                    { post: "OFF_PEAK", kw: 250 },
                ],
            }),
        )
        renderSection()

        expect(await screen.findByText(/modalidade Azul/)).toBeInTheDocument()
        expect(stat("Contratada")).toHaveTextContent("Ponta 150 · Fora 250 kW")
    })
})

describe("DemandSection — gráfico acessível", () => {
    it("o desenho fica fora da leitura e a tabela sr-only traz janela, medida, contratada e posto", async () => {
        renderSection()
        await screen.findByText("Demanda atual")

        expect(screen.getByTestId("demand-chart-graphic")).toHaveAttribute("aria-hidden", "true")
        const table = screen.getByRole("table")
        expect(table).toHaveClass("sr-only")
        const rows = within(table).getAllByRole("row")
        expect(rows).toHaveLength(97)
        expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("00:00–00:15")
        expect(
            within(rows[1]!)
                .getAllByRole("cell")
                .map((cell) => cell.textContent),
        ).toEqual(["120 kW", "200 kW", "Fora de ponta"])
    })

    it("janela sem leitura é '-' na tabela", async () => {
        renderSection()
        await screen.findByText("Demanda atual")

        const rows = within(screen.getByRole("table")).getAllByRole("row")
        // bloco 60 = 15:00, depois do último fechado do cenário
        expect(within(rows[61]!).getAllByRole("cell")[0]).toHaveTextContent("-")
    })

    it("a janela de ponta aparece com o posto 'Ponta'", async () => {
        renderSection()
        await screen.findByText("Demanda atual")

        const rows = within(screen.getByRole("table")).getAllByRole("row")
        expect(within(rows[73]!).getAllByRole("cell")[2]).toHaveTextContent("Ponta")
    })
})

describe("DemandSection — estados", () => {
    it("mostra o skeleton enquanto carrega", () => {
        vi.mocked(demandService.overview).mockReturnValue(new Promise(() => {}))
        renderSection()

        expect(screen.getByLabelText("Carregando demanda")).toBeInTheDocument()
    })

    it("propriedade sem medidor (404) orienta a configurar o medidor, sem 'tentar novamente'", async () => {
        vi.mocked(demandService.overview).mockRejectedValue(httpError(404))
        renderSection()

        expect(await screen.findByText(/configure um medidor/i)).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /tentar/i })).not.toBeInTheDocument()
    })

    it("contrato sem apuração (422) mostra a mensagem do servidor", async () => {
        vi.mocked(demandService.overview).mockRejectedValue(
            httpError(422, "Distribuidora sem janela de ponta configurada"),
        )
        renderSection()

        expect(
            await screen.findByText("Distribuidora sem janela de ponta configurada"),
        ).toBeInTheDocument()
    })

    it("falha de rede mostra o alerta e tenta de novo", async () => {
        vi.mocked(demandService.overview).mockRejectedValue(httpError(500))
        renderSection()

        const alert = await screen.findByRole("alert")
        expect(alert).toHaveTextContent("Não foi possível carregar a demanda.")

        vi.mocked(demandService.overview).mockResolvedValue(verde())
        await userEvent.setup().click(within(alert).getByRole("button", { name: /tentar/i }))

        expect(await screen.findByText("Demanda atual")).toBeInTheDocument()
    })
})
