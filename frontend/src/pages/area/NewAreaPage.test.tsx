import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { NewAreaPage } from "@/pages/area/NewAreaPage"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
import { toast } from "sonner"
import type { Area } from "@/types/area.types"
import type { Property } from "@/types/property.types"

vi.mock("@/services/area.service", () => ({
    areaService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

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

const mockProperty: Property = {
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
}

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
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
            <MemoryRouter
                initialEntries={["/propriedades/prop-1/areas/nova"]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/nova"
                        element={<NewAreaPage />}
                    />
                    <Route
                        path="/propriedades/:id"
                        element={<div>Detalhes da propriedade</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
})

describe("NewAreaPage — renderização", () => {
    it("renderiza heading e link de voltar", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /nova área/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para propriedade/i }),
        ).toBeInTheDocument()
    })

    it("inclui o nome da propriedade pai no subtítulo", async () => {
        renderPage()

        expect(
            await screen.findByText(/casa principal/i),
        ).toBeInTheDocument()
    })

    it("link de voltar aponta para a propriedade pai", async () => {
        renderPage()

        const backLink = screen.getByRole("link", {
            name: /voltar para propriedade/i,
        })

        expect(backLink).toHaveAttribute("href", "/propriedades/prop-1")
    })
})

describe("NewAreaPage — propriedade não carrega", () => {
    it("mostra erro quando o fetch da propriedade falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Propriedade não encontrada"),
        )

        renderPage()

        expect(
            await screen.findByText(/propriedade não encontrada/i),
        ).toBeInTheDocument()
    })

    it("não renderiza o form quando o fetch da propriedade falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Não encontrada"),
        )

        renderPage()

        await screen.findByText(/não encontrada/i)

        expect(
            screen.queryByLabelText(/nome da área/i),
        ).not.toBeInTheDocument()
    })
})

describe("NewAreaPage — submit", () => {
    it("submete payload com name e description e navega para a propriedade", async () => {
        vi.mocked(areaService.create).mockResolvedValue(mockArea)
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome da área/i),
            "Sala",
        )
        await user.type(
            screen.getByLabelText(/descrição/i),
            "Área de convivência",
        )
        await user.click(
            screen.getByRole("button", { name: /cadastrar área/i }),
        )

        await waitFor(() =>
            expect(areaService.create).toHaveBeenCalledWith("prop-1", {
                name: "Sala",
                description: "Área de convivência",
            }),
        )

        // Após sucesso, navega — a página de destino renderiza
        expect(
            await screen.findByText(/detalhes da propriedade/i),
        ).toBeInTheDocument()
    })

    it("omite description do payload quando vazia", async () => {
        vi.mocked(areaService.create).mockResolvedValue(mockArea)
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome da área/i),
            "Sala",
        )
        await user.click(
            screen.getByRole("button", { name: /cadastrar área/i }),
        )

        await waitFor(() =>
            expect(areaService.create).toHaveBeenCalledWith("prop-1", {
                name: "Sala",
            }),
        )
    })

    it("dispara toast.error quando o servidor falha", async () => {
        vi.mocked(areaService.create).mockRejectedValue(
            new Error("Erro do servidor"),
        )
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome da área/i),
            "Sala",
        )
        await user.click(
            screen.getByRole("button", { name: /cadastrar área/i }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao criar área",
                expect.objectContaining({
                    description: "Erro do servidor",
                }),
            ),
        )
    })
})