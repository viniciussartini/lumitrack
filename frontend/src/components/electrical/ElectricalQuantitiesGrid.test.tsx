import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ElectricalQuantitiesGrid } from "@/components/electrical/ElectricalQuantitiesGrid"
import { useRealtimeReadings } from "@/contexts/RealtimeContext"
import type { ReadingPayload } from "@/lib/sse/appStream"

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtimeReadings: vi.fn(() => ({ readingsByMeterId: {} })),
}))

const READING: ReadingPayload = {
    meterId: "meter-1",
    voltage: 220,
    current: 10,
    powerW: 2200,
    powerFactor: 0.95,
    receivedAt: "2026-01-01T00:00:00.000Z",
    voltagePhaseA: 219,
    voltagePhaseB: 221,
    voltagePhaseC: 220,
    voltageUnbalance: 0.45,
}

describe("ElectricalQuantitiesGrid", () => {
    it("sem medidor vinculado, mostra o estado vazio de 'nenhum medidor'", () => {
        render(<ElectricalQuantitiesGrid meterId={undefined} />)

        expect(screen.getByText("Nenhum medidor vinculado")).toBeInTheDocument()
    })

    it("com medidor mas sem leitura SSE ainda, mostra 'Aguardando leituras...' (nunca 0)", () => {
        vi.mocked(useRealtimeReadings).mockReturnValue({ readingsByMeterId: {} })

        render(<ElectricalQuantitiesGrid meterId="meter-1" />)

        expect(screen.getByTestId("electrical-quantities-empty")).toBeInTheDocument()
        expect(screen.getByText("Aguardando leituras...")).toBeInTheDocument()
    })

    it("com leitura, mostra os 5 cards", () => {
        vi.mocked(useRealtimeReadings).mockReturnValue({
            readingsByMeterId: { "meter-1": READING },
        })

        render(<ElectricalQuantitiesGrid meterId="meter-1" />)

        expect(screen.getByTestId("electrical-quantity-card-voltage")).toBeInTheDocument()
        expect(screen.getByTestId("electrical-quantity-card-current")).toBeInTheDocument()
        expect(screen.getByTestId("electrical-quantity-card-power")).toBeInTheDocument()
        expect(screen.getByTestId("electrical-quantity-card-powerFactor")).toBeInTheDocument()
        expect(screen.getByTestId("electrical-quantity-card-thd")).toBeInTheDocument()
        expect(screen.getByText("219,00V")).toBeInTheDocument()
    })

    it("só lê a leitura do medidor pedido, não de qualquer entrada do contexto", () => {
        vi.mocked(useRealtimeReadings).mockReturnValue({
            readingsByMeterId: { "outro-medidor": READING },
        })

        render(<ElectricalQuantitiesGrid meterId="meter-1" />)

        expect(screen.getByTestId("electrical-quantities-empty")).toBeInTheDocument()
    })
})
