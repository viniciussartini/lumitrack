import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor, within } from "@testing-library/react"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
import type { Paginated } from "@/types/pagination.types"
import { deviceService } from "@/services/device.service"
import type { Device } from "@/types/device.types"
import { consumptionService } from "@/services/consumption.service"
import { meterService } from "@/services/meter.service"
import { meterReadingService } from "@/services/meterReading.service"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import type { Meter } from "@/types/meter.types"
import type { ReadingPayload } from "@/lib/sse/appStream"
import { toLocalDateKey, toLocalMonthKey } from "@/lib/dashboardKpis"
import type { ConsumptionSummaryItem } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        list: vi.fn(),
        summary: vi.fn(),
    },
}))

vi.mock("@/services/meter.service", () => ({
    meterService: {
        list: vi.fn(),
        byTarget: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/area.service", () => ({
    areaService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { list: vi.fn() },
}))

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtimeReadings: vi.fn(() => ({ readingsByMeterId: {} })),
}))

vi.mock("@/services/device.service", () => ({
    deviceService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
    ensureFreshSession: vi.fn(),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
})

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    electricalSystem: "MONOPHASIC",
    billingClass: "B1",
    groupBModality: "CONVENTIONAL",
    receivesBillingDiscount: false,
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockMeter: Meter = {
    id: "meter-1",
    name: "Medidor da área",
    targetType: "AREA",
    propertyId: "prop-1",
    areaId: "area-1",
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

const mockReading = (powerW: number): ReadingPayload => ({
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW,
    powerFactor: 0.98,
    receivedAt: new Date().toISOString(),
})

const summaryItem = (
    id: string,
    targetType: "AREA" | "DEVICE",
    bucketStart: string,
    kwhConsumed: number,
    costBrl?: number,
): ConsumptionSummaryItem => ({
    id,
    targetType,
    bucketStart,
    kwhConsumed,
    avgPowerW: 300,
    ...(costBrl !== undefined && { costBrl }),
})

const TODAY = `${toLocalDateKey(new Date())}T00:00:00.000Z`
const THIS_MONTH = `${toLocalMonthKey(new Date())}-01T00:00:00.000Z`

/** Resumo por alvo e granularidade — o que a página pede ao endpoint em lote. */
const mockSummaryBy = (items: {
    area?: { day?: ConsumptionSummaryItem; month?: ConsumptionSummaryItem }
    devices?: ConsumptionSummaryItem[]
}) =>
    vi
        .mocked(consumptionService.summary)
        .mockImplementation(async ({ targetType, granularity }) => {
            if (targetType === "DEVICE") return { items: items.devices ?? [] }
            const item = items.area?.[granularity === "day" ? "day" : "month"]
            return { items: item ? [item] : [] }
        })

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/propriedades/prop-1/areas/area-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<AreaDetailsPage />}
                    />
                    <Route path="/propriedades/:id" element={<div>Detalhes da propriedade</div>} />
                    <Route path="/propriedades" element={<div>Lista de propriedades</div>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(meterService.byTarget).mockResolvedValue(null)
    vi.mocked(meterReadingService.list).mockResolvedValue({ items: [], granularity: "minute" })
    vi.mocked(useRealtimeReadings).mockReturnValue({ readingsByMeterId: {} })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — loading", () => {
    it("renderiza skeleton enquanto a área carrega", () => {
        vi.mocked(areaService.getById).mockReturnValue(new Promise(() => {}))
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(screen.queryByText(/sala/i)).not.toBeInTheDocument()
        expect(screen.getByLabelText(/carregando dados da área/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — erro fatal (área)", () => {
    it("renderiza ErrorState quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(new Error("Área não encontrada"))
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(await screen.findByText(/área não encontrada/i)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /voltar para a propriedade/i })).toHaveAttribute(
            "href",
            "/propriedades/prop-1",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — header", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome da área como heading do detalhe", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /sala/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza a descrição quando presente", async () => {
        renderPage()

        expect(await screen.findByText(/área principal de convivência/i)).toBeInTheDocument()
    })

    it("não renderiza descrição quando é null", async () => {
        vi.mocked(areaService.getById).mockResolvedValue({
            ...mockArea,
            description: null,
        })

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /sala/i })
        expect(screen.queryByText(/área principal/i)).not.toBeInTheDocument()
    })

    it("renderiza chip com nome da propriedade pai", async () => {
        renderPage()

        expect(await screen.findByText(/casa principal/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — botão Editar área
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — botão Editar área", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("abre o modal de edição ao clicar em 'Editar área'", async () => {
        const user = userEvent.setup()
        renderPage()

        const editButton = await screen.findByRole("button", {
            name: /editar área/i,
        })
        await user.click(editButton)

        expect(await screen.findByRole("dialog", { name: /editar área/i })).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chip da propriedade
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — chip da propriedade", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
    })

    it("mostra fallback quando a query da property falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(new Error("Propriedade removida"))

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /sala/i })

        await waitFor(() =>
            expect(screen.getByText(/propriedade não disponível/i)).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Comparação de dispositivos — no lugar da grade de dispositivos e do
// "Adicionar dispositivo"
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — comparação de dispositivos", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("sem dispositivos, orienta a cadastrá-los", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText("Cadastre dispositivos para comparar o consumo entre eles."),
        ).toBeInTheDocument()
    })

    it("compara o consumo medido dos dispositivos com medidor e avisa dos que ficaram de fora", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(
            paginated([mockDevice, { ...mockDevice, id: "device-2", name: "Ventilador" }]),
        )
        mockSummaryBy({ devices: [summaryItem("device-1", "DEVICE", THIS_MONTH, 60, 48)] })

        renderPage()

        const comparison = await screen.findByTestId("device-comparison")
        expect(within(comparison).getByText("Ar-condicionado")).toBeInTheDocument()
        expect(within(comparison).getByText(/60,00 kWh/)).toBeInTheDocument()
        expect(within(comparison).queryByText("Ventilador")).not.toBeInTheDocument()
        expect(
            within(comparison).getByText("1 dispositivo sem medidor não aparece na comparação."),
        ).toBeInTheDocument()
    })

    it("não traz mais a grade de dispositivos nem o botão de adicionar dispositivo", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(paginated([mockDevice]))
        mockSummaryBy({})

        renderPage()

        await screen.findByText("Nenhum dispositivo desta área tem medidor.")
        expect(screen.queryByTestId("devices-grid")).not.toBeInTheDocument()
        expect(
            screen.queryByRole("button", { name: /adicionar dispositivo/i }),
        ).not.toBeInTheDocument()
    })

    it("mantém o detalhe quando o fetch dos dispositivos falha", async () => {
        vi.mocked(deviceService.list).mockRejectedValue(new Error("Falha ao listar dispositivos"))

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /sala/i })
        expect(
            await screen.findByText("Não foi possível carregar a comparação de dispositivos."),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// KPIs do medidor da própria área
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — KPIs e consumo da própria área", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(deviceService.list).mockResolvedValue(paginated([]))
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
    })

    it("mostra o consumo de hoje e o custo do mês reais, com o kWh/mês na tag", async () => {
        mockSummaryBy({
            area: {
                day: summaryItem("area-1", "AREA", TODAY, 12.5, 10),
                month: summaryItem("area-1", "AREA", THIS_MONTH, 200, 160),
            },
        })

        renderPage()

        expect(await screen.findByText("Consumo hoje")).toBeInTheDocument()
        expect(await screen.findByText("12,50")).toBeInTheDocument()
        expect(screen.getByText("Custo do mês")).toBeInTheDocument()
        expect(screen.getByText(/R\$\s?160,00/)).toBeInTheDocument()
        expect(screen.getByText("200,00 kWh/mês")).toBeInTheDocument()
    })

    it("usa o consumo do medidor da área, não a soma dos dispositivos", async () => {
        vi.mocked(deviceService.list).mockResolvedValue(paginated([mockDevice]))
        mockSummaryBy({
            area: { month: summaryItem("area-1", "AREA", THIS_MONTH, 200, 160) },
            devices: [summaryItem("device-1", "DEVICE", THIS_MONTH, 999, 800)],
        })

        renderPage()

        expect(await screen.findByText("200,00 kWh/mês")).toBeInTheDocument()
        expect(screen.queryByText("999,00 kWh/mês")).not.toBeInTheDocument()
    })

    it("em Grupo A ou Branca, o custo do mês é traço explicado, nunca zero", async () => {
        mockSummaryBy({
            area: {
                day: summaryItem("area-1", "AREA", TODAY, 12.5),
                month: summaryItem("area-1", "AREA", THIS_MONTH, 200),
            },
        })

        renderPage()

        expect(await screen.findByText("Custo indisponível para esta tarifa.")).toBeInTheDocument()
        expect(screen.getByText("12,50")).toBeInTheDocument()
        expect(screen.getByText("200,00 kWh/mês")).toBeInTheDocument()
    })

    it("com medidor ainda sem leitura, os valores são traço", async () => {
        mockSummaryBy({})

        renderPage()

        await screen.findByText("Consumo hoje")
        await waitFor(() => expect(consumptionService.summary).toHaveBeenCalled())
        expect(screen.queryByText(/kWh\/mês/)).not.toBeInTheDocument()
        expect(screen.queryByText("Custo indisponível para esta tarifa.")).not.toBeInTheDocument()
    })

    it("sem medidor, não mostra os KPIs nem consulta o resumo da área", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /sala/i })
        expect(screen.queryByText("Consumo hoje")).not.toBeInTheDocument()
        expect(consumptionService.summary).not.toHaveBeenCalledWith(
            expect.objectContaining({ targetType: "AREA" }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Medidor / Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — seção de medidor/consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(deviceService.list).mockResolvedValue(paginated([]))
    })

    it("renderiza a seção 'Medidor'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^medidor$/i,
            }),
        ).toBeInTheDocument()
    })

    it("mostra o KPI 'Potência agora' quando o medidor tem leitura", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
        vi.mocked(useRealtimeReadings).mockReturnValue({
            readingsByMeterId: { "meter-1": mockReading(1500) },
        })

        renderPage()

        expect(await screen.findByText("Potência agora")).toBeInTheDocument()
        // MeterSection também mostra a potência atual — o mesmo valor
        // aparece nos dois cards.
        expect(screen.getAllByText("1,50kW").length).toBeGreaterThan(0)
    })

    it("renderiza a seção 'Consumo'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^histórico de consumo$/i,
            }),
        ).toBeInTheDocument()
    })

    it("consulta o medidor do alvo AREA", async () => {
        renderPage()

        await waitFor(() => {
            expect(meterService.byTarget).toHaveBeenCalledWith("AREA", "area-1")
        })
    })

    it("sem medidor vinculado, não chama /api/consumption", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /^histórico de consumo$/i })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})
