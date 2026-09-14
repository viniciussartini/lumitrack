import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { PropertyFormDialog } from "@/components/property/PropertyFormDialog"
import { propertyService } from "@/services/property.service"
import { aclContractService } from "@/services/acl-contract.service"
import type { Property } from "@/types/property.types"
import type { Distributor } from "@/types/distributor.types"
import type { AclContract } from "@/types/acl-contract.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/acl-contract.service", () => ({
    aclContractService: {
        listByProperty: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 31 }),
        create: vi.fn(),
        update: vi.fn(),
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
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const mockAclProperty: Property = {
    ...mockProperty,
    id: "prop-acl",
    tariffGroup: "GROUP_A",
    billingClass: null,
    tariffSubgroup: "A4",
    tariffModality: "GREEN",
    contractedDemandKw: 200,
    contractingEnvironment: "ACL",
}

const mockAclContract: AclContract = {
    id: "contract-1",
    userId: "user-1",
    propertyId: "prop-acl",
    retailerName: "Comerc Energia",
    submarket: "SOUTHEAST_CENTER_WEST",
    energySource: "CONVENTIONAL",
    energyPricePerMwh: 280,
    contractedVolumeMwh: 120,
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderDialog = (props: Partial<React.ComponentProps<typeof PropertyFormDialog>> = {}) => {
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

        expect(screen.getByRole("dialog", { name: /adicionar propriedade/i })).toBeInTheDocument()
    })

    it("cria a propriedade e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome da propriedade/i), "Casa Nova")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.click(screen.getByRole("button", { name: /criar propriedade/i }))

        expect(propertyService.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Casa Nova", distributorId: "dist-1" }),
        )
        expect(onClose).toHaveBeenCalled()
    })
})

describe("PropertyFormDialog — editar", () => {
    it("abre com o título 'Editar propriedade' e campos pré-preenchidos", async () => {
        renderDialog({ mode: { kind: "edit", property: mockProperty } })

        expect(screen.getByRole("dialog", { name: /editar propriedade/i })).toBeInTheDocument()
        // O form só monta depois que a busca do contrato ACL corrente resolve
        // (guard de loading em PropertyFormDialog — roda pra qualquer edição,
        // não só de propriedade já em ACL, ver usePropertyFormSubmit).
        expect(await screen.findByLabelText(/nome da propriedade/i)).toHaveValue("Casa Principal")
    })

    it("atualiza a propriedade e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.update).mockResolvedValue(mockProperty)

        const { onClose } = renderDialog({
            mode: { kind: "edit", property: mockProperty },
        })

        await user.click(await screen.findByRole("button", { name: /salvar alterações/i }))

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

        await user.click(await screen.findByRole("button", { name: /salvar alterações/i }))

        await screen.findByRole("dialog", { name: /editar propriedade/i })
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe("PropertyFormDialog — contrato ACL", () => {
    it("cria a propriedade e o contrato ACL, nessa ordem, quando o ambiente é livre", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.create).mockResolvedValue(mockAclProperty)
        vi.mocked(aclContractService.create).mockResolvedValue(mockAclContract)

        renderDialog()

        await user.type(screen.getByLabelText(/nome da propriedade/i), "Indústria")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.selectOptions(screen.getByLabelText(/grupo tarifário/i), "GROUP_A")
        await user.selectOptions(screen.getByLabelText(/^subgrupo/i), "A4")
        await user.type(screen.getByLabelText(/demanda contratada/i), "200")
        await user.selectOptions(screen.getByLabelText(/ambiente de contratação/i), "ACL")
        await user.type(screen.getByLabelText(/comercializadora/i), "Comerc Energia")
        await user.selectOptions(screen.getByLabelText(/^submercado/i), "SOUTHEAST_CENTER_WEST")
        await user.type(screen.getByLabelText(/preço da energia/i), "280")
        await user.type(screen.getByLabelText(/volume contratado/i), "120")
        await user.selectOptions(screen.getByLabelText(/fonte contratada/i), "CONVENTIONAL")

        await user.click(screen.getByRole("button", { name: /criar propriedade/i }))

        expect(propertyService.create).toHaveBeenCalledWith(
            expect.objectContaining({ contractingEnvironment: "ACL" }),
        )
        await vi.waitFor(() =>
            expect(aclContractService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    propertyId: "prop-acl",
                    retailerName: "Comerc Energia",
                    submarket: "SOUTHEAST_CENTER_WEST",
                    energyPricePerMwh: 280,
                    contractedVolumeMwh: 120,
                }),
            ),
        )
    })

    it("não cria contrato ACL quando o ambiente continua cativo", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome da propriedade/i), "Casa")
        await user.selectOptions(screen.getByLabelText(/distribuidora vinculada/i), "dist-1")
        await user.click(screen.getByRole("button", { name: /criar propriedade/i }))

        expect(onClose).toHaveBeenCalled()
        expect(aclContractService.create).not.toHaveBeenCalled()
    })

    it("atualiza o contrato ACL existente em vez de criar outro", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.update).mockResolvedValue(mockAclProperty)
        vi.mocked(aclContractService.listByProperty).mockResolvedValue({
            items: [mockAclContract],
            total: 1,
            page: 1,
            pageSize: 31,
        })
        vi.mocked(aclContractService.update).mockResolvedValue(mockAclContract)

        renderDialog({ mode: { kind: "edit", property: mockAclProperty } })

        await screen.findByDisplayValue("Comerc Energia")
        await user.clear(screen.getByLabelText(/preço da energia/i))
        await user.type(screen.getByLabelText(/preço da energia/i), "300")

        await user.click(screen.getByRole("button", { name: /salvar alterações/i }))

        await vi.waitFor(() =>
            expect(aclContractService.update).toHaveBeenCalledWith(
                "contract-1",
                expect.objectContaining({ energyPricePerMwh: 300 }),
            ),
        )
        expect(aclContractService.create).not.toHaveBeenCalled()
    })
})
