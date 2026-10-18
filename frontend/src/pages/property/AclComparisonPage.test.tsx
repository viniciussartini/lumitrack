import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import { render, screen, within } from "@testing-library/react"
import { AclComparisonPage } from "@/pages/property/AclComparisonPage"
import { propertyService } from "@/services/property.service"
import { consumptionService } from "@/services/consumption.service"
import type { Property } from "@/types/property.types"
import type { AclComparisonResponse } from "@/types/acl-comparison.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        getById: vi.fn(),
    },
}))

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        compareAclToAcr: vi.fn(),
    },
}))

const mockAclProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Indústria",
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "TRIPHASIC",
    billingClass: null,
    groupBModality: null,
    receivesBillingDiscount: null,
    tariffGroup: "GROUP_A",
    contractingEnvironment: "ACL",
    tariffSubgroup: "A4",
    tariffModality: "GREEN",
    contractedDemandKw: 200,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockComparison: AclComparisonResponse = {
    propertyId: "prop-1",
    from: "2026-06-01",
    to: "2026-08-01",
    months: [
        { monthStart: "2026-06-01T00:00:00.000Z", acrBrl: 1000, aclBrl: 800, diffBrl: 200 },
        { monthStart: "2026-07-01T00:00:00.000Z", acrBrl: 1100, aclBrl: 900, diffBrl: 200 },
    ],
    totalAcrBrl: 2100,
    totalAclBrl: 1700,
    totalDiffBrl: 400,
    diffPercent: 19.05,
    verdict: "ACL_CHEAPER",
    pldContext: [
        {
            id: "pld-1",
            submarket: "SOUTHEAST_CENTER_WEST",
            referencePeriod: "2026-06-01T00:00:00.000Z",
            valuePerMwh: 186.4,
        },
    ],
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
            <MemoryRouter initialEntries={["/propriedades/prop-1/comparacao-acl"]}>
                <Routes>
                    <Route
                        path="/propriedades/:id/comparacao-acl"
                        element={<AclComparisonPage />}
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

describe("AclComparisonPage — propriedade cativa (ACR)", () => {
    it("mostra EmptyState orientando a marcar a propriedade como ACL", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue({
            ...mockAclProperty,
            contractingEnvironment: "ACR",
        })

        renderPage()

        expect(
            await screen.findByText(/disponível só para propriedades no mercado livre/i),
        ).toBeInTheDocument()
        expect(consumptionService.compareAclToAcr).not.toHaveBeenCalled()
    })
})

describe("AclComparisonPage — propriedade em ACL", () => {
    it("busca a comparação e mostra o veredito e os totais", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockAclProperty)
        vi.mocked(consumptionService.compareAclToAcr).mockResolvedValue(mockComparison)

        renderPage()

        expect(await screen.findByText(/o mercado livre saiu mais barato/i)).toBeInTheDocument()
        expect(screen.getByText("R$ 2.100,00")).toBeInTheDocument()
        expect(screen.getByText("R$ 1.700,00")).toBeInTheDocument()
        expect(consumptionService.compareAclToAcr).toHaveBeenCalledWith(
            expect.objectContaining({ propertyId: "prop-1" }),
        )
    })

    it("lista os meses com o valor de cada cenário", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockAclProperty)
        vi.mocked(consumptionService.compareAclToAcr).mockResolvedValue(mockComparison)

        renderPage()

        const heading = await screen.findByRole("heading", { name: /mês a mês/i })
        const table = heading.closest<HTMLElement>(".blueprint")!
        // 1 header + 2 meses
        expect(within(table).getAllByRole("row")).toHaveLength(3)
    })

    it("mostra o PLD do período como contexto informativo quando presente", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockAclProperty)
        vi.mocked(consumptionService.compareAclToAcr).mockResolvedValue(mockComparison)

        renderPage()

        expect(await screen.findByText(/contexto informativo/i)).toBeInTheDocument()
        expect(screen.getByText(/sudeste \/ centro-oeste/i)).toBeInTheDocument()
    })

    it("não mostra a seção de PLD quando não há cotação no período", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockAclProperty)
        vi.mocked(consumptionService.compareAclToAcr).mockResolvedValue({
            ...mockComparison,
            pldContext: [],
        })

        renderPage()

        await screen.findByRole("heading", { name: /mês a mês/i })
        expect(screen.queryByText(/contexto informativo/i)).not.toBeInTheDocument()
    })

    it("mostra a mensagem de erro do backend quando não há contrato vigente para o período", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockAclProperty)
        vi.mocked(consumptionService.compareAclToAcr).mockRejectedValue(
            new Error("Nenhum contrato de energia do Mercado Livre (ACL) vigente para o período"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toHaveTextContent(/nenhum contrato/i)
    })
})
