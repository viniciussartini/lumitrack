import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { MeterSection } from "@/components/meter/MeterSection"
import { meterService } from "@/services/meter.service"
import { meterReadingService } from "@/services/meterReading.service"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import type { Meter } from "@/types/meter.types"

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

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

const mockMqttMeter: Meter = {
    id: "meter-1",
    name: "Medidor MQTT",
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

// Protocolo com endereços de grandeza (extra.*) — MODBUS_TCP, um dos 4 de
// QUANTITY_ADDRESS_PROTOCOLS (#316, Fase 16).
const mockModbusTcpMeter: Meter = {
    id: "meter-2",
    name: "Medidor Modbus",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    protocol: "MODBUS_TCP",
    host: "192.168.0.10",
    port: 502,
    topic: null,
    address: "1",
    extra: { currentAddress: "2", powerAddress: "3", powerFactorAddress: "4" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderSection = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MeterSection targetType="PROPERTY" targetId="prop-1" />
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
// Criar
// ─────────────────────────────────────────────────────────────────────────────

describe("MeterSection — criar medidor", () => {
    it("chama meterService.create com o alvo e os campos de conexão (MQTT)", async () => {
        vi.mocked(meterService.create).mockResolvedValue(mockMqttMeter)
        const user = userEvent.setup()
        renderSection()
        await screen.findByText("Nenhum medidor vinculado")

        await user.click(screen.getByTestId("meter-section-create"))
        await screen.findByRole("heading", { name: "Configurar medidor" })

        await user.type(screen.getByLabelText("Nome do medidor"), "Medidor MQTT")
        // Protocolo já vem MQTT por default — só host/porta/tópico aparecem.
        await user.type(screen.getByLabelText("Host"), "broker.local")
        await user.type(screen.getByLabelText("Porta"), "1883")
        await user.type(screen.getByLabelText("Tópico MQTT"), "lumitrack/meter-1")
        await user.click(screen.getByRole("button", { name: "Vincular medidor" }))

        await waitFor(() =>
            expect(meterService.create).toHaveBeenCalledWith({
                targetType: "PROPERTY",
                propertyId: "prop-1",
                name: "Medidor MQTT",
                protocol: "MQTT",
                host: "broker.local",
                port: 1883,
                topic: "lumitrack/meter-1",
            }),
        )
    })

    it("protocolo com endereços de grandeza (MODBUS_TCP) manda 'extra' no create — campos do #316", async () => {
        vi.mocked(meterService.create).mockResolvedValue(mockModbusTcpMeter)
        const user = userEvent.setup()
        renderSection()
        await screen.findByText("Nenhum medidor vinculado")

        await user.click(screen.getByTestId("meter-section-create"))
        await screen.findByRole("heading", { name: "Configurar medidor" })

        await user.type(screen.getByLabelText("Nome do medidor"), "Medidor Modbus")
        await user.selectOptions(screen.getByLabelText("Protocolo"), "MODBUS_TCP")

        await user.type(screen.getByLabelText("Host"), "192.168.0.10")
        await user.type(screen.getByLabelText("Porta"), "502")
        await user.type(screen.getByLabelText("Endereço"), "1")
        await user.type(screen.getByLabelText("Endereço de corrente"), "2")
        await user.type(screen.getByLabelText("Endereço de potência"), "3")
        await user.type(screen.getByLabelText("Endereço de fator de potência"), "4")
        await user.click(screen.getByRole("button", { name: "Vincular medidor" }))

        await waitFor(() =>
            expect(meterService.create).toHaveBeenCalledWith({
                targetType: "PROPERTY",
                propertyId: "prop-1",
                name: "Medidor Modbus",
                protocol: "MODBUS_TCP",
                host: "192.168.0.10",
                port: 502,
                address: "1",
                extra: { currentAddress: "2", powerAddress: "3", powerFactorAddress: "4" },
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Editar
// ─────────────────────────────────────────────────────────────────────────────

describe("MeterSection — editar medidor", () => {
    it("abre pré-preenchido, inclusive os endereços de grandeza existentes", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockModbusTcpMeter)
        const user = userEvent.setup()
        renderSection()
        await screen.findByText(mockModbusTcpMeter.name)

        await user.click(screen.getByRole("button", { name: "Editar medidor" }))

        expect(await screen.findByRole("heading", { name: "Editar medidor" })).toBeInTheDocument()
        expect(screen.getByLabelText("Nome do medidor")).toHaveValue(mockModbusTcpMeter.name)
        expect(screen.getByLabelText("Host")).toHaveValue("192.168.0.10")
        expect(screen.getByLabelText("Endereço")).toHaveValue("1")
        expect(screen.getByLabelText("Endereço de corrente")).toHaveValue("2")
        expect(screen.getByLabelText("Endereço de potência")).toHaveValue("3")
        expect(screen.getByLabelText("Endereço de fator de potência")).toHaveValue("4")
    })

    it("chama meterService.update com o id, o nome novo e o 'extra' preservado", async () => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockModbusTcpMeter)
        vi.mocked(meterService.update).mockResolvedValue({
            ...mockModbusTcpMeter,
            name: "Nome novo",
        })
        const user = userEvent.setup()
        renderSection()
        await screen.findByText(mockModbusTcpMeter.name)

        await user.click(screen.getByRole("button", { name: "Editar medidor" }))
        await screen.findByRole("heading", { name: "Editar medidor" })

        await user.clear(screen.getByLabelText("Nome do medidor"))
        await user.type(screen.getByLabelText("Nome do medidor"), "Nome novo")
        await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

        await waitFor(() =>
            expect(meterService.update).toHaveBeenCalledWith(mockModbusTcpMeter.id, {
                name: "Nome novo",
                protocol: "MODBUS_TCP",
                host: "192.168.0.10",
                port: 502,
                address: "1",
                extra: { currentAddress: "2", powerAddress: "3", powerFactorAddress: "4" },
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Excluir
// ─────────────────────────────────────────────────────────────────────────────

describe("MeterSection — excluir medidor", () => {
    beforeEach(() => {
        vi.mocked(meterService.byTarget).mockResolvedValue(mockMqttMeter)
    })

    it("pede confirmação antes de excluir", async () => {
        const user = userEvent.setup()
        renderSection()
        await screen.findByText(mockMqttMeter.name)

        await user.click(screen.getByRole("button", { name: "Remover medidor" }))

        expect(await screen.findByText("Remover medidor")).toBeInTheDocument()
        expect(meterService.delete).not.toHaveBeenCalled()
    })

    it("chama meterService.delete ao confirmar", async () => {
        vi.mocked(meterService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderSection()
        await screen.findByText(mockMqttMeter.name)

        await user.click(screen.getByRole("button", { name: "Remover medidor" }))
        await screen.findByText("Isso remove o medidor e todas as leituras associadas.", {
            exact: false,
        })
        await user.click(screen.getByRole("button", { name: /^remover$/i }))

        await waitFor(() => expect(meterService.delete).toHaveBeenCalledWith(mockMqttMeter.id))
    })
})
