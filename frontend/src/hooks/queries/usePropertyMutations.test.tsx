import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useCreateProperty,
    useDeleteProperty,
    useUpdateProperty,
} from "@/hooks/queries/usePropertyMutations"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"
import { toast } from "sonner"
import type { Property } from "@/types/property.types"

vi.mock("@/services/property.service", () => ({
    propertyService: {
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

const mockProperty: Property = {
    id: "prop-1",
    userId: "user-1",
    distributorId: "dist-1",
    name: "Casa Principal",
    address: "Rua das Flores, 100",
    city: "Belo Horizonte",
    state: "MG",
    zipCode: "30000-000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

/**
 * Wrapper helper — retorna o QueryClient junto pra inspeção de
 * invalidações. Sem isso, daria pra mockar invalidateQueries direto,
 * mas é mais frágil.
 */
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
// useCreateProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateProperty", () => {
    it("cria a propriedade chamando o service", async () => {
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateProperty(), { wrapper })

        const input = {
            distributorId: "dist-1",
            name: "Casa Principal",
        }

        result.current.mutate(input)

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(propertyService.create).toHaveBeenCalledWith(input)
        expect(result.current.data).toEqual(mockProperty)
    })

    it("invalida queries de propriedades após sucesso", async () => {
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateProperty(), { wrapper })

        result.current.mutate({ distributorId: "dist-1", name: "X" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.properties.all,
        })
    })

    it("dispara toast de sucesso com nome da propriedade", async () => {
        vi.mocked(propertyService.create).mockResolvedValue(mockProperty)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateProperty(), { wrapper })

        result.current.mutate({ distributorId: "dist-1", name: "Casa Principal" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Propriedade criada",
            expect.objectContaining({
                description: expect.stringContaining("Casa Principal"),
            }),
        )
    })

    it("propaga erros sem disparar toast — quem chama decide a mensagem", async () => {
        vi.mocked(propertyService.create).mockRejectedValue(
            new Error("ValidationError"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateProperty(), { wrapper })

        result.current.mutate({ distributorId: "dist-1", name: "X" })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateProperty", () => {
    it("atualiza a propriedade passando id e input separados", async () => {
        const updated = { ...mockProperty, name: "Casa Renovada" }
        vi.mocked(propertyService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateProperty(), { wrapper })

        result.current.mutate({
            id: "prop-1",
            input: { name: "Casa Renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(propertyService.update).toHaveBeenCalledWith("prop-1", {
            name: "Casa Renovada",
        })
        expect(result.current.data).toEqual(updated)
    })

    it("invalida lista e detalhe da propriedade após sucesso", async () => {
        const updated = { ...mockProperty, name: "Casa Renovada" }
        vi.mocked(propertyService.update).mockResolvedValue(updated)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateProperty(), { wrapper })

        result.current.mutate({
            id: "prop-1",
            input: { name: "Casa Renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.properties.list(),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.properties.detail("prop-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        const updated = { ...mockProperty, name: "Casa Renovada" }
        vi.mocked(propertyService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateProperty(), { wrapper })

        result.current.mutate({ id: "prop-1", input: { name: "Casa Renovada" } })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Propriedade atualizada",
            expect.objectContaining({
                description: expect.stringContaining("Casa Renovada"),
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteProperty", () => {
    it("deleta a propriedade chamando o service", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteProperty(), { wrapper })

        result.current.mutate("prop-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(propertyService.delete).toHaveBeenCalledWith("prop-1")
    })

    it("invalida lista e remove detalhe do cache após sucesso", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteProperty(), { wrapper })

        result.current.mutate("prop-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.properties.list(),
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.properties.detail("prop-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        vi.mocked(propertyService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteProperty(), { wrapper })

        result.current.mutate("prop-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith("Propriedade excluída")
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(propertyService.delete).mockRejectedValue(
            new Error("Forbidden"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteProperty(), { wrapper })

        result.current.mutate("prop-1")

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})