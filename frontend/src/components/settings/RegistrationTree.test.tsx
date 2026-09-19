import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { toast } from "sonner"
import { RegistrationTree } from "@/components/settings/RegistrationTree"
import { propertyService } from "@/services/property.service"
import { areaService } from "@/services/area.service"
import { deviceService } from "@/services/device.service"
import { distributorService } from "@/services/distributor.service"
import type { Area } from "@/types/area.types"
import type { Device } from "@/types/device.types"
import type { Distributor } from "@/types/distributor.types"
import type { Paginated } from "@/types/pagination.types"
import type { Property, PropertyTree } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
        list: vi.fn(),
        getTree: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/area.service", () => ({
    areaService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/device.service", () => ({
    deviceService: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock("@/services/distributor.service", () => ({
    distributorService: { list: vi.fn(), getById: vi.fn() },
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
    toast: { success: vi.fn(), error: vi.fn() },
}))

const TREE: PropertyTree = {
    total: 2,
    items: [
        {
            id: "prop-1",
            name: "Casa",
            areas: [
                {
                    id: "area-1",
                    name: "Cozinha",
                    devices: [
                        { id: "dev-1", name: "Geladeira", powerWatts: 150 },
                        { id: "dev-2", name: "Ventilador", powerWatts: null },
                    ],
                },
                { id: "area-2", name: "Quarto", devices: [] },
            ],
        },
        { id: "prop-2", name: "Loja", areas: [] },
    ],
}

const DISTRIBUTOR: Distributor = {
    id: "dist-1",
    name: "CEMIG",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} as Distributor

const PROPERTY: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    electricalSystem: "TRIPHASIC",
    billingClass: "B1",
    groupBModality: "CONVENTIONAL",
    receivesBillingDiscount: false,
    tariffGroup: "GROUP_B",
    contractingEnvironment: "ACR",
    tariffSubgroup: null,
    tariffModality: null,
    contractedDemandKw: null,
    contractedDemandPeakKw: null,
    contractedDemandOffPeakKw: null,
    publicLightingFeeBrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const AREA: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Cozinha",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const DEVICE: Device = {
    id: "dev-1",
    areaId: "area-1",
    name: "Geladeira",
    brand: "Brastemp",
    model: "BRM54",
    powerWatts: 150,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 31,
})

const renderTree = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <RegistrationTree />
        </QueryClientProvider>,
    )
}

const expandRow = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
    user.click(await screen.findByRole("button", { name }))

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
    vi.mocked(propertyService.getById).mockResolvedValue(PROPERTY)
    vi.mocked(areaService.getById).mockResolvedValue(AREA)
    vi.mocked(deviceService.getById).mockResolvedValue(DEVICE)
    vi.mocked(distributorService.list).mockResolvedValue(paginated([DISTRIBUTOR]))
})

describe("RegistrationTree — estados", () => {
    it("mostra carregamento enquanto a árvore não chega", () => {
        vi.mocked(propertyService.getTree).mockReturnValue(new Promise(() => {}))
        renderTree()

        expect(screen.getByRole("status")).toHaveTextContent(/carregando/i)
    })

    it("falha fechado e permite tentar de novo", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.getTree).mockRejectedValueOnce(new Error("boom"))
        renderTree()

        expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i)
        await user.click(screen.getByRole("button", { name: /tentar novamente/i }))

        expect(await screen.findByRole("button", { name: /^casa/i })).toBeInTheDocument()
    })

    it("mostra estado vazio quando não há propriedades", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ items: [], total: 0 })
        renderTree()

        expect(await screen.findByText(/nenhuma propriedade cadastrada/i)).toBeInTheDocument()
    })

    it("avisa quando a árvore foi limitada pelo teto do servidor", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({ ...TREE, total: 150 })
        renderTree()

        expect(await screen.findByText(/mostrando 2 de 150 propriedades/i)).toBeInTheDocument()
    })
})

describe("RegistrationTree — estrutura", () => {
    it("lista as propriedades recolhidas, com a contagem de áreas e dispositivos", async () => {
        renderTree()

        const casa = await screen.findByRole("button", { name: /^casa/i })
        expect(casa).toHaveAttribute("aria-expanded", "false")
        expect(casa).toHaveTextContent("2 áreas · 2 dispositivos")
        expect(screen.getByText("0 áreas · 0 dispositivos")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^loja/i })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^cozinha/i })).not.toBeInTheDocument()
    })

    it("usa o singular quando há uma só área e um só dispositivo", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue({
            total: 1,
            items: [
                {
                    id: "prop-1",
                    name: "Casa",
                    areas: [
                        {
                            id: "area-1",
                            name: "Sala",
                            devices: [{ id: "dev-1", name: "TV", powerWatts: null }],
                        },
                    ],
                },
            ],
        })
        renderTree()

        expect(await screen.findByRole("button", { name: /^casa/i })).toHaveTextContent(
            "1 área · 1 dispositivo",
        )
    })

    it("expande a propriedade para mostrar as áreas e a área para mostrar os dispositivos", async () => {
        const user = userEvent.setup()
        renderTree()

        await expandRow(user, /^casa/i)
        const cozinha = screen.getByRole("button", { name: /^cozinha/i })
        expect(screen.getByRole("button", { name: /^casa/i })).toHaveAttribute(
            "aria-expanded",
            "true",
        )
        expect(cozinha).toHaveTextContent("2 dispositivos")
        // Recolhido: segue no DOM para a transição, mas fora da leitura e do foco.
        expect(
            screen.queryByRole("button", { name: "Editar dispositivo Geladeira" }),
        ).not.toBeInTheDocument()

        await user.click(cozinha)

        expect(
            screen.getByRole("button", { name: "Editar dispositivo Geladeira" }),
        ).toBeInTheDocument()
        expect(screen.getByText("Geladeira")).toBeInTheDocument()
        expect(screen.getByText("150 W")).toBeInTheDocument()
        expect(screen.getByText("Ventilador")).toBeInTheDocument()
    })

    it("recolhe de novo ao clicar outra vez", async () => {
        const user = userEvent.setup()
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: /^casa/i }))

        expect(screen.queryByRole("button", { name: /^cozinha/i })).not.toBeInTheDocument()
    })

    it("dá a cada linha botões de editar e excluir com o nome do item", async () => {
        const user = userEvent.setup()
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: /^cozinha/i }))

        for (const label of [
            "Editar propriedade Casa",
            "Excluir propriedade Casa",
            "Editar área Cozinha",
            "Excluir área Cozinha",
            "Editar dispositivo Geladeira",
            "Excluir dispositivo Geladeira",
        ]) {
            expect(screen.getByRole("button", { name: label })).toBeInTheDocument()
        }
    })
})

describe("RegistrationTree — editar", () => {
    it("abre o modal de propriedade com os dados carregados pelo id", async () => {
        const user = userEvent.setup()
        renderTree()

        await user.click(await screen.findByRole("button", { name: "Editar propriedade Casa" }))

        expect(
            await screen.findByRole("dialog", { name: /editar propriedade/i }),
        ).toBeInTheDocument()
        expect(propertyService.getById).toHaveBeenCalledWith("prop-1")
        expect(screen.getByLabelText(/nome da propriedade/i)).toHaveValue("Casa")
    })

    it("edita a área, salva e recarrega a árvore", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.update).mockResolvedValue({ ...AREA, name: "Cozinha nova" })
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: "Editar área Cozinha" }))
        const dialog = await screen.findByRole("dialog", { name: /editar área/i })
        expect(areaService.getById).toHaveBeenCalledWith("prop-1", "area-1")

        const name = within(dialog).getByLabelText(/nome da área/i)
        await user.clear(name)
        await user.type(name, "Cozinha nova")
        await user.click(within(dialog).getByRole("button", { name: /salvar área/i }))

        await waitFor(() =>
            expect(areaService.update).toHaveBeenCalledWith("prop-1", "area-1", {
                name: "Cozinha nova",
            }),
        )
        await waitFor(() => expect(propertyService.getTree).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("edita o dispositivo usando a propriedade e a área do contexto", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.update).mockResolvedValue({ ...DEVICE, name: "Geladeira nova" })
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: /^cozinha/i }))
        await user.click(screen.getByRole("button", { name: "Editar dispositivo Geladeira" }))
        const dialog = await screen.findByRole("dialog", { name: /editar dispositivo/i })
        expect(deviceService.getById).toHaveBeenCalledWith("prop-1", "area-1", "dev-1")

        const name = within(dialog).getByLabelText(/nome do dispositivo/i)
        await user.clear(name)
        await user.type(name, "Geladeira nova")
        await user.click(within(dialog).getByRole("button", { name: /salvar dispositivo/i }))

        await waitFor(() =>
            expect(deviceService.update).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                expect.objectContaining({ name: "Geladeira nova" }),
            ),
        )
    })

    it("avisa e não abre o modal quando os dados para edição não carregam", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.getById).mockRejectedValue(new Error("boom"))
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: "Editar área Cozinha" }))

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
})

describe("RegistrationTree — excluir", () => {
    it("pede confirmação, avisando da cascata, e exclui a área", async () => {
        const user = userEvent.setup()
        vi.mocked(areaService.delete).mockResolvedValue(undefined)
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: "Excluir área Cozinha" }))
        const dialog = await screen.findByRole("dialog", { name: /excluir área/i })
        expect(dialog).toHaveTextContent(/cozinha/i)
        expect(dialog).toHaveTextContent(/dispositivos/i)
        expect(areaService.delete).not.toHaveBeenCalled()

        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(areaService.delete).toHaveBeenCalledWith("prop-1", "area-1"))
        await waitFor(() => expect(propertyService.getTree).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("exclui a propriedade", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)
        renderTree()

        await user.click(await screen.findByRole("button", { name: "Excluir propriedade Loja" }))
        const dialog = await screen.findByRole("dialog", { name: /excluir propriedade/i })
        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(propertyService.delete).toHaveBeenCalledWith("prop-2"))
    })

    it("exclui o dispositivo usando a propriedade e a área do contexto", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)
        renderTree()

        await expandRow(user, /^casa/i)
        await user.click(screen.getByRole("button", { name: /^cozinha/i }))
        await user.click(screen.getByRole("button", { name: "Excluir dispositivo Ventilador" }))
        const dialog = await screen.findByRole("dialog", { name: /excluir dispositivo/i })
        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() =>
            expect(deviceService.delete).toHaveBeenCalledWith("prop-1", "area-1", "dev-2"),
        )
    })

    it("não exclui nada ao cancelar", async () => {
        const user = userEvent.setup()
        renderTree()

        await user.click(await screen.findByRole("button", { name: "Excluir propriedade Loja" }))
        const dialog = await screen.findByRole("dialog", { name: /excluir propriedade/i })
        await user.click(within(dialog).getByRole("button", { name: /cancelar/i }))

        expect(propertyService.delete).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })

    it("avisa do erro e mantém o modal aberto quando a exclusão falha", async () => {
        const user = userEvent.setup()
        vi.mocked(propertyService.delete).mockRejectedValue(new Error("boom"))
        renderTree()

        await user.click(await screen.findByRole("button", { name: "Excluir propriedade Loja" }))
        const dialog = await screen.findByRole("dialog", { name: /excluir propriedade/i })
        await user.click(within(dialog).getByRole("button", { name: "Excluir" }))

        await waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(screen.getByRole("dialog", { name: /excluir propriedade/i })).toBeInTheDocument()
    })
})
