import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useDistributor, useDistributors } from "@/hooks/queries/useDistributors"
import { distributorService } from "@/services/distributor.service"
import type { Distributor } from "@/types/distributor.types"

vi.mock("@/services/distributor.service", () => ({
    distributorService: {
        list: vi.fn(),
        getById: vi.fn(),
    },
}))

const mockDistributor: Distributor = {
    id: "dist-1",
    name: "CEMIG Distribuição S.A.",
    cnpj: "06.981.180/0001-16",
    state: "MG",
    tusdPerKwh: 0.35,
    tePerKwh: 0.4,
    icmsRate: 0.18,
    pisRate: 0.0165,
    cofinsRate: 0.076,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

/**
 * Wrapper com QueryClient isolado por teste.
 * gcTime: 0 garante que não haja vazamento de cache entre testes.
 */
const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// useDistributors (catálogo paginado)
// ─────────────────────────────────────────────────────────────────────────────

describe("useDistributors", () => {
    it("retorna a lista paginada de distribuidoras em caso de sucesso", async () => {
        vi.mocked(distributorService.list).mockResolvedValue({
            items: [mockDistributor],
            total: 1,
            page: 1,
            pageSize: 10,
        })

        const { result } = renderHook(() => useDistributors(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data?.items).toEqual([mockDistributor])
        expect(distributorService.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    })

    it("retorna isError quando a chamada falha", async () => {
        vi.mocked(distributorService.list).mockRejectedValue(new Error("Falha"))

        const { result } = renderHook(() => useDistributors(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(result.current.error).toBeInstanceOf(Error)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDistributor (detalhe)
// ─────────────────────────────────────────────────────────────────────────────

describe("useDistributor", () => {
    it("não dispara a query quando id é undefined", () => {
        const { result } = renderHook(() => useDistributor(undefined), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(distributorService.getById).not.toHaveBeenCalled()
    })

    it("não dispara a query quando id é string vazia", () => {
        const { result } = renderHook(() => useDistributor(""), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(distributorService.getById).not.toHaveBeenCalled()
    })

    it("retorna a distribuidora em caso de sucesso", async () => {
        vi.mocked(distributorService.getById).mockResolvedValue(mockDistributor)

        const { result } = renderHook(() => useDistributor("dist-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toEqual(mockDistributor)
        expect(distributorService.getById).toHaveBeenCalledWith("dist-1")
    })
})
