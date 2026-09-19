import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { usePropertyTree } from "@/hooks/queries/usePropertyTree"
import { propertyService } from "@/services/property.service"
import { queryKeys } from "@/lib/queryClient"

vi.mock("@/services/property.service", () => ({
    propertyService: { getTree: vi.fn() },
}))

const TREE = { items: [{ id: "prop-1", name: "Casa", areas: [] }], total: 1 }

const createWrapper = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return { queryClient, wrapper }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("usePropertyTree", () => {
    it("carrega a árvore numa única chamada e a guarda sob a chave própria", async () => {
        vi.mocked(propertyService.getTree).mockResolvedValue(TREE)
        const { queryClient, wrapper } = createWrapper()

        const { result } = renderHook(() => usePropertyTree(), { wrapper })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(TREE)
        expect(propertyService.getTree).toHaveBeenCalledTimes(1)
        expect(queryClient.getQueryData(queryKeys.propertyTree.all)).toEqual(TREE)
    })

    it("expõe isError quando a chamada falha", async () => {
        vi.mocked(propertyService.getTree).mockRejectedValue(new Error("falha"))
        const { wrapper } = createWrapper()

        const { result } = renderHook(() => usePropertyTree(), { wrapper })

        await waitFor(() => expect(result.current.isError).toBe(true))
    })
})
