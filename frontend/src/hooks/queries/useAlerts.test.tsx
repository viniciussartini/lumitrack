import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useAlerts,
    useAlertsByProperty,
    useAlertsByArea,
    useAlertsByDevice,
    useAlert,
} from "@/hooks/queries/useAlerts"
import { alertService } from "@/services/alert.service"
import type { Alert } from "@/types/alert.types"

vi.mock("@/services/alert.service", () => ({
    alertService: {
        listGlobal: vi.fn(),
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
        update: vi.fn(),
        markAsRead: vi.fn(),
        delete: vi.fn(),
    },
}))

const mockAlert: Alert = {
    id: "alert-1",
    userId: "user-1",
    targetType: "PROPERTY",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    thresholdKwh: 100,
    message: null,
    triggeredAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// useAlerts (inbox global)
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlerts", () => {
    it("chama listGlobal sem filtros quando query é omitida", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([mockAlert])

        const { result } = renderHook(() => useAlerts(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        // O hook chama com {} (default da assinatura), que o service
        // converte em GET /alerts sem query string
        expect(alertService.listGlobal).toHaveBeenCalledWith({})
        expect(result.current.data).toEqual([mockAlert])
    })

    it("repassa triggered=true ao service quando informado", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])

        renderHook(() => useAlerts({ triggered: true }), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(alertService.listGlobal).toHaveBeenCalledWith({
                triggered: true,
            }),
        )
    })

    it("usa queryKey distinta para filtros diferentes (cache separado)", async () => {
        vi.mocked(alertService.listGlobal).mockResolvedValue([])

        const wrapper = createWrapper()

        renderHook(() => useAlerts(), { wrapper })
        renderHook(() => useAlerts({ triggered: true }), { wrapper })
        renderHook(() => useAlerts({ triggered: false }), { wrapper })

        // Cada filtro gera uma chamada separada — caches distintos
        await waitFor(() =>
            expect(alertService.listGlobal).toHaveBeenCalledTimes(3),
        )
    })

    it("retorna isError quando a chamada falha", async () => {
        vi.mocked(alertService.listGlobal).mockRejectedValue(
            new Error("Falha"),
        )

        const { result } = renderHook(() => useAlerts(), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(result.current.error).toBeInstanceOf(Error)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useAlertsByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertsByProperty", () => {
    it("chama listByProperty com o propertyId recebido", async () => {
        vi.mocked(alertService.listByProperty).mockResolvedValue([mockAlert])

        const { result } = renderHook(
            () => useAlertsByProperty("prop-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.listByProperty).toHaveBeenCalledWith("prop-1")
        expect(result.current.data).toEqual([mockAlert])
    })

    it("não dispara a query quando propertyId é undefined", () => {
        const { result } = renderHook(() => useAlertsByProperty(undefined), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(alertService.listByProperty).not.toHaveBeenCalled()
    })

    it("não dispara a query quando propertyId é string vazia", () => {
        const { result } = renderHook(() => useAlertsByProperty(""), {
            wrapper: createWrapper(),
        })

        expect(result.current.fetchStatus).toBe("idle")
        expect(alertService.listByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useAlertsByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertsByArea", () => {
    it("chama listByArea com propertyId + areaId", async () => {
        vi.mocked(alertService.listByArea).mockResolvedValue([])

        renderHook(() => useAlertsByArea("prop-1", "area-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(alertService.listByArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
            ),
        )
    })

    it("não dispara quando areaId é undefined", () => {
        renderHook(() => useAlertsByArea("prop-1", undefined), {
            wrapper: createWrapper(),
        })

        expect(alertService.listByArea).not.toHaveBeenCalled()
    })

    it("não dispara quando propertyId é undefined (mesmo com areaId)", () => {
        renderHook(() => useAlertsByArea(undefined, "area-1"), {
            wrapper: createWrapper(),
        })

        expect(alertService.listByArea).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useAlertsByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertsByDevice", () => {
    it("chama listByDevice com a tripla completa de IDs", async () => {
        vi.mocked(alertService.listByDevice).mockResolvedValue([])

        renderHook(
            () => useAlertsByDevice("prop-1", "area-1", "dev-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() =>
            expect(alertService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
            ),
        )
    })

    it("não dispara quando deviceId é undefined", () => {
        renderHook(() => useAlertsByDevice("prop-1", "area-1", undefined), {
            wrapper: createWrapper(),
        })

        expect(alertService.listByDevice).not.toHaveBeenCalled()
    })

    it("não dispara quando areaId é undefined", () => {
        renderHook(() => useAlertsByDevice("prop-1", undefined, "dev-1"), {
            wrapper: createWrapper(),
        })

        expect(alertService.listByDevice).not.toHaveBeenCalled()
    })

    it("não dispara quando propertyId é undefined", () => {
        renderHook(() => useAlertsByDevice(undefined, "area-1", "dev-1"), {
            wrapper: createWrapper(),
        })

        expect(alertService.listByDevice).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useAlert (detalhe)
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlert", () => {
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