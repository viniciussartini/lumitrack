import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { EditPropertyPage } from "@/pages/property/EditPropertyPage"
import { propertyService } from "@/services/property.service"
import { distributorService } from "@/services/distributor.service"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"

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

const mockDistributor1: Distributor = {
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

const mockDistributor2: Distributor = {
    ...mockDistributor1,
    id: "dist-2",
    name: "ENEL São Paulo",
    cnpj: "61.695.227/0001-93",
}

const mockProperty: Property = {
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

const renderPage = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/propriedades/prop-1/editar"]}>
                <Routes>
                    <Route
                        path="/propriedades/:id/editar"
                        element={<EditPropertyPage />}
                    />
                    <Route
                        path="/propriedades"
                        element={<div>Lista de propriedades</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("EditPropertyPage — header", () => {
    it("renderiza título e link de voltar", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.list).mockResolvedValue([mockDistributor1])

        renderPage()

        expect(
            screen.getByRole("heading", {
                name: /editar propriedade/i,
                level: 1,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para propriedades/i }),
        ).toBeInTheDocument()
    })
})

describe("EditPropertyPage — loading", () => {
    it("exibe skeleton enquanto carrega", () => {
        vi.mocked(propertyService.getById).mockReturnValue(
            new Promise(() => {}),
        )
        vi.mocked(distributorService.list).mockReturnValue(
            new Promise(() => {}),
        )

        renderPage()

        expect(screen.getByLabelText(/carregando dados/i)).toBeInTheDocument()
    })
})

describe("EditPropertyPage — erro", () => {
    it("exibe ErrorState quando getById falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Propriedade não encontrada"),
        )
        vi.mocked(distributorService.list).mockResolvedValue([mockDistributor1])

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(
            screen.getByText(/propriedade não encontrada/i),
        ).toBeInTheDocument()
    })

    it("exibe ErrorState quando distributors falha", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.list).mockRejectedValue(
            new Error("API caiu"),
        )

        renderPage()

        expect(await screen.findByRole("alert")).toBeInTheDocument()
        expect(screen.getByText(/api caiu/i)).toBeInTheDocument()
    })
})

describe("EditPropertyPage — sucesso", () => {
    it("preenche o form com os dados da propriedade", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.list).mockResolvedValue([
            mockDistributor1,
            mockDistributor2,
        ])

        renderPage()

        await waitFor(() => {
            expect(screen.getByLabelText(/nome da propriedade/i)).toHaveValue(
                "Casa Principal",
            )
        })

        expect(screen.getByLabelText(/logradouro/i)).toHaveValue(
            "Rua das Flores, 100",
        )
        expect(screen.getByLabelText(/cidade/i)).toHaveValue("Belo Horizonte")
        expect(screen.getByLabelText(/cep/i)).toHaveValue("30000-000")
    })

    it("submete update e navega após sucesso", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.list).mockResolvedValue([mockDistributor1])
        vi.mocked(propertyService.update).mockResolvedValue({
            ...mockProperty,
            name: "Casa Renovada",
        })

        renderPage()

        const nameInput = await screen.findByLabelText(/nome da propriedade/i)
        await user.clear(nameInput)
        await user.type(nameInput, "Casa Renovada")

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(propertyService.update).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({
                    name: "Casa Renovada",
                    distributorId: "dist-1",
                }),
            )
        })

        expect(
            await screen.findByText(/lista de propriedades/i),
        ).toBeInTheDocument()
    })

    it("permite trocar a distribuidora vinculada", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
        vi.mocked(distributorService.list).mockResolvedValue([
            mockDistributor1,
            mockDistributor2,
        ])
        vi.mocked(propertyService.update).mockResolvedValue({
            ...mockProperty,
            distributorId: "dist-2",
        })

        renderPage()

        const select = await screen.findByLabelText(/distribuidora vinculada/i)
        await user.selectOptions(select, "dist-2")

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() => {
            expect(propertyService.update).toHaveBeenCalledWith(
                "prop-1",
                expect.objectContaining({ distributorId: "dist-2" }),
            )
        })
    })
})