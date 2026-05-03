import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useCreateDistributor,
    useDeleteDistributor,
    useUpdateDistributor,
} from "@/hooks/queries/useDistributorMutations"
import { distributorService } from "@/services/distributor.service"
import { queryKeys } from "@/lib/queryClient"
import { toast } from "sonner"
import type { Distributor } from "@/types/distributor.types"

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
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

const mockDistributor: Distributor = {
    id: "dist-1",
    userId: "user-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC",
    workingVoltage: 220,
    kwhPrice: 0.75,
    taxRate: 0.12,
    publicLightingFee: 45.9,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const validCreateInput = {
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    electricalSystem: "TRIPHASIC" as const,
    workingVoltage: 220,
    kwhPrice: 0.75,
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
// useCreateDistributor
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateDistributor", () => {
    it("cria a distribuidora chamando o service", async () => {
        vi.mocked(distributorService.create).mockResolvedValue(mockDistributor)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDistributor(), { wrapper })

        result.current.mutate(validCreateInput)

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(distributorService.create).toHaveBeenCalledWith(validCreateInput)
        expect(result.current.data).toEqual(mockDistributor)
    })

    it("invalida queries de distribuidoras após sucesso", async () => {
        vi.mocked(distributorService.create).mockResolvedValue(mockDistributor)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateDistributor(), { wrapper })

        result.current.mutate(validCreateInput)

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.distributors.all,
        })
    })

    it("dispara toast de sucesso com nome da distribuidora", async () => {
        vi.mocked(distributorService.create).mockResolvedValue(mockDistributor)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDistributor(), { wrapper })

        result.current.mutate(validCreateInput)

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Distribuidora criada",
            expect.objectContaining({
                description: expect.stringContaining("CEMIG"),
            }),
        )
    })

    it("propaga erros sem disparar toast — quem chama decide a mensagem", async () => {
        vi.mocked(distributorService.create).mockRejectedValue(
            new Error("ConflictError"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateDistributor(), { wrapper })

        result.current.mutate(validCreateInput)

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateDistributor
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateDistributor", () => {
    it("atualiza a distribuidora passando id e input separados", async () => {
        const updated = { ...mockDistributor, name: "CEMIG Renovada" }
        vi.mocked(distributorService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateDistributor(), { wrapper })

        result.current.mutate({
            id: "dist-1",
            input: { name: "CEMIG Renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(distributorService.update).toHaveBeenCalledWith("dist-1", {
            name: "CEMIG Renovada",
        })
        expect(result.current.data).toEqual(updated)
    })

    it("invalida lista e detalhe da distribuidora após sucesso", async () => {
        const updated = { ...mockDistributor, name: "CEMIG Renovada" }
        vi.mocked(distributorService.update).mockResolvedValue(updated)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateDistributor(), { wrapper })

        result.current.mutate({
            id: "dist-1",
            input: { name: "CEMIG Renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.distributors.list(),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.distributors.detail("dist-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        const updated = { ...mockDistributor, name: "CEMIG Renovada" }
        vi.mocked(distributorService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateDistributor(), { wrapper })

        result.current.mutate({
            id: "dist-1",
            input: { name: "CEMIG Renovada" },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Distribuidora atualizada",
            expect.objectContaining({
                description: expect.stringContaining("CEMIG Renovada"),
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteDistributor
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteDistributor", () => {
    it("deleta a distribuidora chamando o service", async () => {
        vi.mocked(distributorService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDistributor(), { wrapper })

        result.current.mutate("dist-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(distributorService.delete).toHaveBeenCalledWith("dist-1")
    })

    it("invalida lista e remove detalhe do cache após sucesso", async () => {
        vi.mocked(distributorService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteDistributor(), { wrapper })

        result.current.mutate("dist-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.distributors.list(),
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.distributors.detail("dist-1"),
        })
    })

    it("dispara toast de sucesso", async () => {
        vi.mocked(distributorService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDistributor(), { wrapper })

        result.current.mutate("dist-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith("Distribuidora excluída")
    })

    it("propaga erros sem disparar toast — página trata mensagens específicas (ex: 'tem propriedades vinculadas')", async () => {
        vi.mocked(distributorService.delete).mockRejectedValue(
            new Error("Distribuidora possui propriedades vinculadas"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteDistributor(), { wrapper })

        result.current.mutate("dist-1")

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})