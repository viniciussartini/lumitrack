import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { useAlerts, useFiringAlerts, useAlert } from "@/hooks/queries/useAlerts"
import { alertService } from "@/services/alert.service"
import type { AlertWithStatus } from "@/types/alert.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        list: vi.fn(),
        firing: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        patchEnabled: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockAlert: AlertWithStatus = {
    id: "alert-1",
    userId: "user-1",
    meterId: "meter-1",
    name: "Geladeira fora da faixa",
    referencePowerKw: 10,
    tolerancePercent: 2,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "normal",
    target: { type: "DEVICE", name: "Geladeira", path: "/propriedades/p1/areas/a1/devices/d1" },
}

/**
 * gcTime: 0 garante que não haja vazamento de cache entre testes
 * (regra do projeto pra suite).
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

describe("useAlerts", () => {
    it("chama list com page/pageSize default", async () => {
        vi.mocked(alertService.list).mockResolvedValue({
            items: [mockAlert],
            total: 1,
            page: 1,
            pageSize: 10,
        })

        const { result } = renderHook(() => useAlerts(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
        expect(result.current.data?.items).toEqual([mockAlert])
    })

    it("repassa page/pageSize customizados", async () => {
        vi.mocked(alertService.list).mockResolvedValue({
            items: [],
            total: 0,
            page: 2,
            pageSize: 5,
        })

        renderHook(() => useAlerts(2, 5), { wrapper: createWrapper() })

        await waitFor(() =>
            expect(alertService.list).toHaveBeenCalledWith({ page: 2, pageSize: 5 }),
        )
    })

    it("retorna isError quando a chamada falha", async () => {
        vi.mocked(alertService.list).mockRejectedValue(new Error("Falha"))

        const { result } = renderHook(() => useAlerts(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(result.current.error).toBeInstanceOf(Error)
    })
})

describe("useFiringAlerts", () => {
    it("chama firing() e retorna a lista de alertas em disparo", async () => {
        vi.mocked(alertService.firing).mockResolvedValue([mockAlert])

        const { result } = renderHook(() => useFiringAlerts(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.firing).toHaveBeenCalled()
        expect(result.current.data).toEqual([mockAlert])
    })
})

describe("useAlert (detalhe)", () => {
    it("chama getById quando id está presente", async () => {
        vi.mocked(alertService.getById).mockResolvedValue(mockAlert)

        const { result } = renderHook(() => useAlert("alert-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.getById).toHaveBeenCalledWith("alert-1")
        expect(result.current.data).toEqual(mockAlert)
    })

    it("não dispara quando id é undefined", () => {
        renderHook(() => useAlert(undefined), {
            wrapper: createWrapper(),
        })

        expect(alertService.getById).not.toHaveBeenCalled()
    })

    it("não dispara quando id é string vazia", () => {
        renderHook(() => useAlert(""), {
            wrapper: createWrapper(),
        })

        expect(alertService.getById).not.toHaveBeenCalled()
    })
})
