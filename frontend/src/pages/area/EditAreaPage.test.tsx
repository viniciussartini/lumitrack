import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { EditAreaPage } from "@/pages/area/EditAreaPage"
import { areaService } from "@/services/area.service"
import { toast } from "sonner"
import type { Area } from "@/types/area.types"

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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal",
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
                initialEntries={[
                    "/propriedades/prop-1/areas/area-1/editar",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/editar"
                        element={<EditAreaPage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<div>Detalhes da área</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("EditAreaPage — renderização", () => {
    it("renderiza heading e link de voltar", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)

        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /editar área/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para área/i }),
        ).toBeInTheDocument()
    })

    it("link de voltar aponta para a página de detalhes da área", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        const backLink = screen.getByRole("link", {
            name: /voltar para área/i,
        })

        expect(backLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })

    it("preenche o form com os dados da área", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)

        renderPage()

        expect(
            await screen.findByDisplayValue(/^sala$/i),
        ).toBeInTheDocument()
        expect(
            screen.getByDisplayValue(/área principal/i),
        ).toBeInTheDocument()
    })
})

describe("EditAreaPage — área não carrega", () => {
    it("mostra erro quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Área não encontrada"),
        )

        renderPage()

        expect(
            await screen.findByText(/área não encontrada/i),
        ).toBeInTheDocument()
    })

    it("não renderiza o form quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Não encontrada"),
        )

        renderPage()

        await screen.findByText(/não encontrada/i)

        expect(
            screen.queryByLabelText(/nome da área/i),
        ).not.toBeInTheDocument()
    })
})

describe("EditAreaPage — submit", () => {
    it("submete payload com mudanças e navega para a página de detalhes da área", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(areaService.update).mockResolvedValue({
            ...mockArea,
            name: "Sala renovada",
        })

        const user = userEvent.setup()
        renderPage()

        const nameInput = await screen.findByLabelText(/nome da área/i)
        await user.clear(nameInput)
        await user.type(nameInput, "Sala renovada")

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() =>
            expect(areaService.update).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                {
                    name: "Sala renovada",
                    description: "Área principal",
                },
            ),
        )

        // Após sucesso, navega
        expect(
            await screen.findByText(/detalhes da área/i),
        ).toBeInTheDocument()
    })

    it("dispara toast.error quando o servidor falha", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        vi.mocked(areaService.update).mockRejectedValue(
            new Error("Forbidden"),
        )

        const user = userEvent.setup()
        renderPage()

        await screen.findByDisplayValue(/^sala$/i)

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao atualizar área",
                expect.objectContaining({ description: "Forbidden" }),
            ),
        )
    })
})