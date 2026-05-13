import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import type { ReactNode } from "react"
import {
    useCreateAlertForProperty,
    useCreateAlertForArea,
    useCreateAlertForDevice,
    useUpdateAlert,
    useMarkAlertAsRead,
    useDeleteAlert,
} from "@/hooks/queries/useAlertMutations"
import { alertService } from "@/services/alert.service"
import { queryKeys } from "@/lib/queryClient"
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

vi.mock("@/services/api", () => ({
    api: {},
    extractErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : "Erro",
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
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
    ...overrides,
})

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
// useCreateAlertForProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateAlertForProperty", () => {
    it("cria chamando service.createForProperty", async () => {
        const created = makeAlert()
        vi.mocked(alertService.createForProperty).mockResolvedValue(created)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateAlertForProperty(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            input: { thresholdKwh: 100 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.createForProperty).toHaveBeenCalledWith(
            "prop-1",
            { thresholdKwh: 100 },
        )
        expect(result.current.data).toEqual(created)
    })

    it("invalida lista byProperty E inbox global", async () => {
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert(),
        )

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateAlertForProperty(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            input: { thresholdKwh: 100 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.alerts.byProperty("prop-1"),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "list", "global"],
        })
    })

    it("dispara toast de sucesso com threshold formatado", async () => {
        vi.mocked(alertService.createForProperty).mockResolvedValue(
            makeAlert({ thresholdKwh: 250.5 }),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateAlertForProperty(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            input: { thresholdKwh: 250.5 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Alerta criado",
            expect.objectContaining({
                description: expect.stringMatching(/250,5\s*kWh/),
            }),
        )
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(alertService.createForProperty).mockRejectedValue(
            new Error("422"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateAlertForProperty(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            input: { thresholdKwh: 100 },
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useCreateAlertForArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateAlertForArea", () => {
    it("cria chamando service.createForArea", async () => {
        const created = makeAlert({
            targetType: "AREA",
            propertyId: null,
            areaId: "area-1",
        })
        vi.mocked(alertService.createForArea).mockResolvedValue(created)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateAlertForArea(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { thresholdKwh: 50 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.createForArea).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            { thresholdKwh: 50 },
        )
    })

    it("invalida lista byArea E inbox global", async () => {
        vi.mocked(alertService.createForArea).mockResolvedValue(makeAlert())

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateAlertForArea(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: { thresholdKwh: 50 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.alerts.byArea("prop-1", "area-1"),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "list", "global"],
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useCreateAlertForDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateAlertForDevice", () => {
    it("cria chamando service.createForDevice", async () => {
        const created = makeAlert({
            targetType: "DEVICE",
            propertyId: null,
            areaId: null,
            deviceId: "dev-1",
        })
        vi.mocked(alertService.createForDevice).mockResolvedValue(created)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useCreateAlertForDevice(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "dev-1",
            input: { thresholdKwh: 5 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.createForDevice).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "dev-1",
            { thresholdKwh: 5 },
        )
    })

    it("invalida lista byDevice E inbox global", async () => {
        vi.mocked(alertService.createForDevice).mockResolvedValue(makeAlert())

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useCreateAlertForDevice(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "dev-1",
            input: { thresholdKwh: 5 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: queryKeys.alerts.byDevice(
                "prop-1",
                "area-1",
                "dev-1",
            ),
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "list", "global"],
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateAlert
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateAlert", () => {
    it("atualiza chamando service.update", async () => {
        const updated = makeAlert({ thresholdKwh: 150 })
        vi.mocked(alertService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateAlert(), {
            wrapper,
        })

        result.current.mutate({
            id: "alert-1",
            input: { thresholdKwh: 150 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.update).toHaveBeenCalledWith("alert-1", {
            thresholdKwh: 150,
        })
        expect(result.current.data).toEqual(updated)
    })

    it("invalida AMPLO (alerts.all) E o detalhe específico", async () => {
        vi.mocked(alertService.update).mockResolvedValue(makeAlert())

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateAlert(), { wrapper })

        result.current.mutate({
            id: "alert-1",
            input: { thresholdKwh: 150 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts"],
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "detail", "alert-1"],
        })
    })

    it("dispara toast de sucesso com threshold formatado", async () => {
        vi.mocked(alertService.update).mockResolvedValue(
            makeAlert({ thresholdKwh: 75 }),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateAlert(), { wrapper })

        result.current.mutate({
            id: "alert-1",
            input: { thresholdKwh: 75 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Alerta atualizado",
            expect.objectContaining({
                description: expect.stringMatching(/75\s*kWh/),
            }),
        )
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useMarkAlertAsRead
// ─────────────────────────────────────────────────────────────────────────────

describe("useMarkAlertAsRead", () => {
    it("chama service.markAsRead", async () => {
        const read = makeAlert({
            triggeredAt: "2025-11-10T12:00:00.000Z",
            readAt: "2025-11-11T08:30:00.000Z",
        })
        vi.mocked(alertService.markAsRead).mockResolvedValue(read)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useMarkAlertAsRead(), {
            wrapper,
        })

        result.current.mutate("alert-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.markAsRead).toHaveBeenCalledWith("alert-1")
    })

    it("invalida AMPLO E o detalhe específico", async () => {
        vi.mocked(alertService.markAsRead).mockResolvedValue(makeAlert())

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useMarkAlertAsRead(), {
            wrapper,
        })

        result.current.mutate("alert-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts"],
        })
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "detail", "alert-1"],
        })
    })

    it("dispara toast curto sem description", async () => {
        vi.mocked(alertService.markAsRead).mockResolvedValue(makeAlert())

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useMarkAlertAsRead(), {
            wrapper,
        })

        result.current.mutate("alert-1")

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        // Sem description — toast simples (ação leve)
        expect(toast.success).toHaveBeenCalledWith("Marcado como lido")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteAlert
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteAlert", () => {
    it("deleta chamando service.delete", async () => {
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteAlert(), { wrapper })

        result.current.mutate({ id: "alert-1", thresholdKwh: 100 })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(alertService.delete).toHaveBeenCalledWith("alert-1")
    })

    it("invalida AMPLO E remove o detalhe do cache", async () => {
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteAlert(), { wrapper })

        result.current.mutate({ id: "alert-1", thresholdKwh: 100 })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts"],
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: ["alerts", "detail", "alert-1"],
        })
    })

    it("dispara toast contextual com threshold ('Alerta de X kWh excluído')", async () => {
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteAlert(), { wrapper })

        result.current.mutate({ id: "alert-1", thresholdKwh: 100 })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            expect.stringMatching(/Alerta de 100\s*kWh excluído/),
        )
    })

    it("dispara toast simples quando thresholdKwh é omitido", async () => {
        vi.mocked(alertService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteAlert(), { wrapper })

        result.current.mutate({ id: "alert-1" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith("Alerta excluído")
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(alertService.delete).mockRejectedValue(new Error("403"))

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteAlert(), { wrapper })

        result.current.mutate({ id: "alert-1", thresholdKwh: 100 })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})