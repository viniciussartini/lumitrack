import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { NewPropertyPage } from "@/pages/property/NewPropertyPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"
import type { Paginated } from "@/types/pagination.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
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

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 31,
})

const mockDistributor: Distributor = {
    id: "dist-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.4,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
            <MemoryRouter initialEntries={["/propriedades/nova"]}>
                <Routes>
                    <Route
                        path="/propriedades/nova"
                        element={<NewPropertyPage />}
                    />
                    <Route
                        path="/propriedades"
                        element={<div>Lista de propriedades</div>}
                    />
                    <Route
                        path="/distribuidoras"
                        element={<div>Catálogo de distribuidoras</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("NewPropertyPage — header", () => {
    it("renderiza título e link de voltar", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            screen.getByRole("heading", { name: /nova propriedade/i, level: 1 }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para propriedades/i }),
        ).toBeInTheDocument()
    })
})

describe("NewPropertyPage — sem distribuidoras", () => {
    it("exibe empty state quando o catálogo está vazio", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        expect(
            await screen.findByText(/catálogo de distribuidoras indisponível/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /ver catálogo de distribuidoras/i }),
        ).toHaveAttribute("href", "/distribuidoras")
    })

    it("não renderiza o form quando não há distribuidoras", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([]))

        renderPage()

        await screen.findByText(/catálogo de distribuidoras indisponível/i)

        expect(
            screen.queryByLabelText(/nome da propriedade/i),
        ).not.toBeInTheDocument()
    })
})

describe("NewPropertyPage — com distribuidoras", () => {
    it("renderiza o form quando há ao menos uma distribuidora", async () => {
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))

        renderPage()

        expect(
            await screen.findByLabelText(/nome da propriedade/i),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("button", { name: /cadastrar propriedade/i }),
        ).toBeInTheDocument()
    })

    it("submete payload completo e navega após sucesso", async () => {
        const user = userEvent.setup()
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))
        vi.mocked(propertyService.create).mockResolvedValue({
            id: "prop-1",
            userId: "user-1",
            distributorId: "dist-1",
            name: "Casa Principal",
            address: "Rua das Flores, 100",
            city: "Belo Horizonte",
            state: "MG",
            zipCode: "30000-000",
            electricalSystem: "MONOPHASIC",
            billingClass: "B1",
            publicLightingFeeBrl: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome da propriedade/i),
            "Casa Principal",
        )
        await user.selectOptions(
            screen.getByLabelText(/distribuidora vinculada/i),
            "dist-1",
        )
        await user.type(
            screen.getByLabelText(/logradouro/i),
            "Rua das Flores, 100",
        )
        await user.type(screen.getByLabelText(/cidade/i), "Belo Horizonte")
        await user.selectOptions(screen.getByLabelText(/uf/i), "MG")
        await user.type(screen.getByLabelText(/cep/i), "30000000")

        await user.click(
            screen.getByRole("button", { name: /cadastrar propriedade/i }),
        )

        await waitFor(() => {
            expect(propertyService.create).toHaveBeenCalledWith({
                distributorId: "dist-1",
                name: "Casa Principal",
                electricalSystem: "MONOPHASIC",
                billingClass: "B1",
                address: "Rua das Flores, 100",
                city: "Belo Horizonte",
                state: "MG",
                zipCode: "30000-000",
            })
        })

        expect(
            await screen.findByText(/lista de propriedades/i),
        ).toBeInTheDocument()
    })

    it("omite campos opcionais de endereço vazios do payload", async () => {
        const user = userEvent.setup()
        vi.mocked(distributorService.list).mockResolvedValue(paginated([mockDistributor]))
        vi.mocked(propertyService.create).mockResolvedValue({
            id: "prop-1",
            userId: "user-1",
            distributorId: "dist-1",
            name: "Casa Mínima",
            address: null,
            city: null,
            state: null,
            zipCode: null,
            electricalSystem: "MONOPHASIC",
            billingClass: "B1",
            publicLightingFeeBrl: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome da propriedade/i),
            "Casa Mínima",
        )
        await user.selectOptions(
            screen.getByLabelText(/distribuidora vinculada/i),
            "dist-1",
        )

        await user.click(
            screen.getByRole("button", { name: /cadastrar propriedade/i }),
        )

        await waitFor(() => {
            expect(propertyService.create).toHaveBeenCalledWith({
                distributorId: "dist-1",
                name: "Casa Mínima",
                electricalSystem: "MONOPHASIC",
                billingClass: "B1",
            })
        })
    })
})

describe("NewPropertyPage — erro ao carregar distribuidoras", () => {
    it("exibe ErrorState quando distributorService falha", async () => {
        vi.mocked(distributorService.list).mockRejectedValue(
            new Error("API caiu"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText(/api caiu/i)).toBeInTheDocument()
    })
})
