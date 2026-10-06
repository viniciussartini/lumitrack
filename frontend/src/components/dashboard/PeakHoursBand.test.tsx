import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { PeakHoursBand } from "@/components/dashboard/PeakHoursBand"
import { consumptionService } from "@/services/consumption.service"
import { distributorService } from "@/services/distributor.service"
import type { ConsumptionBucket, GroupABreakdown } from "@/types/consumption.types"
import type { Distributor } from "@/types/distributor.types"

vi.mock("@/services/distributor.service", () => ({
    distributorService: { getById: vi.fn(), list: vi.fn() },
}))
vi.mock("@/services/consumption.service", () => ({
    consumptionService: { list: vi.fn() },
}))

// 16/10/2026 em São Paulo.
const NOW = new Date(2026, 9, 16, 12)

const distributor = (start: number | null, end: number | null): Distributor => ({
    id: "dist-1",
    name: "Copel",
    cnpj: "76.483.817/0001-20",
    state: "PR",
    tusdPerKwh: 0.3,
    tePerKwh: 0.3,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    peakWindowStartHour: start,
    peakWindowEndHour: end,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const groupA = (energyByPost: GroupABreakdown["energyByPost"]): GroupABreakdown => ({
    contractedDemandKw: 200,
    demandByPost: [],
    demandBrl: 0,
    ultrapassagemBrl: 0,
    energyByPost,
    ereByWindow: [],
    ereBrl: 0,
    flagBrl: 0,
    taxesBrl: 0,
    publicLightingFeeBrl: 0,
})

const monthBucket = (
    energyByPost: GroupABreakdown["energyByPost"] | null,
    bucketStart = "2026-10-01T00:00:00.000Z",
): ConsumptionBucket => ({
    bucketStart,
    kwhConsumed: 100,
    costBrl: 80,
    avgPowerW: 0,
    ...(energyByPost && { groupA: groupA(energyByPost) }),
})

const mockMonth = (bucket: ConsumptionBucket | null) =>
    vi.mocked(consumptionService.list).mockResolvedValue({
        items: bucket ? [bucket] : [],
        total: bucket ? 1 : 0,
        page: 1,
        pageSize: 1,
        granularity: "month",
    })

const renderBand = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <PeakHoursBand propertyId="prop-1" distributorId="dist-1" />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    vi.mocked(distributorService.getById).mockResolvedValue(distributor(18, 21))
    mockMonth(
        monthBucket([
            { post: "PEAK", kwhConsumed: 31, brl: 40 },
            { post: "OFF_PEAK", kwhConsumed: 69, brl: 30 },
        ]),
    )
})

afterEach(() => {
    vi.useRealTimers()
})

describe("PeakHoursBand", () => {
    it("mostra a janela, os dias excluídos e a participação da ponta no mês", async () => {
        renderBand()

        const band = await screen.findByTestId("peak-hours-band")
        expect(band).toHaveTextContent("Horário de ponta")
        expect(band).toHaveTextContent(
            "Seg a sex, 18h–21h · excluídos sábados, domingos e feriados",
        )
        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent(
            "Consumo na ponta responde por 31% do acumulado do mês",
        )
    })

    it("a janela vem da distribuidora, sem horário escrito no código", async () => {
        vi.mocked(distributorService.getById).mockResolvedValue(distributor(17, 20))
        renderBand()

        expect(await screen.findByTestId("peak-hours-band")).toHaveTextContent("17h–20h")
    })

    it("pede a distribuidora da propriedade e o resumo mensal dela", async () => {
        renderBand()
        await screen.findByTestId("peak-hours-share")

        expect(distributorService.getById).toHaveBeenCalledWith("dist-1")
        expect(consumptionService.list).toHaveBeenCalledWith(
            expect.objectContaining({
                targetType: "PROPERTY",
                targetId: "prop-1",
                granularity: "month",
            }),
        )
    })

    it("distribuidora sem janela de ponta configurada: a faixa some", async () => {
        vi.mocked(distributorService.getById).mockResolvedValue(distributor(null, null))
        renderBand()

        await vi.waitFor(() => expect(distributorService.getById).toHaveBeenCalled())
        // deixa a consulta resolver e a tela redesenhar antes de conferir a ausência
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(screen.queryByTestId("peak-hours-band")).not.toBeInTheDocument()
    })

    it("mês sem consumo é '-', nunca 0%", async () => {
        mockMonth(monthBucket([]))
        renderBand()

        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent(
            "Consumo na ponta no mês: -",
        )
        expect(screen.getByTestId("peak-hours-band")).not.toHaveTextContent("0%")
    })

    it("último resumo de um mês anterior não vale para o mês corrente", async () => {
        mockMonth(
            monthBucket([{ post: "PEAK", kwhConsumed: 50, brl: 10 }], "2026-09-01T00:00:00.000Z"),
        )
        renderBand()

        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent(
            "Consumo na ponta no mês: -",
        )
    })

    it("resumo sem a conta do Grupo A ou com falha na consulta também é '-'", async () => {
        mockMonth(monthBucket(null))
        const { unmount } = renderBand()
        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent("-")
        unmount()

        vi.mocked(consumptionService.list).mockRejectedValue(new Error("falha"))
        renderBand()
        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent("-")
    })

    it("consumo só fora da ponta é 0% de verdade", async () => {
        mockMonth(monthBucket([{ post: "OFF_PEAK", kwhConsumed: 80, brl: 30 }]))
        renderBand()

        expect(await screen.findByTestId("peak-hours-share")).toHaveTextContent(
            "responde por 0% do acumulado",
        )
    })

    it("não mostra a participação enquanto o resumo carrega", async () => {
        vi.mocked(consumptionService.list).mockReturnValue(new Promise(() => {}))
        renderBand()

        expect(await screen.findByTestId("peak-hours-band")).toBeInTheDocument()
        expect(screen.queryByTestId("peak-hours-share")).not.toBeInTheDocument()
    })
})
