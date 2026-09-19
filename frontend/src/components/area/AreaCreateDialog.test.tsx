import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { AreaCreateDialog } from "@/components/area/AreaCreateDialog"
import { areaService } from "@/services/area.service"
import type { Area } from "@/types/area.types"
import type { PropertyTreeNode } from "@/types/property.types"

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

const property = (id: string, name: string): PropertyTreeNode => ({ id, name, areas: [] })

const PROPERTIES = [property("prop-1", "Casa Principal"), property("prop-2", "Loja Centro")]

const createdArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Cozinha",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderDialog = (props: Partial<React.ComponentProps<typeof AreaCreateDialog>> = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    const onClose = vi.fn()

    render(
        <QueryClientProvider client={queryClient}>
            <AreaCreateDialog isOpen onClose={onClose} properties={PROPERTIES} {...props} />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("AreaCreateDialog", () => {
    it("abre como 'Adicionar área' com o seletor de propriedade como primeiro campo", () => {
        renderDialog()

        expect(screen.getByRole("dialog", { name: /adicionar área/i })).toBeInTheDocument()
        const select = screen.getByLabelText("Propriedade")
        expect(select).toHaveValue("prop-1")
        expect(screen.getByRole("option", { name: "Casa Principal" })).toBeInTheDocument()
        expect(screen.getByRole("option", { name: "Loja Centro" })).toBeInTheDocument()
    })

    it("cria a área na primeira propriedade quando o usuário não troca a seleção", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.create).mockResolvedValue(createdArea)
        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome da área/i), "Cozinha")
        await user.click(screen.getByRole("button", { name: /criar área/i }))

        expect(areaService.create).toHaveBeenCalledWith("prop-1", { name: "Cozinha" })
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("cria a área na propriedade escolhida no seletor", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.create).mockResolvedValue({ ...createdArea, propertyId: "prop-2" })
        renderDialog()

        await user.selectOptions(screen.getByLabelText("Propriedade"), "prop-2")
        await user.type(screen.getByLabelText(/nome da área/i), "Estoque")
        await user.click(screen.getByRole("button", { name: /criar área/i }))

        expect(areaService.create).toHaveBeenCalledWith("prop-2", { name: "Estoque" })
    })

    it("volta a selecionar a primeira propriedade ao reabrir o modal", async () => {
        const user = userEvent.setup()
        const queryClient = new QueryClient()
        const tree = (isOpen: boolean) => (
            <QueryClientProvider client={queryClient}>
                <AreaCreateDialog isOpen={isOpen} onClose={vi.fn()} properties={PROPERTIES} />
            </QueryClientProvider>
        )
        const { rerender } = render(tree(true))

        await user.selectOptions(screen.getByLabelText("Propriedade"), "prop-2")
        rerender(tree(false))
        rerender(tree(true))

        expect(screen.getByLabelText("Propriedade")).toHaveValue("prop-1")
    })

    it("sem nenhuma propriedade, explica e não oferece o formulário", () => {
        renderDialog({ properties: [] })

        expect(screen.getByText(/nenhuma propriedade cadastrada/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/nome da área/i)).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /criar área/i })).not.toBeInTheDocument()
        expect(areaService.create).not.toHaveBeenCalled()
    })
})
