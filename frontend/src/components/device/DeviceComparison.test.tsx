import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { DeviceComparison } from "@/components/device/DeviceComparison"
import { deviceService } from "@/services/device.service"
import { consumptionService } from "@/services/consumption.service"
import type { Device } from "@/types/device.types"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

vi.mock("@/services/device.service", () => ({ deviceService: { list: vi.fn() } }))
vi.mock("@/services/consumption.service", () => ({ consumptionService: { summary: vi.fn() } }))

const device = (id: string, name: string): Device => ({
    id,
    areaId: "area-1",
    name,
    brand: null,
    model: null,
    powerWatts: 100,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
})

const summaryItem = (id: string, kwh: number, cost?: number): ConsumptionSummaryItem => ({
    id,
    targetType: "DEVICE",
    bucketStart: "2026-09-01T00:00:00.000Z",
    kwhConsumed: kwh,
    avgPowerW: 100,
    ...(cost !== undefined && { costBrl: cost }),
})

const listOf = (devices: Device[]) => ({
    items: devices,
    total: devices.length,
    page: 1,
    pageSize: 31,
})

const renderComparison = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <DeviceComparison propertyId="prop-1" areaId="area-1" />
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("DeviceComparison", () => {
    it("compara o consumo medido e avisa quantos dispositivos ficaram de fora", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(
            listOf([
                device("d1", "Geladeira"),
                device("d2", "Ar-condicionado"),
                device("d3", "TV"),
            ]),
        )
        vi.mocked(consumptionService.summary).mockResolvedValue({
            items: [summaryItem("d1", 40, 32)],
        })

        renderComparison()

        expect(await screen.findByText("Geladeira")).toBeInTheDocument()
        expect(screen.getByText(/40,00 kWh/)).toBeInTheDocument()
        expect(screen.queryByText("TV")).not.toBeInTheDocument()
        expect(
            screen.getByText("2 dispositivos sem medidor não aparecem na comparação."),
        ).toBeInTheDocument()
        expect(deviceService.list).toHaveBeenCalledWith("prop-1", "area-1", {
            page: 1,
            pageSize: 31,
        })
    })

    it("com um só dispositivo de fora, o aviso fica no singular", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(
            listOf([device("d1", "Geladeira"), device("d2", "TV")]),
        )
        vi.mocked(consumptionService.summary).mockResolvedValue({
            items: [summaryItem("d1", 40, 32)],
        })

        renderComparison()

        expect(
            await screen.findByText("1 dispositivo sem medidor não aparece na comparação."),
        ).toBeInTheDocument()
    })

    it("todos com medidor: sem aviso", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(listOf([device("d1", "Geladeira")]))
        vi.mocked(consumptionService.summary).mockResolvedValue({
            items: [summaryItem("d1", 40, 32)],
        })

        renderComparison()

        await screen.findByText("Geladeira")
        expect(screen.queryByText(/sem medidor/i)).not.toBeInTheDocument()
    })

    it("em Grupo A ou Branca, mostra o consumo e desabilita o R$", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(listOf([device("d1", "Geladeira")]))
        vi.mocked(consumptionService.summary).mockResolvedValue({ items: [summaryItem("d1", 40)] })

        renderComparison()

        expect(await screen.findByText(/40,00 kWh/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "R$" })).toBeDisabled()
    })

    it("sem dispositivos, orienta a cadastrá-los", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(listOf([]))

        renderComparison()

        expect(
            await screen.findByText("Cadastre dispositivos para comparar o consumo entre eles."),
        ).toBeInTheDocument()
        expect(consumptionService.summary).not.toHaveBeenCalled()
    })

    it("com dispositivos mas nenhum medidor, explica", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(listOf([device("d1", "Geladeira")]))
        vi.mocked(consumptionService.summary).mockResolvedValue({ items: [] })

        renderComparison()

        expect(
            await screen.findByText("Nenhum dispositivo desta área tem medidor."),
        ).toBeInTheDocument()
    })

    it("mostra erro quando a lista de dispositivos falha", async () => {
        vi.mocked(deviceService.list).mockRejectedValue(new Error("falhou"))

        renderComparison()

        expect(
            await screen.findByText("Não foi possível carregar a comparação de dispositivos."),
        ).toBeInTheDocument()
    })
})
