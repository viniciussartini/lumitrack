import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { AreaMenu } from "@/components/area/AreaMenu"
import { areaService } from "@/services/area.service"
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
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface RenderOptions {
    area?: Area
    showEdit?: boolean
    onAfterDelete?: () => void
}

const renderMenu = ({
    area = mockArea,
    showEdit,
    onAfterDelete,
}: RenderOptions = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AreaMenu
                    area={area}
                    showEdit={showEdit}
                    onAfterDelete={onAfterDelete}
                />
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Abrir/fechar menu
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaMenu — abrir/fechar", () => {
    it("começa fechado", () => {
        renderMenu()

        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("abre ao clicar no botão de opções", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Sala/i }),
        )

        expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("aria-expanded reflete o estado do menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        const trigger = screen.getByRole("button", {
            name: /opções de Sala/i,
        })
        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)

        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })

    it("aria-label inclui o nome da área (consistência com PropertyMenu)", () => {
        renderMenu({ area: { ...mockArea, name: "Cozinha gourmet" } })

        expect(
            screen.getByRole("button", { name: /opções de Cozinha gourmet/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item Editar
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaMenu — item Editar", () => {
    it("renderiza link de editar por default (showEdit=true)", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))

        const editLink = screen.getByRole("menuitem", { name: /editar/i })
        expect(editLink).toBeInTheDocument()
        expect(editLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/editar",
        )
    })

    it("não renderiza link de editar quando showEdit=false", async () => {
        const user = userEvent.setup()
        renderMenu({ showEdit: false })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))

        expect(
            screen.queryByRole("menuitem", { name: /editar/i }),
        ).not.toBeInTheDocument()

        // Ainda renderiza o item Excluir
        expect(
            screen.getByRole("menuitem", { name: /excluir/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmDialog — cascade
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaMenu — ConfirmDialog (cascade)", () => {
    it("abre ConfirmDialog ao clicar em Excluir", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        expect(
            screen.getByRole("heading", { name: /excluir área/i }),
        ).toBeInTheDocument()
    })

    it("texto do ConfirmDialog menciona dispositivos, registros de consumo E alertas", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        // Verifica os 3 elementos do cascade no aviso
        expect(screen.getByText(/dispositivos/i)).toBeInTheDocument()
        expect(screen.getByText(/registros de consumo/i)).toBeInTheDocument()
        expect(screen.getByText(/alertas/i)).toBeInTheDocument()
    })

    it("texto do ConfirmDialog inclui o nome da área", async () => {
        const user = userEvent.setup()
        renderMenu({ area: { ...mockArea, name: "Cozinha gourmet" } })

        await user.click(
            screen.getByRole("button", { name: /opções de Cozinha gourmet/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        // O nome aparece tanto no aria-label do botão quanto no texto do dialog.
        // Procuramos pela frase exata do dialog pra evitar ambiguidade:
        expect(
            screen.getByText(/tem certeza que deseja excluir "Cozinha gourmet"/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

describe("AreaMenu — exclusão", () => {
    it("chama o service ao confirmar exclusão", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderMenu()

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(areaService.delete).toHaveBeenCalledWith("prop-1", "area-1"),
        )
    })

    it("dispara onAfterDelete após exclusão bem-sucedida", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        const onAfterDelete = vi.fn()
        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() => expect(onAfterDelete).toHaveBeenCalledTimes(1))
    })

    it("não dispara onAfterDelete quando exclusão falha", async () => {
        vi.mocked(areaService.delete).mockRejectedValue(new Error("403"))
        const onAfterDelete = vi.fn()
        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() => expect(areaService.delete).toHaveBeenCalled())

        expect(onAfterDelete).not.toHaveBeenCalled()
    })

    it("funciona sem onAfterDelete (uso no AreaCard)", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderMenu({ onAfterDelete: undefined })

        await user.click(screen.getByRole("button", { name: /opções de Sala/i }))
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        // Não deve lançar — o callback é opcional
        await waitFor(() =>
            expect(areaService.delete).toHaveBeenCalledWith("prop-1", "area-1"),
        )
    })
})