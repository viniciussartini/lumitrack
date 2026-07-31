import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "@testing-library/react"
import { NewDevicePage } from "@/pages/device/NewDevicePage"
import { deviceService } from "@/services/device.service"
import { areaService } from "@/services/area.service"
import { toast } from "sonner"
import type { Device } from "@/types/device.types"
import type { Area } from "@/types/area.types"

vi.mock("@/services/device.service", () => ({
    deviceService: {
        list: vi.fn(),
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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

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
                    "/propriedades/prop-1/areas/area-1/devices/novo",
                ]}
            >
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId/devices/novo"
                        element={<NewDevicePage />}
                    />
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<div>Detalhes da área</div>}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(areaService.getById).mockResolvedValue(mockArea)
})

describe("NewDevicePage — renderização", () => {
    it("renderiza heading e link de voltar", async () => {
        renderPage()

        expect(
            await screen.findByRole("heading", {
                level: 1,
                name: /novo dispositivo/i,
            }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole("link", { name: /voltar para área/i }),
        ).toBeInTheDocument()
    })

    it("inclui o nome da área pai no subtítulo", async () => {
        renderPage()

        expect(await screen.findByText(/sala/i)).toBeInTheDocument()
    })

    it("link de voltar aponta para a área pai", async () => {
        renderPage()

        const backLink = screen.getByRole("link", {
            name: /voltar para área/i,
        })

        expect(backLink).toHaveAttribute(
            "href",
            "/propriedades/prop-1/areas/area-1",
        )
    })
})

describe("NewDevicePage — área não carrega", () => {
    it("mostra erro quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Área não encontrada"),
        )

        renderPage()

        expect(
            await screen.findByText(/área não encontrada/i),
        ).toBeInTheDocument()
    })

    it("não renderiza o form quando o fetch da área falha", async () => {
        vi.mocked(areaService.getById).mockRejectedValue(
            new Error("Não encontrada"),
        )

        renderPage()

        await screen.findByText(/não encontrada/i)

        expect(
            screen.queryByLabelText(/nome do dispositivo/i),
        ).not.toBeInTheDocument()
    })
})

describe("NewDevicePage — submit", () => {
    it("submete payload completo e navega para a área pai", async () => {
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome do dispositivo/i),
            "Ar-condicionado",
        )
        await user.type(screen.getByLabelText(/marca/i), "Daikin")
        await user.type(
            screen.getByLabelText(/modelo/i),
            "Split 12000 BTU",
        )
        await user.type(screen.getByLabelText(/potência/i), "1200")

        await user.click(
            screen.getByRole("button", { name: /cadastrar dispositivo/i }),
        )

        await waitFor(() =>
            expect(deviceService.create).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                {
                    name: "Ar-condicionado",
                    brand: "Daikin",
                    model: "Split 12000 BTU",
                    powerWatts: 1200,
                },
            ),
        )

        // Após sucesso, navega
        expect(
            await screen.findByText(/detalhes da área/i),
        ).toBeInTheDocument()
    })

    it("omite campos opcionais do payload quando vazios", async () => {
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome do dispositivo/i),
            "Lâmpada",
        )
        await user.click(
            screen.getByRole("button", { name: /cadastrar dispositivo/i }),
        )

        await waitFor(() =>
            expect(deviceService.create).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                { name: "Lâmpada" },
            ),
        )
    })

    it("dispara toast.error quando o servidor falha", async () => {
        vi.mocked(deviceService.create).mockRejectedValue(
            new Error("Erro do servidor"),
        )
        const user = userEvent.setup()

        renderPage()

        await user.type(
            await screen.findByLabelText(/nome do dispositivo/i),
            "Lâmpada",
        )
        await user.click(
            screen.getByRole("button", { name: /cadastrar dispositivo/i }),
        )

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(
                "Erro ao criar dispositivo",
                expect.objectContaining({
                    description: "Erro do servidor",
                }),
            ),
        )
    })
})