import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyComparisonSection } from "@/components/dashboard/PropertyComparisonSection"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionBucket, Granularity } from "@/types/consumption.types"
import type { Paginated } from "@/types/pagination.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: { list: vi.fn() },
}))

const property = (id: string, name: string): Property => ({
    id,
    userId: "user-1",
    distributorId: "dist-1",
    name,
    address: null,
    city: null,
    state: null,
    zipCode: null,
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
})

const propA = property("prop-a", "Casa")
const propB = property("prop-b", "Loja")

const bucket = (kwh: number): ConsumptionBucket => ({
    bucketStart: new Date().toISOString(),
    kwhConsumed: kwh,
    costBrl: kwh * 0.8,
    avgPowerW: 500,
})

const paginated = (items: ConsumptionBucket[]): Paginated<ConsumptionBucket> & { granularity: Granularity } => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 1,
    granularity: "month",
})

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

const renderSection = (properties: Property[]) => {
    const queryClient = createTestQueryClient()
    return render(<PropertyComparisonSection properties={properties} />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("PropertyComparisonSection", () => {
    it("não renderiza nada quando nenhuma propriedade tem dado de consumo", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([]))

        const { container } = renderSection([propA, propB])

        await waitFor(() => {
            expect(consumptionService.list).toHaveBeenCalledTimes(2)
        })
        expect(container).toBeEmptyDOMElement()
    })

    it("funciona com apenas 1 propriedade, sem quebrar", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([bucket(50)]))

        renderSection([propA])

        expect(await screen.findByText("Comparação entre propriedades")).toBeInTheDocument()
        expect(screen.getByText("Casa")).toBeInTheDocument()
        expect(screen.getByText("50,00 kWh")).toBeInTheDocument()
    })

    it("lista uma barra por propriedade com dado, ignorando a que não tem medidor (404)", async () => {
        vi.mocked(consumptionService.list).mockImplementation(async ({ targetId }) => {
            if (targetId === "prop-a") return paginated([bucket(100)])
            throw new Error("Alvo sem medidor vinculado")
        })

        renderSection([propA, propB])

        expect(await screen.findByText("Casa")).toBeInTheDocument()
        expect(screen.queryByText("Loja")).not.toBeInTheDocument()
    })

    it("troca a unidade de comparação entre kWh e R$", async () => {
        vi.mocked(consumptionService.list).mockResolvedValue(paginated([bucket(100)]))

        renderSection([propA])
        await screen.findByText("100,00 kWh")

        const user = userEvent.setup()
        await user.click(screen.getByRole("button", { name: "R$" }))

        expect(screen.getByText(/R\$\s?80,00/)).toBeInTheDocument()
    })
})
