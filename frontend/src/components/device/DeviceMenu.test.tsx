import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { DeviceMenu } from "@/components/device/DeviceMenu"
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
    brand: null,
    model: null,
    powerWatts: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

interface RenderOptions {
    device?: Device
    showEdit?: boolean
    onAfterDelete?: () => void
}

/**
 * Renderiza o menu dentro de uma rota que tem :propertyId. O DeviceMenu
 * usa useParams pra montar o link de edição — sem isso, propertyId vira
 * undefined.
 */
const renderMenu = ({
    device = mockDevice,
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
            <MemoryRouter
                initialEntries={[
                    "/propriedades/prop-1/areas/area-1/devices/device-1",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={
                            <DeviceMenu
                                device={device}
                                showEdit={showEdit}
                                onAfterDelete={onAfterDelete}
                            />
                        }
                    />
                </Routes>
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

describe("DeviceMenu — abrir/fechar", () => {
    it("começa fechado", () => {
        renderMenu()

        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    })

    it("abre ao clicar no botão de opções", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )

        expect(screen.getByRole("menu")).toBeInTheDocument()
    })

    it("aria-expanded reflete o estado do menu", async () => {
        const user = userEvent.setup()
        renderMenu()

        const trigger = screen.getByRole("button", {
            name: /opções de Ar-condicionado/i,
        })
        expect(trigger).toHaveAttribute("aria-expanded", "false")

        await user.click(trigger)

        expect(trigger).toHaveAttribute("aria-expanded", "true")
    })

    it("aria-label inclui o nome do dispositivo (consistência com PropertyMenu/AreaMenu)", () => {
        renderMenu({ device: { ...mockDevice, name: "Geladeira gourmet" } })

        expect(
            screen.getByRole("button", { name: /opções de Geladeira gourmet/i }),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Item Editar
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceMenu — item Editar", () => {
    it("renderiza link de editar por default (showEdit=true)", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )

        const editLink = screen.getByRole("menuitem", { name: /editar/i })
        expect(editLink).toBeInTheDocument()
        expect(editLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/devices/device-1/editar",
        )
    })

    it("não renderiza link de editar quando showEdit=false", async () => {
        const user = userEvent.setup()
        renderMenu({ showEdit: false })

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )

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

describe("DeviceMenu — ConfirmDialog (cascade)", () => {
    it("abre ConfirmDialog ao clicar em Excluir", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        expect(
            screen.getByRole("heading", { name: /excluir dispositivo/i }),
        ).toBeInTheDocument()
    })

    it("texto do ConfirmDialog menciona registros de consumo, alertas E configurações IoT", async () => {
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        // Verifica os 3 elementos do cascade no aviso
        expect(screen.getByText(/registros de consumo/i)).toBeInTheDocument()
        expect(screen.getByText(/alertas/i)).toBeInTheDocument()
        expect(screen.getByText(/integração iot/i)).toBeInTheDocument()
    })

    it("texto do ConfirmDialog inclui o nome do dispositivo", async () => {
        const user = userEvent.setup()
        renderMenu({
            device: { ...mockDevice, name: "Geladeira gourmet" },
        })

        await user.click(
            screen.getByRole("button", { name: /opções de Geladeira gourmet/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))

        // Procura pela frase exata do dialog (evita ambiguidade com aria-label)
        expect(
            screen.getByText(/tem certeza que deseja excluir "Geladeira gourmet"/i),
        ).toBeInTheDocument()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

describe("DeviceMenu — exclusão", () => {
    it("chama o service ao confirmar exclusão", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderMenu()

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(deviceService.delete).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "device-1",
            ),
        )
    })

    it("dispara onAfterDelete após exclusão bem-sucedida", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)
        const onAfterDelete = vi.fn()
        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() => expect(onAfterDelete).toHaveBeenCalledTimes(1))
    })

    it("não dispara onAfterDelete quando exclusão falha", async () => {
        vi.mocked(deviceService.delete).mockRejectedValue(new Error("403"))
        const onAfterDelete = vi.fn()
        const user = userEvent.setup()
        renderMenu({ onAfterDelete })

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(deviceService.delete).toHaveBeenCalled(),
        )

        expect(onAfterDelete).not.toHaveBeenCalled()
    })

    it("funciona sem onAfterDelete (uso no DeviceCard)", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)
        const user = userEvent.setup()
        renderMenu({ onAfterDelete: undefined })

        await user.click(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        )
        await user.click(screen.getByRole("menuitem", { name: /excluir/i }))
        await user.click(screen.getByRole("button", { name: /^excluir$/i }))

        await waitFor(() =>
            expect(deviceService.delete).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "device-1",
            ),
        )
    })
})