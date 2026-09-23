import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { DeviceDetailsPage } from "@/pages/device/DeviceDetailsPage"
import { deviceService } from "@/services/device.service"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import { consumptionService } from "@/services/consumption.service"
import { meterService } from "@/services/meter.service"
import { meterReadingService } from "@/services/meterReading.service"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"
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

// MeterSection/ConsumptionSection consultam o medidor do alvo.
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

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
    ensureFreshSession: vi.fn(),
}))

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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: null,
    city: null,
    state: null,
    zipCode: null,
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

const mockMeter: Meter = {
    id: "meter-1",
    name: "Medidor do dispositivo",
    targetType: "DEVICE",
    propertyId: "prop-1",
    areaId: "area-1",
    deviceId: "device-1",
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

const TODAY = `${toLocalDateKey(new Date())}T00:00:00.000Z`
const THIS_MONTH = `${toLocalMonthKey(new Date())}-01T00:00:00.000Z`

const summaryItem = (
    bucketStart: string,
    kwhConsumed: number,
    costBrl?: number,
): ConsumptionSummaryItem => ({
    id: "device-1",
    targetType: "DEVICE",
    bucketStart,
    kwhConsumed,
    avgPowerW: 300,
    ...(costBrl !== undefined && { costBrl }),
})

/** Resumo do dispositivo por granularidade — o que a página pede ao endpoint em lote. */
const mockSummaryBy = (byGranularity: {
    day?: ConsumptionSummaryItem
    month?: ConsumptionSummaryItem
}) =>
    vi.mocked(consumptionService.summary).mockImplementation(async ({ granularity }) => {
        const item = byGranularity[granularity === "day" ? "day" : "month"]
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
            <MemoryRouter initialEntries={["/propriedades/prop-1/areas/area-1/devices/device-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={<DeviceDetailsPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<p>Área pai</p>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    // Sem medidor vinculado por padrão — MeterSection/ConsumptionSection
    // caem no EmptyState "Nenhum medidor vinculado" sem ficar em loading.
    vi.mocked(meterService.byTarget).mockResolvedValue(null)
    vi.mocked(meterReadingService.list).mockResolvedValue({ items: [], granularity: "minute" })
    vi.mocked(useRealtimeReadings).mockReturnValue({ readingsByMeterId: {} })
    vi.mocked(consumptionService.summary).mockResolvedValue({ items: [] })
})

// ─────────────────────────────────────────────────────────────────────────────
// Loading e erro
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — loading", () => {
    it("renderiza skeleton enquanto o device carrega", () => {
        vi.mocked(deviceService.getById).mockImplementation(() => new Promise(() => {}))

        renderPage()

        expect(screen.getByLabelText(/carregando dados do dispositivo/i)).toBeInTheDocument()
    })
})

describe("DeviceDetailsPage — erro no device", () => {
    it("renderiza ErrorState quando a query do device falha", async () => {
        vi.mocked(deviceService.getById).mockRejectedValue(new Error("Dispositivo não encontrado"))

        renderPage()

        expect(await screen.findByText(/dispositivo não encontrado/i)).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /voltar para a área/i })).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header / dados do device
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — header do device", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome do device como heading do detalhe", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza chips de marca, modelo e potência", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })
        expect(screen.getByText(/daikin/i)).toBeInTheDocument()
        expect(screen.getByText(/split 12000 btu/i)).toBeInTheDocument()
        expect(screen.getByText(/1\s*200\s*W/i)).toBeInTheDocument()
    })

    it("renderiza chip da área pai com nome correto", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })
        expect(screen.getByText(/sala/i)).toBeInTheDocument()
    })

    it("renderiza chip da propriedade avó com nome correto", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })
        expect(screen.getByText(/casa principal/i)).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fallbacks de chips quando queries de área/property falham
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — fallbacks de chips", () => {
    it("mostra fallback no chip da área quando a query falha", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockRejectedValue(new Error("Área removida"))

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })

        await waitFor(() => expect(screen.getByText(/área não disponível/i)).toBeInTheDocument())
    })

    it("mostra fallback no chip da propriedade quando a query falha", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockRejectedValue(new Error("Propriedade removida"))

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })

        await waitFor(() =>
            expect(screen.getByText(/propriedade não disponível/i)).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Editar — e sem excluir
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — editar", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("abre o modal de edição ao clicar em 'Editar dispositivo'", async () => {
        const user = userEvent.setup()
        renderPage()

        await user.click(await screen.findByRole("button", { name: /editar dispositivo/i }))

        expect(
            await screen.findByRole("dialog", { name: /editar dispositivo/i }),
        ).toBeInTheDocument()
    })

    it("não oferece excluir — criar e excluir vivem em Configurações → Cadastro", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })

        expect(screen.queryByRole("button", { name: /opções de/i })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seções
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — seções", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza seção 'Medidor'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", { level: 2, name: /^medidor$/i }),
        ).toBeInTheDocument()

        expect(await screen.findByText(/nenhum medidor vinculado/i)).toBeInTheDocument()
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

    it("renderiza seção 'Consumo'", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /^histórico de consumo$/i,
            }),
        ).toBeInTheDocument()
    })

    it("consulta o medidor do device (targetType=DEVICE)", async () => {
        renderPage()

        await waitFor(() => {
            expect(meterService.byTarget).toHaveBeenCalledWith("DEVICE", "device-1")
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// KPIs do medidor do dispositivo
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — KPIs de consumo", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMeter)
    })

    it("mostra o consumo de hoje e o custo do mês reais", async () => {
        mockSummaryBy({
            day: summaryItem(TODAY, 3.2, 2.5),
            month: summaryItem(THIS_MONTH, 60, 48),
        })

        renderPage()

        expect(await screen.findByText("Consumo hoje")).toBeInTheDocument()
        expect(await screen.findByText("3,20")).toBeInTheDocument()
        expect(screen.getByText("Custo do mês")).toBeInTheDocument()
        expect(screen.getByText(/R\$\s?48,00/)).toBeInTheDocument()
        expect(consumptionService.summary).toHaveBeenCalledWith(
            expect.objectContaining({ targetType: "DEVICE", ids: ["device-1"] }),
        )
    })

    it("em Grupo A ou Branca, o custo do mês é traço explicado, nunca zero", async () => {
        mockSummaryBy({ day: summaryItem(TODAY, 3.2), month: summaryItem(THIS_MONTH, 60) })

        renderPage()

        expect(await screen.findByText("Custo indisponível para esta tarifa.")).toBeInTheDocument()
        expect(screen.getByText("3,20")).toBeInTheDocument()
    })

    it("sem medidor, não mostra os KPIs nem consulta o resumo", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(null)

        renderPage()

        await screen.findByRole("heading", { level: 2, name: /ar-condicionado/i })
        expect(screen.queryByText("Consumo hoje")).not.toBeInTheDocument()
        expect(consumptionService.summary).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Consumo — integração
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceDetailsPage — seção de consumo (integração)", () => {
    beforeEach(() => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza as abas de granularidade (Hora/Dia)", async () => {
        renderPage()

        expect(await screen.findByTestId("granularity-tabs")).toBeInTheDocument()
        expect(screen.getByTestId("granularity-tab-hour")).toBeInTheDocument()
        expect(screen.getByTestId("granularity-tab-day")).toBeInTheDocument()
    })

    it("sem medidor vinculado, não chama /api/consumption", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 2, name: /^histórico de consumo$/i })

        expect(consumptionService.list).not.toHaveBeenCalled()
    })
})
