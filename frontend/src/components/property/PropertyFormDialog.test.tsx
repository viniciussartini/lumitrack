import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { propertyService } from "@/services/property.service"
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

const renderDialog = (
    props: Partial<React.ComponentProps<typeof PropertyFormDialog>> = {},
) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const onClose = vi.fn()

    render(
        <QueryClientProvider client={queryClient}>
            <PropertyFormDialog
                isOpen
                onClose={onClose}
                mode={{ kind: "create" }}
                distributors={[mockDistributor]}
                {...props}
            />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("PropertyFormDialog — criar", () => {
    it("abre com o título 'Adicionar propriedade'", () => {
        renderDialog()

        expect(
            screen.getByRole("dialog", { name: /adicionar propriedade/i }),
        ).toBeInTheDocument()
    })

    it("cria a propriedade e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome da propriedade/i), "Casa Nova")
        await user.selectOptions(
            screen.getByLabelText(/distribuidora vinculada/i),
            "dist-1",
        )
        await user.click(screen.getByRole("button", { name: /criar propriedade/i }))

        expect(propertyService.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Casa Nova", distributorId: "dist-1" }),
        )
        expect(onClose).toHaveBeenCalled()
    })
})

describe("PropertyFormDialog — editar", () => {
    it("abre com o título 'Editar propriedade' e campos pré-preenchidos", () => {
        renderDialog({ mode: { kind: "edit", property: mockProperty } })

        expect(
            screen.getByRole("dialog", { name: /editar propriedade/i }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText(/nome da propriedade/i)).toHaveValue(
            "Casa Principal",
        )
    })

    it("atualiza a propriedade e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.update).mockResolvedValue(mockProperty)

        const { onClose } = renderDialog({
            mode: { kind: "edit", property: mockProperty },
        })

        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        expect(propertyService.update).toHaveBeenCalledWith(
            "prop-1",
            expect.objectContaining({ name: "Casa Principal" }),
        )
        expect(onClose).toHaveBeenCalled()
    })

    it("não fecha o modal quando a mutation falha", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.update).mockRejectedValue(new Error("Falhou"))

        const { onClose } = renderDialog({
            mode: { kind: "edit", property: mockProperty },
        })

        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await screen.findByRole("dialog", { name: /editar propriedade/i })
        expect(onClose).not.toHaveBeenCalled()
    })
})
