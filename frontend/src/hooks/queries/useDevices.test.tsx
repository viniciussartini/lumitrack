import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useDevices, useDevice } from "@/hooks/queries/useDevices"
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

const wrapper = (queryClient: QueryClient) => {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useDevices", () => {
    it("dispara a query quando propertyId E areaId são informados", async () => {
        vi.mocked(deviceService.list).mockResolvedValue([mockDevice])
        const queryClient = createTestQueryClient()

        const { result } = renderHook(() => useDevices("prop-1", "area-1"), {
            wrapper: wrapper(queryClient),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(deviceService.list).toHaveBeenCalledWith("prop-1", "area-1")
        expect(result.current.data).toEqual([mockDevice])
    })

    it("NÃO dispara a query quando propertyId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useDevices(undefined, "area-1"), {
            wrapper: wrapper(queryClient),
        })

        expect(deviceService.list).not.toHaveBeenCalled()
    })

    it("NÃO dispara a query quando areaId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useDevices("prop-1", undefined), {
            wrapper: wrapper(queryClient),
        })

        expect(deviceService.list).not.toHaveBeenCalled()
    })

    it("propaga erros do service", async () => {
        vi.mocked(deviceService.list).mockRejectedValue(
            new Error("Falha ao listar dispositivos"),
        )
        const queryClient = createTestQueryClient()

        const { result } = renderHook(
            () => useDevices("prop-1", "area-1"),
            { wrapper: wrapper(queryClient) },
        )

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.error).toBeInstanceOf(Error)
    })
})

describe("useDevice", () => {
    it("dispara a query quando os 3 params são informados", async () => {
        vi.mocked(deviceService.getById).mockResolvedValue(mockDevice)
        const queryClient = createTestQueryClient()

        const { result } = renderHook(
            () => useDevice("prop-1", "area-1", "device-1"),
            { wrapper: wrapper(queryClient) },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(deviceService.getById).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "device-1",
        )
        expect(result.current.data).toEqual(mockDevice)
    })

    it("NÃO dispara a query quando deviceId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useDevice("prop-1", "area-1", undefined), {
            wrapper: wrapper(queryClient),
        })

        expect(deviceService.getById).not.toHaveBeenCalled()
    })

    it("NÃO dispara a query quando areaId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useDevice("prop-1", undefined, "device-1"), {
            wrapper: wrapper(queryClient),
        })

        expect(deviceService.getById).not.toHaveBeenCalled()
    })

    it("NÃO dispara a query quando propertyId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useDevice(undefined, "area-1", "device-1"), {
            wrapper: wrapper(queryClient),
        })

        expect(deviceService.getById).not.toHaveBeenCalled()
    })
})