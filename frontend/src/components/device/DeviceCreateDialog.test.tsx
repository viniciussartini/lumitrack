import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import { DeviceCreateDialog } from "@/components/device/DeviceCreateDialog"
import { areaService } from "@/services/area.service"
import { deviceService } from "@/services/device.service"
import type { Device } from "@/types/device.types"
import type { PropertyTreeNode } from "@/types/property.types"

vi.mock("@/services/area.service", () => ({
    areaService: { list: vi.fn(), getById: vi.fn() },
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

const property = (id: string, name: string, areas: [string, string][]): PropertyTreeNode => ({
    id,
    name,
    areas: areas.map(([areaId, areaName]) => ({ id: areaId, name: areaName, devices: [] })),
})

const PROP_1 = property("prop-1", "Casa Principal", [
    ["area-1", "Sala"],
    ["area-2", "Cozinha"],
])
const PROP_2 = property("prop-2", "Loja Centro", [["area-3", "Balcão"]])
const PROP_SEM_AREA = property("prop-3", "Galpão", [])

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
            <DeviceCreateDialog
                isOpen
                onClose={onClose}
                properties={[PROP_1, PROP_2, PROP_SEM_AREA]}
                {...props}
            />
        </QueryClientProvider>,
    )

    return { onClose }
}

const optionNames = (group: HTMLElement) =>
    within(group)
        .getAllByRole("option")
        .map((option) => option.textContent)

beforeEach(() => {
    vi.clearAllMocks()
})

describe("DeviceCreateDialog", () => {
    it("lista as áreas agrupadas pelo nome da propriedade, sem grupo vazio", () => {
        renderDialog()

        const select = screen.getByLabelText("Área")
        expect(optionNames(within(select).getByRole("group", { name: "Casa Principal" }))).toEqual([
            "Sala",
            "Cozinha",
        ])
        expect(optionNames(within(select).getByRole("group", { name: "Loja Centro" }))).toEqual([
            "Balcão",
        ])
        expect(within(select).queryByRole("group", { name: "Galpão" })).not.toBeInTheDocument()
    })

    it("não busca áreas: usa as que já vêm das propriedades", () => {
        renderDialog()

        expect(areaService.list).not.toHaveBeenCalled()
    })

    it("cria o dispositivo na área escolhida, usando a propriedade dona dela", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.create).mockResolvedValue(createdDevice)
        const { onClose } = renderDialog()

        await user.selectOptions(screen.getByLabelText("Área"), "area-3")
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

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Ventilador")
        await user.click(screen.getByRole("button", { name: /criar dispositivo/i }))

        expect(deviceService.create).toHaveBeenCalledWith("prop-1", "area-1", {
            name: "Ventilador",
        })
    })

    it("sem nenhuma área cadastrada, explica e não oferece o formulário", () => {
        renderDialog({ properties: [PROP_SEM_AREA] })

        expect(screen.getByText(/nenhuma área cadastrada/i)).toBeInTheDocument()
        expect(screen.queryByLabelText(/nome do dispositivo/i)).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /criar dispositivo/i })).not.toBeInTheDocument()
    })
})
