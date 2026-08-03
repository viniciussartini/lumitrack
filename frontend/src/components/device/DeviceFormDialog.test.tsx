import { describe, it, expect, beforeEach, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { DeviceFormDialog } from "@/components/device/DeviceFormDialog"
import { deviceService } from "@/services/device.service"
import type { Device } from "@/types/device.types"

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
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const mockDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const renderDialog = (
    props: Partial<React.ComponentProps<typeof DeviceFormDialog>> = {},
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
            <DeviceFormDialog
                isOpen
                onClose={onClose}
                mode={{ kind: "create", propertyId: "prop-1", areaId: "area-1" }}
                {...props}
            />
        </QueryClientProvider>,
    )

    return { onClose }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("DeviceFormDialog — criar", () => {
    it("abre com o título 'Adicionar dispositivo'", () => {
        renderDialog()

        expect(
            screen.getByRole("dialog", { name: /adicionar dispositivo/i }),
        ).toBeInTheDocument()
    })

    it("cria o dispositivo e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)

        const { onClose } = renderDialog()

        await user.type(screen.getByLabelText(/nome do dispositivo/i), "Geladeira")
        await user.click(screen.getByRole("button", { name: /criar dispositivo/i }))

        expect(deviceService.create).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            expect.objectContaining({ name: "Geladeira" }),
        )
        expect(onClose).toHaveBeenCalled()
    })
})

describe("DeviceFormDialog — editar", () => {
    it("abre com o título 'Editar dispositivo' e campos pré-preenchidos", () => {
        renderDialog({
            mode: {
                kind: "edit",
                propertyId: "prop-1",
                areaId: "area-1",
                device: mockDevice,
            },
        })

        expect(
            screen.getByRole("dialog", { name: /editar dispositivo/i }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText(/nome do dispositivo/i)).toHaveValue(
            "Ar-condicionado",
        )
    })

    it("atualiza o dispositivo e fecha o modal ao submeter", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.update).mockResolvedValue(mockDevice)

        const { onClose } = renderDialog({
            mode: {
                kind: "edit",
                propertyId: "prop-1",
                areaId: "area-1",
                device: mockDevice,
            },
        })

        await user.click(screen.getByRole("button", { name: /salvar dispositivo/i }))

        expect(deviceService.update).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "device-1",
            expect.objectContaining({ name: "Ar-condicionado" }),
        )
        expect(onClose).toHaveBeenCalled()
    })

    it("não fecha o modal quando a mutation falha", async () => {
        const user = userEvent.setup()
        vi.mocked(deviceService.update).mockRejectedValue(new Error("Falhou"))

        const { onClose } = renderDialog({
            mode: {
                kind: "edit",
                propertyId: "prop-1",
                areaId: "area-1",
                device: mockDevice,
            },
        })

        await user.click(screen.getByRole("button", { name: /salvar dispositivo/i }))

        await screen.findByRole("dialog", { name: /editar dispositivo/i })
        expect(onClose).not.toHaveBeenCalled()
    })
})
