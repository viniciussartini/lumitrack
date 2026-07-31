import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { render, screen } from "@testing-library/react"
import { AreaCard } from "@/components/area/AreaCard"
import type { Area } from "@/types/area.types"

// O AreaMenu acoplado ao card usa useDeleteArea, que depende do areaService.
// Como esses testes não exercitam exclusão, mockamos o módulo para evitar
// imports/efeitos colaterais durante o setup do hook.
vi.mock("@/services/area.service", () => ({
    areaService: {
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

const baseArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderCard = (area: Area = baseArea) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AreaCard area={area} />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

describe("AreaCard — conteúdo principal", () => {
    it("renderiza o nome da área como heading", () => {
        renderCard()

        expect(
            screen.getByRole("heading", { level: 3, name: /sala/i }),
        ).toBeInTheDocument()
    })

    it("renderiza a descrição quando presente", () => {
        renderCard()

        expect(
            screen.getByText(/área principal de convivência/i),
        ).toBeInTheDocument()
    })

    it("não renderiza descrição quando é null", () => {
        renderCard({ ...baseArea, description: null })

        expect(
            screen.queryByText(/área principal/i),
        ).not.toBeInTheDocument()
    })
})

describe("AreaCard — navegação", () => {
    it("link aponta para a página de detalhes da área", () => {
        renderCard()

        const link = screen.getByTestId("area-card-area-1")

        expect(link).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })

    it("usa o id correto no data-testid", () => {
        renderCard({ ...baseArea, id: "outro-id" })

        expect(screen.getByTestId("area-card-outro-id")).toBeInTheDocument()
    })

    it("usa o propertyId correto na URL do link (caso área pertença a outra propriedade)", () => {
        renderCard({ ...baseArea, propertyId: "prop-9" })

        const link = screen.getByTestId("area-card-area-1")

        expect(link).toHaveAttribute(
            "href",
            "/propriedades/prop-9/areas/area-1",
        )
    })
})

describe("AreaCard — menu acoplado", () => {
    it("expõe o botão de opções com o nome da área no aria-label", () => {
        renderCard()

        // aria-label dinâmico — espelha o padrão do PropertyMenu
        expect(
            screen.getByRole("button", { name: /opções de Sala/i }),
        ).toBeInTheDocument()
    })
})