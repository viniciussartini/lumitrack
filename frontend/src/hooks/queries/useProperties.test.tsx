import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useProperties, useProperty } from "@/hooks/queries/useProperties"
import { propertyService } from "@/services/property.service"
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
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useProperties", () => {
    it("retorna a lista de propriedades em caso de sucesso", async () => {
        vi.mocked(propertyService.list).mockResolvedValue([mockProperty])

        const { result } = renderHook(() => useProperties(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toEqual([mockProperty])
        expect(propertyService.list).toHaveBeenCalledTimes(1)
    })

    it("retorna isError quando a chamada falha", async () => {
        vi.mocked(propertyService.list).mockRejectedValue(new Error("Falha"))

        const { result } = renderHook(() => useProperties(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(result.current.error).toBeInstanceOf(Error)
    })
})

describe("useProperty", () => {
    it("não dispara a query quando id é undefined", () => {
        const { result } = renderHook(() => useProperty(undefined), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(propertyService.getById).not.toHaveBeenCalled()
    })

    it("não dispara a query quando id é string vazia", () => {
        const { result } = renderHook(() => useProperty(""), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(propertyService.getById).not.toHaveBeenCalled()
    })

    it("retorna a propriedade em caso de sucesso", async () => {
        vi.mocked(propertyService.getById).mockResolvedValue(mockProperty)

        const { result } = renderHook(() => useProperty("prop-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(result.current.data).toEqual(mockProperty)
        expect(propertyService.getById).toHaveBeenCalledWith("prop-1")
    })
})