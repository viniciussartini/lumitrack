import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { EditDevicePage } from "@/pages/device/EditDevicePage"
import { deviceService } from "@/services/device.service"
import { toast } from "sonner"
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

const renderPage = () => {
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
                    "/propriedades/prop-1/areas/area-1/devices/device-1/editar",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId/editar"
                        element={<EditDevicePage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/:deviceId"
                        element={<div>Detalhes do dispositivo</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("EditDevicePage — renderização", () => {
    it("renderiza heading e link de voltar", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)

        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /editar dispositivo/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para dispositivo/i }),
        ).toBeInTheDocument()
    })

    it("link de voltar aponta para a página de detalhes do dispositivo", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)

        renderPage()

        await screen.findByRole("heading", { level: 1 })

        const backLink = screen.getByRole("link", {
            name: /voltar para dispositivo/i,
        })

        expect(backLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1/devices/device-1",
        )
    })

    it("preenche o form com os dados do dispositivo", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)

        renderPage()

        expect(
            await screen.findByDisplayValue(/^ar-condicionado$/i),
        ).toBeInTheDocument()
        expect(screen.getByDisplayValue(/^daikin$/i)).toBeInTheDocument()
        expect(
            screen.getByDisplayValue(/split 12000 btu/i),
        ).toBeInTheDocument()
        expect(screen.getByDisplayValue("1200")).toBeInTheDocument()
    })
})

describe("EditDevicePage — dispositivo não carrega", () => {
    it("mostra erro quando o fetch falha", async () => {
        vi.mocked(deviceService.getById).mockRejectedValue(
            new Error("Dispositivo não encontrado"),
        )

        renderPage()

        expect(
            await screen.findByText(/dispositivo não encontrado/i),
        ).toBeInTheDocument()
    })

    it("não renderiza o form quando o fetch falha", async () => {
        vi.mocked(deviceService.getById).mockRejectedValue(
            new Error("Não encontrado"),
        )

        renderPage()

        await screen.findByText(/não encontrado/i)

        expect(
            screen.queryByLabelText(/nome do dispositivo/i),
        ).not.toBeInTheDocument()
    })
})

describe("EditDevicePage — submit", () => {
    it("submete payload e navega para a página de detalhes", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(deviceService.update).mockResolvedValue({
            ...mockDevice,
            name: "Ar renovado",
        })

        const user = userEvent.setup()
        renderPage()

        const nameInput = await screen.findByLabelText(
            /nome do dispositivo/i,
        )
        await user.clear(nameInput)
        await user.type(nameInput, "Ar renovado")

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() =>
            expect(deviceService.update).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "device-1",
                expect.objectContaining({ name: "Ar renovado" }),
            ),
        )

        // Após sucesso, navega
        expect(
            await screen.findByText(/detalhes do dispositivo/i),
        ).toBeInTheDocument()
    })

    it("dispara toast.error quando o servidor falha", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        vi.mocked(deviceService.update).mockRejectedValue(
            new Error("Forbidden"),
        )

        const user = userEvent.setup()
        renderPage()

        await screen.findByDisplayValue(/^ar-condicionado$/i)

        await user.click(
            screen.getByRole("button", { name: /salvar alterações/i }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao atualizar dispositivo",
                expect.objectContaining({ description: "Forbidden" }),
            ),
        )
    })
})