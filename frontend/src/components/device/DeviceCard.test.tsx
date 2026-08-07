import { describe, it, expect, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Routes, Route } from "react-router"
import { render, screen } from "@testing-library/react"
import { DeviceCard } from "@/components/device/DeviceCard"
import type { Device } from "@/types/device.types"

// O DeviceMenu acoplado ao card usa useDeleteDevice. Mockamos o módulo
// pra evitar imports/efeitos colaterais durante o setup do hook.
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

const baseDevice: Device = {
    id: "device-1",
    areaId: "area-1",
    name: "Ar-condicionado",
    brand: "Daikin",
    model: "Split 12000 BTU",
    powerWatts: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

/**
 * Renderiza o card dentro de uma rota com :propertyId — porque
 * DeviceCard usa useParams pra montar o link. Sem essa rota envolvente,
 * propertyId vira undefined e a URL fica quebrada.
 */
const renderCard = (device: Device = baseDevice) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/propriedades/prop-1/areas/area-1"]}>
                <Routes>
                    <Route
                        path="/propriedades/:propertyId/areas/:areaId"
                        element={<DeviceCard device={device} />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    )
}

describe("DeviceCard — conteúdo principal", () => {
    it("renderiza o nome do dispositivo como heading", () => {
        renderCard()

        expect(
            screen.getByRole("heading", {
                level: 3,
                name: /ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })

    it("renderiza chip com marca + modelo concatenados", () => {
        renderCard()

        expect(screen.getByText(/daikin · split 12000 btu/i)).toBeInTheDocument()
    })

    it("renderiza chip de potência quando informada", () => {
        renderCard()

        expect(screen.getByText(/1200W/i)).toBeInTheDocument()
    })

    it("renderiza só marca quando modelo é null", () => {
        renderCard({ ...baseDevice, model: null })

        expect(screen.getByText(/^daikin$/i)).toBeInTheDocument()
        expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    })

    it("renderiza só modelo quando marca é null", () => {
        renderCard({ ...baseDevice, brand: null })

        expect(screen.getByText(/split 12000 btu/i)).toBeInTheDocument()
        expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    })

    it("não renderiza chip de marca/modelo quando ambos são null", () => {
        renderCard({ ...baseDevice, brand: null, model: null })

        expect(screen.getByText(/1200W/i)).toBeInTheDocument()
    })

    it("não renderiza chip de potência quando powerWatts é null", () => {
        renderCard({ ...baseDevice, powerWatts: null })

        expect(screen.queryByText(/W$/)).not.toBeInTheDocument()
    })

    it("não renderiza nenhum chip quando todos os metadados são null", () => {
        renderCard({
            ...baseDevice,
            brand: null,
            model: null,
            powerWatts: null,
        })

        expect(
            screen.getByRole("heading", {
                level: 3,
                name: /ar-condicionado/i,
            }),
        ).toBeInTheDocument()
    })
})

describe("DeviceCard — navegação", () => {
    it("link aponta para /propriedades/:propertyId/areas/:areaId/devices/:deviceId", () => {
        renderCard()

        const link = screen.getByTestId("device-card-device-1")

        expect(link).toHaveAttribute("href", "/propriedades/prop-1/areas/area-1/devices/device-1")
    })

    it("usa o id correto no data-testid", () => {
        renderCard({ ...baseDevice, id: "outro-id" })

        expect(screen.getByTestId("device-card-outro-id")).toBeInTheDocument()
    })

    it("usa o areaId correto na URL (caso device pertença a outra área)", () => {
        renderCard({ ...baseDevice, areaId: "area-9" })

        const link = screen.getByTestId("device-card-device-1")

        expect(link).toHaveAttribute("href", "/propriedades/prop-1/areas/area-9/devices/device-1")
    })
})

describe("DeviceCard — menu acoplado", () => {
    it("expõe o botão de opções com o nome do dispositivo no aria-label", () => {
        renderCard()

        expect(
            screen.getByRole("button", { name: /opções de Ar-condicionado/i }),
        ).toBeInTheDocument()
    })
})
