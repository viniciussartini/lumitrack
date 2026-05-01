import { describe, it, expect } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import { DistributorCard } from "@/components/distributor/DistributorCard"
import type { Distributor } from "@/types/distributor.types"
import { vi } from "vitest"

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockDistributor: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderCard = (distributor = mockDistributor) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <DistributorCard distributor={distributor} />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

describe("DistributorCard — renderização", () => {
    it("exibe nome, CNPJ e dados principais", () => {
        renderCard()

        expect(screen.getByText("CEMIG Distribuição S.A.")).toBeInTheDocument()
        expect(screen.getByText("06.981.180/0001-16")).toBeInTheDocument()
        expect(screen.getByText(/0,75\/kWh/)).toBeInTheDocument()
        expect(screen.getByText("220 V")).toBeInTheDocument()
        expect(screen.getByText("Trifásico")).toBeInTheDocument()
    })

    it("exibe taxRate e publicLightingFee formatados", () => {
        renderCard()

        expect(screen.getByText("12%")).toBeInTheDocument()
        expect(screen.getByText(/45,90/)).toBeInTheDocument()
    })

    it("exibe travessão quando taxRate é null", () => {
        renderCard({ ...mockDistributor, taxRate: null })

        const impostoTerm = screen.getByText("Imposto:").closest("div")!
        expect(impostoTerm).toHaveTextContent("—")
    })

    it("o card linka para a rota de edição", () => {
        renderCard()

        const link = screen.getByRole("link", {
            name: /CEMIG Distribuição S\.A\./i,
        })
        expect(link).toHaveAttribute("href", "/distribuidoras/dist-1/editar")
    })

    it("renderiza o menu de opções", () => {
        renderCard()

        expect(
            screen.getByRole("button", {
                name: /opções de CEMIG Distribuição/i,
            }),
        ).toBeInTheDocument()
    })
})