import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { AreaFormDialog } from "@/components/area/AreaFormDialog"
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
    extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "Erro"),
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

const renderDialog = (props: Partial<React.ComponentProps<typeof AreaFormDialog>> = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const onClose = vi.fn()

    render(
        <QueryClientProvider client={queryClient}>
            <AreaFormDialog
                isOpen
                onClose={onClose}
                mode={{ kind: "create", propertyId: "prop-1" }}
                {...props}
            />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("AreaFormDialog — criar", () => {
    it("abre com o título 'Adicionar área'", () => {
        renderDialog()

        expect(screen.getByRole("dialog", { name: /adicionar área/i })).toBeInTheDocument()
    })

    it("cria a área e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.create).mockResolvedValue(mockArea)

        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome da área/i), "Cozinha")
        await user.click(screen.getByRole("button", { name: /criar área/i }))

        expect(areaService.create).toHaveBeenCalledWith(
            "prop-1",
            expect.objectContaining({ name: "Cozinha" }),
        )
        expect(onClose).toHaveBeenCalled()
    })
})

describe("AreaFormDialog — editar", () => {
    it("abre com o título 'Editar área' e campos pré-preenchidos", () => {
        renderDialog({
            mode: { kind: "edit", propertyId: "prop-1", area: mockArea },
        })

        expect(screen.getByRole("dialog", { name: /editar área/i })).toBeInTheDocument()
        expect(screen.getByLabelText(/nome da área/i)).toHaveValue("Sala")
    })

    it("atualiza a área e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.update).mockResolvedValue(mockArea)

        const { onClose } = renderDialog({
            mode: { kind: "edit", propertyId: "prop-1", area: mockArea },
        })

        await user.click(screen.getByRole("button", { name: /salvar área/i }))

        expect(areaService.update).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            expect.objectContaining({ name: "Sala" }),
        )
        expect(onClose).toHaveBeenCalled()
    })

    it("não fecha o modal quando a mutation falha", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.update).mockRejectedValue(new Error("Falhou"))

        const { onClose } = renderDialog({
            mode: { kind: "edit", propertyId: "prop-1", area: mockArea },
        })

        await user.click(screen.getByRole("button", { name: /salvar área/i }))

        await screen.findByRole("dialog", { name: /editar área/i })
        expect(onClose).not.toHaveBeenCalled()
    })
})
