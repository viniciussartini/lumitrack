import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useCreateArea,
    useUpdateArea,
    useDeleteArea,
} from "@/hooks/queries/useAreaMutations"
import { areaService } from "@/services/area.service"
import { queryKeys } from "@/lib/queryClient"
import { toast } from "sonner"
import type { Area } from "@/types/area.types"

vi.mock("@/services/area.service", () => ({
    areaService: {
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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: "Área principal",
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
// useCreateArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateArea", () => {
    it("cria a área chamando o service com propertyId e input", async () => {
        vi.mocked(areaService.create).mockResolvedValue(mockArea)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateArea(), { wrapper })

        const input = { name: "Sala", description: "Área principal" }
        result.current.mutate({ propertyId: "prop-1", input })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(areaService.create).toHaveBeenCalledWith("prop-1", input)
        expect(result.current.data).toEqual(mockArea)
    })

    it("invalida a lista de áreas da propriedade pai após sucesso", async () => {
        vi.mocked(areaService.create).mockResolvedValue(mockArea)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            input: { name: "Sala" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.areas.list("prop-1"),
        })
    })

    it("dispara toast de sucesso com nome da área", async () => {
        vi.mocked(areaService.create).mockResolvedValue(mockArea)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            input: { name: "Sala" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Área criada",
            expect.objectContaining({
                description: expect.stringContaining("Sala"),
            }),
        )
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(areaService.create).mockRejectedValue(new Error("422"))

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            input: { name: "" },
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateArea", () => {
    it("atualiza a área chamando o service com propertyId, areaId e input", async () => {
        const updated = { ...mockArea, name: "Sala renovada" }
        vi.mocked(areaService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "Sala renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(areaService.update).toHaveBeenCalledWith("prop-1", "area-1", {
            name: "Sala renovada",
        })
        expect(result.current.data).toEqual(updated)
    })

    it("invalida lista E detalhe da área após sucesso", async () => {
        const updated = { ...mockArea, name: "Sala renovada" }
        vi.mocked(areaService.update).mockResolvedValue(updated)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "Sala renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.areas.list("prop-1"),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.areas.detail("prop-1", "area-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        const updated = { ...mockArea, name: "Sala renovada" }
        vi.mocked(areaService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { name: "Sala renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Área atualizada",
            expect.objectContaining({
                description: expect.stringContaining("Sala renovada"),
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteArea", () => {
    it("deleta a área chamando o service", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(areaService.delete).toHaveBeenCalledWith("prop-1", "area-1")
    })

    it("invalida lista e remove detalhe do cache após sucesso", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.areas.list("prop-1"),
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.areas.detail("prop-1", "area-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        vi.mocked(areaService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith("Área excluída")
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(areaService.delete).mockRejectedValue(new Error("403"))

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteArea(), { wrapper })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})