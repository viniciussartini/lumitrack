import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useAreas, useArea } from "@/hooks/queries/useAreas"
import { areaService } from "@/services/area.service"
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

const mockArea: Area = {
    id: "area-1",
    propertyId: "prop-1",
    name: "Sala",
    description: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const wrapper = (queryClient: QueryClient) => {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

describe("useAreas", () => {
    it("dispara a query quando propertyId é informado", async () => {
        vi.mocked(areaService.list).mockResolvedValue({
            items: [mockArea],
            total: 1,
            page: 1,
            pageSize: 10,
        })
        const queryClient = createTestQueryClient()

        const { result } = renderHook(() => useAreas("prop-1"), {
            wrapper: wrapper(queryClient),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(areaService.list).toHaveBeenCalledWith("prop-1", {
            page: 1,
            pageSize: 10,
        })
        expect(result.current.data?.items).toEqual([mockArea])
    })

    it("NÃO dispara a query quando propertyId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useAreas(undefined), {
            wrapper: wrapper(queryClient),
        })

        expect(areaService.list).not.toHaveBeenCalled()
    })

    it("propaga erros do service", async () => {
        vi.mocked(areaService.list).mockRejectedValue(new Error("Falha ao listar áreas"))
        const queryClient = createTestQueryClient()

        const { result } = renderHook(() => useAreas("prop-1"), {
            wrapper: wrapper(queryClient),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.error).toBeInstanceOf(Error)
    })
})

describe("useArea", () => {
    it("dispara a query quando propertyId E areaId são informados", async () => {
        vi.mocked(areaService.getById).mockResolvedValue(mockArea)
        const queryClient = createTestQueryClient()

        const { result } = renderHook(() => useArea("prop-1", "area-1"), {
            wrapper: wrapper(queryClient),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(areaService.getById).toHaveBeenCalledWith("prop-1", "area-1")
        expect(result.current.data).toEqual(mockArea)
    })

    it("NÃO dispara a query quando areaId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useArea("prop-1", undefined), {
            wrapper: wrapper(queryClient),
        })

        expect(areaService.getById).not.toHaveBeenCalled()
    })

    it("NÃO dispara a query quando propertyId é undefined", () => {
        const queryClient = createTestQueryClient()

        renderHook(() => useArea(undefined, "area-1"), {
            wrapper: wrapper(queryClient),
        })

        expect(areaService.getById).not.toHaveBeenCalled()
    })
})
