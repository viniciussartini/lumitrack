import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import { PropertyCard } from "@/components/property/PropertyCard"
import type { Property } from "@/types/property.types"

// PropertyMenu (renderizado pelo Card) usa propertyService internamente.
// Não exercitamos delete aqui; só precisamos que o módulo carregue sem
// quebrar. Os testes de delete vivem em PropertyMenu.test.tsx.
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
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const baseProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderCard = (
    property: Property = baseProperty,
    distributorName = "CEMIG Distribuição",
) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <PropertyCard
                    property={property}
                    distributorName={distributorName}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

describe("PropertyCard — conteúdo principal", () => {
    it("renderiza o nome da propriedade como heading", () => {
        renderCard()

        expect(
            screen.getByRole("heading", { level: 3, name: /casa principal/i }),
        ).toBeInTheDocument()
    })

    it("renderiza o nome da distribuidora", () => {
        renderCard(baseProperty, "CEMIG Distribuição S.A.")

        expect(
            screen.getByText(/cemig distribuição s\.a\./i),
        ).toBeInTheDocument()
    })

    it("renderiza o endereço completo formatado", () => {
        renderCard()

        expect(
            screen.getByText("Rua das Flores, 100, Belo Horizonte/MG"),
        ).toBeInTheDocument()
    })
})

describe("PropertyCard — endereço parcial", () => {
    it("formata só com cidade/UF quando não tem rua", () => {
        renderCard({ ...baseProperty, address: null })

        expect(screen.getByText("Belo Horizonte/MG")).toBeInTheDocument()
    })

    it("formata só com cidade quando não tem UF", () => {
        renderCard({ ...baseProperty, address: null, state: null })

        expect(screen.getByText("Belo Horizonte")).toBeInTheDocument()
    })

    it("formata só com UF quando não tem cidade", () => {
        renderCard({ ...baseProperty, address: null, city: null })

        expect(screen.getByText("MG")).toBeInTheDocument()
    })

    it("não renderiza linha de endereço quando todos os campos estão vazios", () => {
        renderCard({
            ...baseProperty,
            address: null,
            city: null,
            state: null,
        })

        expect(screen.queryByText(/rua/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/belo horizonte/i)).not.toBeInTheDocument()
    })
})

describe("PropertyCard — navegação", () => {
    it("link aponta para a página de detalhes (não mais para edição)", () => {
        renderCard()

        const link = screen.getByTestId("property-card-prop-1")

        expect(link).toHaveAttribute("href", "/propriedades/prop-1")
    })

    it("usa o id correto no data-testid", () => {
        renderCard({ ...baseProperty, id: "outro-id" })

        expect(screen.getByTestId("property-card-outro-id")).toBeInTheDocument()
    })
})

describe("PropertyCard — fallback de distribuidora", () => {
    it("renderiza o texto de fallback quando distributorName vem como 'Distribuidora removida'", () => {
        renderCard(baseProperty, "Distribuidora removida")

        expect(screen.getByText(/distribuidora removida/i)).toBeInTheDocument()
    })
})

describe("PropertyCard — menu de ações", () => {
    it("renderiza o menu de opções da propriedade", () => {
        renderCard()

        expect(
            screen.getByRole("button", {
                name: /opções de Casa Principal/i,
            }),
        ).toBeInTheDocument()
    })
})