import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { AreaDetailsPage } from "@/pages/area/AreaDetailsPage"
import { areaService } from "@/services/area.service"
import { propertyService } from "@/services/property.service"
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal de convivência",
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
                initialEntries={["/propriedades/prop-1/areas/area-1"]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<AreaDetailsPage />}
                    />
                    <Route
                        path="/propriedades/:id"
                        element={<div>Detalhes da propriedade</div>}
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

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — loading", () => {
    it("renderiza skeleton enquanto a área carrega", () => {
        vi.mocked(areaService.getById).mockReturnValue(new Promise(() => {}))
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(screen.queryByText(/sala/i)).not.toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para propriedade/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Erro fatal
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — erro fatal (área)", () => {
    it("renderiza ErrorState quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Área não encontrada"),
        )
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        renderPage()

        expect(
            await screen.findByText(/área não encontrada/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — header", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o nome da área como heading principal", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /sala/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza a descrição quando presente", async () => {
        renderPage()

        expect(
            await screen.findByText(/área principal de convivência/i),
        ).toBeInTheDocument()
    })

    it("não renderiza descrição quando é null", async () => {
        vi.mocked(areaService.getById).mockResolvedValue({
            ...mockArea,
            description: null,
        })

        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })
        expect(
            screen.queryByText(/área principal/i),
        ).not.toBeInTheDocument()
    })

    it("renderiza chip com nome da propriedade pai", async () => {
        renderPage()

        expect(
            await screen.findByText(/casa principal/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — botão Editar área
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — botão Editar área", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza link 'Editar área' apontando para a página de edição", async () => {
        renderPage()

        const editLink = await screen.findByRole("link", {
            name: /editar área/i,
        })

        expect(editLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/editar",
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header — menu ⋯
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — menu ⋯", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza o botão de opções (AreaMenu) com o nome da área", async () => {
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        expect(
            screen.getByRole("button", { name: /opções de Sala/i }),
        ).toBeInTheDocument()
    })

    it("menu NÃO mostra item 'Editar' (já existe botão dedicado no header)", async () => {
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await user.click(
            screen.getByRole("button", { name: /opções de Sala/i }),
        )

        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).not.toBeInTheDocument()

        // Mas mostra o item Excluir
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })

    it("após excluir, navega de volta para a propriedade pai", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await user.click(
            screen.getByRole("button", { name: /opções de Sala/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        expect(
            await screen.findByText(/detalhes da propriedade/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chip — fallbacks
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — chip da propriedade", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
    })

    it("mostra fallback quando a query da property falha", async () => {
        vi.mocked(propertyService.getById).mockRejectedValue(
            new Error("Propriedade removida"),
        )

        renderPage()

        await screen.findByRole("heading", { level: 1, name: /sala/i })

        await waitFor(() =>
            expect(
                screen.getByText(/propriedade não disponível/i),
            ).toBeInTheDocument(),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Seção de Devices — placeholder
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — seção de dispositivos", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("renderiza seção 'Dispositivos' como heading", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 2,
                name: /dispositivos/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza EmptyState informando que não há dispositivos", async () => {
        renderPage()

        expect(
            await screen.findByText(/nenhum dispositivo cadastrado/i),
        ).toBeInTheDocument()
    })

    it("botão 'Adicionar dispositivo' está desabilitado (em breve)", async () => {
        renderPage()

        const addButton = await screen.findByRole("button", {
            name: /adicionar dispositivo/i,
        })

        expect(addButton).toBeDisabled()
    })

    it("renderiza a marca 'Em breve' explicitamente", async () => {
        renderPage()

        expect(
            await screen.findByTestId("devices-coming-soon"),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Navegação — voltar
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaDetailsPage — navegação", () => {
    beforeEach(() => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)
    })

    it("link de voltar aponta para a propriedade pai", async () => {
        renderPage()

        const backLink = await screen.findByRole("link", {
            name: /voltar para propriedade/i,
        })

        expect(backLink).toHaveAttribute("href", "/propriedades/prop-1")
    })
})