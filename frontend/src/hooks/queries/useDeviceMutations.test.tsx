import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useCreateDevice,
    useUpdateDevice,
    useDeleteDevice,
} from "@/hooks/queries/useDeviceMutations"
import { deviceService } from "@/services/device.service"
import { queryKeys } from "@/lib/queryClient"
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

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
    return { queryClient, wrapper }
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// useCreateDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateDevice", () => {
    it("cria o dispositivo chamando o service com propertyId, areaId e input", async () => {
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDevice(), { wrapper })

        const input = {
            name: "Ar-condicionado",
            brand: "Daikin",
            model: "Split 12000 BTU",
            powerWatts: 1200,
        }
        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input,
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deviceService.create).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            input,
        )
        expect(result.current.data).toEqual(mockDevice)
    })

    it("invalida a lista de dispositivos da área após sucesso", async () => {
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "Ar-condicionado" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: [...queryKeys.devices.all, "list", "prop-1", "area-1"],
        })
    })

    it("dispara toast de sucesso com nome do dispositivo", async () => {
        vi.mocked(deviceService.create).mockResolvedValue(mockDevice)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "Ar-condicionado" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Dispositivo criado",
            expect.objectContaining({
                description: expect.stringContaining("Ar-condicionado"),
            }),
        )
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(deviceService.create).mockRejectedValue(new Error("422"))

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "" },
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateDevice", () => {
    it("atualiza o dispositivo chamando o service", async () => {
        const updated = { ...mockDevice, name: "Ar renovado" }
        vi.mocked(deviceService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
            input: { name: "Ar renovado" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deviceService.update).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "device-1",
            { name: "Ar renovado" },
        )
        expect(result.current.data).toEqual(updated)
    })

    it("invalida lista E detalhe após sucesso", async () => {
        const updated = { ...mockDevice, name: "Ar renovado" }
        vi.mocked(deviceService.update).mockResolvedValue(updated)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
            input: { name: "Ar renovado" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: [...queryKeys.devices.all, "list", "prop-1", "area-1"],
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.devices.detail(
                "prop-1",
                "area-1",
                "device-1",
            ),
        })
    })

    it("dispara toast de sucesso", async () => {
        const updated = { ...mockDevice, name: "Ar renovado" }
        vi.mocked(deviceService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
            input: { name: "Ar renovado" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Dispositivo atualizado",
            expect.objectContaining({
                description: expect.stringContaining("Ar renovado"),
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteDevice", () => {
    it("deleta o dispositivo chamando o service", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(deviceService.delete).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "device-1",
        )
    })

    it("invalida lista e remove detalhe do cache após sucesso", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: [...queryKeys.devices.all, "list", "prop-1", "area-1"],
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.devices.detail(
                "prop-1",
                "area-1",
                "device-1",
            ),
        })
    })

    it("dispara toast de sucesso", async () => {
        vi.mocked(deviceService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith("Dispositivo excluído")
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(deviceService.delete).mockRejectedValue(new Error("403"))

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDevice(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "device-1",
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})