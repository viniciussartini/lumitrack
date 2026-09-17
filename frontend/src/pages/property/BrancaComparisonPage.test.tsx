import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { BrancaComparisonPage } from "@/pages/property/BrancaComparisonPage"
import { propertyService } from "@/services/property.service"
import { consumptionService } from "@/services/consumption.service"
import type { Property } from "@/types/property.types"
import type { BrancaComparisonResponse } from "@/types/branca-comparison.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        getById: vi.fn(),
    },
}))

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        compareBrancaToConvencional: vi.fn(),
    },
}))

const mockWhiteProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    groupBModality: "WHITE",
    receivesBillingDiscount: false,
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: 18,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockComparison: BrancaComparisonResponse = {
    propertyId: "prop-1",
    from: "2026-06-01",
    to: "2026-08-01",
    months: [
        {
            monthStart: "2026-06-01T00:00:00.000Z",
            convencionalBrl: 400.79,
            brancaBrl: 359.56,
            diffBrl: 41.23,
        },
        {
            monthStart: "2026-07-01T00:00:00.000Z",
            convencionalBrl: 400.79,
            brancaBrl: 359.56,
            diffBrl: 41.23,
        },
    ],
    totalConvencionalBrl: 801.58,
    totalBrancaBrl: 719.12,
    totalDiffBrl: 82.46,
    diffPercent: 10.29,
    verdict: "BRANCA_CHEAPER",
}

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/propriedades/prop-1/comparacao-branca"]}>
                <Routes>
                    <Route
                        path="/propriedades/:id/comparacao-branca"
                        element={<BrancaComparisonPage />}
                    />
                    <Route path="/propriedades/:id" element={<div>Detalhes da propriedade</div>} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("BrancaComparisonPage — propriedade Convencional", () => {
    it("mostra EmptyState orientando a marcar a propriedade como Tarifa Branca", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue({
            ...mockWhiteProperty,
            groupBModality: "CONVENTIONAL",
        })

        renderPage()

        expect(
            await screen.findByText(/disponível só para propriedades na tarifa branca/i),
        ).toBeInTheDocument()
        expect(consumptionService.compareBrancaToConvencional).not.toHaveBeenCalled()
    })
})

describe("BrancaComparisonPage — propriedade na Tarifa Branca", () => {
    it("busca a comparação e mostra o veredito e os totais", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockWhiteProperty)
        vi.mocked(consumptionService.compareBrancaToConvencional).mockResolvedValue(mockComparison)

        renderPage()

        expect(await screen.findByText(/a tarifa branca saiu mais barata/i)).toBeInTheDocument()
        expect(screen.getByText("R$ 801,58")).toBeInTheDocument()
        expect(screen.getByText("R$ 719,12")).toBeInTheDocument()
        expect(consumptionService.compareBrancaToConvencional).toHaveBeenCalledWith(
            expect.objectContaining({ propertyId: "prop-1" }),
        )
    })

    it("lista os meses com o valor de cada cenário", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockWhiteProperty)
        vi.mocked(consumptionService.compareBrancaToConvencional).mockResolvedValue(mockComparison)

        renderPage()

        const heading = await screen.findByRole("heading", { name: /mês a mês/i })
        const table = heading.closest<HTMLElement>(".blueprint")!
        // 1 header + 2 meses
        expect(within(table).getAllByRole("row")).toHaveLength(3)
    })

    it("mostra a mensagem de erro do backend quando o catálogo não está cadastrado", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockWhiteProperty)
        vi.mocked(consumptionService.compareBrancaToConvencional).mockRejectedValue(
            new Error("Catálogo da Tarifa Branca não cadastrado para esta distribuidora"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(/catálogo da tarifa branca/i)
    })
})
