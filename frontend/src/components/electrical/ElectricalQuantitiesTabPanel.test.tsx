import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { ElectricalQuantitiesTabPanel } from "@/components/electrical/ElectricalQuantitiesTabPanel"

vi.mock("@/contexts/RealtimeContext", () => ({
    useRealtimeReadings: vi.fn(() => ({ readingsByMeterId: {} })),
}))

vi.mock("@/services/meterReading.service", () => ({
    meterReadingService: { series: vi.fn() },
}))

const renderPanel = (
    props: Partial<React.ComponentProps<typeof ElectricalQuantitiesTabPanel>> = {},
) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={queryClient}>
            <ElectricalQuantitiesTabPanel
                targetType="PROPERTY"
                targetId="prop-1"
                targetName="Casa Principal"
                meterId={undefined}
                isMeterLoading={false}
                isMeterError={false}
                {...props}
            />
        </QueryClientProvider>,
    )
}

describe("ElectricalQuantitiesTabPanel", () => {
    it("expõe role=tabpanel ligado à aba de grandezas", () => {
        renderPanel()

        expect(screen.getByRole("tabpanel")).toBeInTheDocument()
    })

    it("sem medidor, mostra só o estado vazio do grid — a área de análise não aparece", () => {
        renderPanel({ meterId: undefined })

        expect(screen.getByText("Nenhum medidor vinculado")).toBeInTheDocument()
        expect(screen.queryByText("Análise das grandezas")).not.toBeInTheDocument()
    })

    it("com medidor, mostra o grid e a área de análise das grandezas", () => {
        renderPanel({ meterId: "meter-1" })

        expect(screen.getByTestId("electrical-quantities-empty")).toBeInTheDocument()
        expect(screen.getByText("Análise das grandezas")).toBeInTheDocument()
    })
})
