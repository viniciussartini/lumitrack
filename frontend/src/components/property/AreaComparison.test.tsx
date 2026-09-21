import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { AreaComparison } from "@/components/property/AreaComparison"
import { areaService } from "@/services/area.service"
import { consumptionService } from "@/services/consumption.service"
import type { Area } from "@/types/area.types"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

vi.mock("@/services/area.service", () => ({ areaService: { list: vi.fn() } }))
vi.mock("@/services/consumption.service", () => ({ consumptionService: { summary: vi.fn() } }))

const area = (id: string, name: string): Area => ({
    id,
    propertyId: "prop-1",
    name,
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const summaryItem = (id: string, kwh: number, cost?: number): ConsumptionSummaryItem => ({
    id,
    targetType: "AREA",
    bucketStart: "2026-09-01T00:00:00.000Z",
    kwhConsumed: kwh,
    avgPowerW: 300,
    ...(cost !== undefined && { costBrl: cost }),
})

const renderComparison = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <AreaComparison propertyId="prop-1" />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(areaService.list).mockResolvedValue({
        items: [area("a1", "Sala"), area("a2", "Cozinha")],
        total: 2,
        page: 1,
        pageSize: 31,
    })
})

describe("AreaComparison", () => {
    it("pede todas as áreas da propriedade numa página só", async () => {
        vi.mocked(consumptionService.summary).mockResolvedValue({ items: [] })
        renderComparison()

        await screen.findByText("Nenhuma área desta propriedade tem medidor.")

        expect(areaService.list).toHaveBeenCalledWith("prop-1", { page: 1, pageSize: 31 })
    })

    it("compara em kWh e em R$ quando as áreas têm custo", async () => {
        vi.mocked(consumptionService.summary).mockResolvedValue({
            items: [summaryItem("a1", 40, 32), summaryItem("a2", 20, 16)],
        })
        renderComparison()

        expect(await screen.findByText("Sala")).toBeInTheDocument()
        expect(screen.getByText("Cozinha")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "R$" })).toBeEnabled()
    })

    it("em Grupo A ou Tarifa Branca mostra o consumo e desabilita R$ com a explicação", async () => {
        vi.mocked(consumptionService.summary).mockResolvedValue({
            items: [summaryItem("a1", 40), summaryItem("a2", 20)],
        })
        renderComparison()

        expect(await screen.findByText("Sala")).toBeInTheDocument()
        expect(screen.getByText(/40,00 kWh/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "R$" })).toBeDisabled()
        expect(screen.getByText("Custo em R$ indisponível para esta tarifa.")).toBeInTheDocument()
    })
})
