import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { DeviceCreateDialog } from "@/components/device/DeviceCreateDialog"
import { areaService } from "@/services/area.service"
import { deviceService } from "@/services/device.service"
import type { Area } from "@/types/area.types"
import type { Device } from "@/types/device.types"
import type { Paginated } from "@/types/pagination.types"
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

vi.mock("@/services/device.service", () => ({
    deviceService: {
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

const property = (id: string, name: string): Property => ({ id, name }) as Property

const PROP_1 = property("prop-1", "Casa Principal")
const PROP_2 = property("prop-2", "Loja Centro")

const area = (id: string, propertyId: string, name: string): Area => ({
    id,
    propertyId,
    name,
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
})

const paginated = <T,>(items: T[]): Paginated<T> => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 31,
})

const AREAS_BY_PROPERTY: Record<string, Area[]> = {
    "prop-1": [area("area-1", "prop-1", "Sala"), area("area-2", "prop-1", "Cozinha")],
    "prop-2": [area("area-3", "prop-2", "Balcão")],
}

const createdDevice: Device = {
    id: "dev-1",
    areaId: "area-3",
    name: "Geladeira",
    brand: null,
    model: null,
    powerWatts: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderDialog = (props: Partial<React.ComponentProps<typeof DeviceCreateDialog>> = {}) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
    const onClose = vi.fn()

    render(
        <QueryClientProvider client={queryClient}>
            <DeviceCreateDialog isOpen onClose={onClose} properties={[PROP_1, PROP_2]} {...props} />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(areaService.list).mockImplementation((propertyId) =>
        Promise.resolve(paginated(AREAS_BY_PROPERTY[propertyId] ?? [])),
    )
})

describe("DeviceCreateDialog", () => {
    it("lista as áreas agrupadas pelo nome da propriedade", async () => {
        renderDialog()

        const select = await screen.findByLabelText("Área")
        const casa = within(select).getByRole("group", { name: "Casa Principal" })
        const loja = within(select).getByRole("group", { name: "Loja Centro" })

        expect(
            within(casa)
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual(["Sala", "Cozinha"])
        expect(
            within(loja)
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual(["Balcão"])
    })

    it("cria o dispositivo na área escolhida, usando a propriedade dona dela", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.create).mockResolvedValue(createdDevice)
        const { onClose } = renderDialog()

        await user.selectOptions(await screen.findByLabelText("Área"), "area-3")
        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Geladeira")
        await user.click(screen.getByRole("button", { name: /criar dispositivo/i }))

        expect(deviceService.create).toHaveBeenCalledWith("prop-2", "area-3", {
            name: "Geladeira",
        })
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    })

    it("seleciona a primeira área por padrão", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.create).mockResolvedValue(createdDevice)
        renderDialog()

        await screen.findByLabelText("Área")
        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Ventilador")
        await user.click(screen.getByRole("button", { name: /criar dispositivo/i }))

        expect(deviceService.create).toHaveBeenCalledWith("prop-1", "area-1", {
            name: "Ventilador",
        })
    })

    it("não busca áreas enquanto o modal está fechado", () => {
        renderDialog({ isOpen: false })

        expect(areaService.list).not.toHaveBeenCalled()
    })

    it("sem nenhuma área cadastrada, explica e não oferece o formulário", async () => {
        vi.mocked(areaService.list).mockResolvedValue(paginated([]))
        renderDialog()

        expect(await screen.findByText(/nenhuma área cadastrada/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/nome do dispositivo/i)).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /criar dispositivo/i })).not.toBeInTheDocument()
    })

    it("mostra estado de carregamento enquanto as áreas não chegam", () => {
        vi.mocked(areaService.list).mockReturnValue(new Promise(() => {}))
        renderDialog()

        expect(screen.getByText(/carregando áreas/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/nome do dispositivo/i)).not.toBeInTheDocument()
    })

    it("falha fechado quando a busca de áreas falha", async () => {
        vi.mocked(areaService.list).mockRejectedValue(new Error("boom"))
        renderDialog()

        expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível carregar/i)
        expect(screen.queryByLabelText(/nome do dispositivo/i)).not.toBeInTheDocument()
    })
})
