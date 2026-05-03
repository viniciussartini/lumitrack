import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { PropertyMenu } from "@/components/property/PropertyMenu"
import { propertyService } from "@/services/property.service"
import { toast } from "sonner"
import type { Property } from "@/types/property.types"

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

interface RenderOptions {
    showEdit?: boolean
    onAfterDelete?: () => void
}

const renderMenu = (options: RenderOptions = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <PropertyMenu property={mockProperty} {...options} />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Abertura/fechamento do menu
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyMenu — abertura do menu", () => {
    it("começa fechado", () => {
        renderMenu()

        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("abre ao clicar no botão de opções", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )

        expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("aria-expanded reflete o estado do menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        const trigger = screen.getByRole("button", {
            name: /opções de Casa Principal/i,
        })

        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)

        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item "Editar" (controlado por prop showEdit)
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyMenu — item Editar", () => {
    it("mostra o item Editar por padrão (showEdit não passado)", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )

        expect(
            screen.getByRole("menuitem", { name: /editar/i }),
        ).toBeInTheDocument()
    })

    it("link Editar aponta para a rota de edição", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )

        const editLink = screen.getByRole("menuitem", { name: /editar/i })

        expect(editLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/editar",
        )
    })

    it("não mostra o item Editar quando showEdit=false", async () => {
        const user = userEvent.setup()
        renderMenu({ showEdit: false })

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )

        // Confere que não há "Editar" — mas Excluir continua presente.
        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).not.toBeInTheDocument()
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })

    it("Editar aparece ANTES de Excluir na ordem do menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )

        const items = screen.getAllByRole("menuitem")
        // Editar deve ser o primeiro item, Excluir o segundo
        expect(items[0]).toHaveTextContent(/editar/i)
        expect(items[1]).toHaveTextContent(/excluir/i)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de exclusão
// ─────────────────────────────────────────────────────────────────────────────

describe("PropertyMenu — exclusão", () => {
    it("abre ConfirmDialog ao clicar em Excluir no menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        expect(
            screen.getByRole("heading", { name: /excluir propriedade/i }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/tem certeza que deseja excluir "Casa Principal"/i),
        ).toBeInTheDocument()
    })

    it("dispara mutation ao confirmar exclusão", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(propertyService.delete).toHaveBeenCalledWith("prop-1")
        })
    })

    it("fecha o dialog após exclusão bem-sucedida", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)

        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        })
    })

    it("chama onAfterDelete após exclusão bem-sucedida", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)
        const onAfterDelete = vi.fn()

        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(onAfterDelete).toHaveBeenCalledTimes(1)
        })
    })

    it("NÃO chama onAfterDelete quando exclusão falha", async () => {
        vi.mocked(propertyService.delete).mockRejectedValue(
            new Error("Internal error"),
        )
        const onAfterDelete = vi.fn()

        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled()
        })

        expect(onAfterDelete).not.toHaveBeenCalled()
    })

    it("mostra toast de erro genérico quando o delete falha", async () => {
        vi.mocked(propertyService.delete).mockRejectedValue(
            new Error("Internal error"),
        )

        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: "Excluir" }))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao excluir",
                expect.objectContaining({
                    description: expect.stringContaining("Internal error"),
                }),
            )
        })
    })

    it("cancela exclusão ao clicar em Cancelar no dialog", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Casa Principal/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        expect(screen.getByRole("dialog")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: /cancelar/i }))

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        })

        expect(propertyService.delete).not.toHaveBeenCalled()
    })
})