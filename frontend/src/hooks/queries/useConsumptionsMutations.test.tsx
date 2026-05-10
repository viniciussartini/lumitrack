import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import type { ReactNode } from "react"
import {
    useCreateConsumptionForProperty,
    useCreateConsumptionForArea,
    useCreateConsumptionForDevice,
    useUpdateConsumption,
    useDeleteConsumption,
} from "@/hooks/queries/useConsumptionMutations"
import { consumptionService } from "@/services/consumption.service"
import type { ConsumptionRecord } from "@/types/consumption.types"

vi.mock("@/services/consumption.service", () => ({
    consumptionService: {
        listByProperty: vi.fn(),
        listByArea: vi.fn(),
        listByDevice: vi.fn(),
        getById: vi.fn(),
        createForProperty: vi.fn(),
        createForArea: vi.fn(),
        createForDevice: vi.fn(),
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

const mockRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "DAILY",
    referenceDate: "2025-01-15T12:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    notes: null,
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
// useCreateConsumptionForProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateConsumptionForProperty", () => {
    it("cria chamando service.createForProperty com propertyId e input", async () => {
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            mockRecord,
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(
            () => useCreateConsumptionForProperty(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.createForProperty).toHaveBeenCalledWith(
            "prop-1",
            {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        )
        expect(result.current.data).toEqual(mockRecord)
    })

    it("invalida lista de property após sucesso", async () => {
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            mockRecord,
        )

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(
            () => useCreateConsumptionForProperty(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "list", "property", "prop-1"],
        })
    })

    it("dispara toast de sucesso com description (kWh e data formatados)", async () => {
        vi.mocked(consumptionService.createForProperty).mockResolvedValue(
            mockRecord,
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(
            () => useCreateConsumptionForProperty(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        // mockRecord tem kwhConsumed=12.5, period=DAILY, referenceDate=2025-01-15
        // Description deve combinar essas duas informações já formatadas
        expect(toast.success).toHaveBeenCalledWith(
            "Registro de consumo criado",
            expect.objectContaining({
                description: expect.stringMatching(
                    /12,50 kWh em 15\/01\/2025/,
                ),
            }),
        )
    })

    it("propaga erros (incluindo 409) sem disparar toast", async () => {
        vi.mocked(consumptionService.createForProperty).mockRejectedValue(
            new Error("409 Conflict"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(
            () => useCreateConsumptionForProperty(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useCreateConsumptionForArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateConsumptionForArea", () => {
    it("cria chamando service.createForArea", async () => {
        const recordForArea: ConsumptionRecord = {
            ...mockRecord,
            propertyId: null,
            areaId: "area-1",
        }
        vi.mocked(consumptionService.createForArea).mockResolvedValue(
            recordForArea,
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(
            () => useCreateConsumptionForArea(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.createForArea).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 5,
            },
        )
    })

    it("invalida lista de area específica após sucesso", async () => {
        vi.mocked(consumptionService.createForArea).mockResolvedValue({
            ...mockRecord,
            propertyId: null,
            areaId: "area-1",
        })

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(
            () => useCreateConsumptionForArea(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "list", "area", "prop-1", "area-1"],
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useCreateConsumptionForDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useCreateConsumptionForDevice", () => {
    it("cria chamando service.createForDevice", async () => {
        const recordForDevice: ConsumptionRecord = {
            ...mockRecord,
            propertyId: null,
            deviceId: "dev-1",
            period: "HOURLY",
            kwhConsumed: 0.8,
        }
        vi.mocked(consumptionService.createForDevice).mockResolvedValue(
            recordForDevice,
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(
            () => useCreateConsumptionForDevice(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "dev-1",
            input: {
                period: "HOURLY",
                referenceDate: "2025-01-15T14:00:00.000Z",
                kwhConsumed: 0.8,
                notes: "TV ligada",
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.createForDevice).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "dev-1",
            {
                period: "HOURLY",
                referenceDate: "2025-01-15T14:00:00.000Z",
                kwhConsumed: 0.8,
                notes: "TV ligada",
            },
        )
    })

    it("invalida lista de device específica após sucesso", async () => {
        vi.mocked(consumptionService.createForDevice).mockResolvedValue({
            ...mockRecord,
            propertyId: null,
            deviceId: "dev-1",
        })

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(
            () => useCreateConsumptionForDevice(),
            { wrapper },
        )

        result.current.mutate({
            propertyId: "prop-1",
            areaId: "area-1",
            deviceId: "dev-1",
            input: {
                period: "DAILY",
                referenceDate: "2025-01-15",
                kwhConsumed: 12.5,
            },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: [
                "consumption",
                "list",
                "device",
                "prop-1",
                "area-1",
                "dev-1",
            ],
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useUpdateConsumption
// ─────────────────────────────────────────────────────────────────────────────

describe("useUpdateConsumption", () => {
    it("atualiza chamando service.update", async () => {
        const updated: ConsumptionRecord = { ...mockRecord, kwhConsumed: 15 }
        vi.mocked(consumptionService.update).mockResolvedValue(updated)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateConsumption(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            id: "rec-1",
            input: { kwhConsumed: 15 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.update).toHaveBeenCalledWith(
            "prop-1",
            "rec-1",
            { kwhConsumed: 15 },
        )
        expect(result.current.data).toEqual(updated)
    })

    it("invalida TODAS as listas (ampla) e o detalhe específico", async () => {
        vi.mocked(consumptionService.update).mockResolvedValue(mockRecord)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        const { result } = renderHook(() => useUpdateConsumption(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            id: "rec-1",
            input: { kwhConsumed: 15 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        // Invalida AMPLO em "list" — não distingue target
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "list"],
        })
        // Detalhe específico
        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "detail", "rec-1"],
        })
    })

    it("dispara toast de sucesso com description", async () => {
        vi.mocked(consumptionService.update).mockResolvedValue(mockRecord)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateConsumption(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            id: "rec-1",
            input: { kwhConsumed: 12.5 },
        })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(toast.success).toHaveBeenCalledWith(
            "Registro atualizado",
            expect.objectContaining({
                description: expect.stringMatching(
                    /12,50 kWh em 15\/01\/2025/,
                ),
            }),
        )
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(consumptionService.update).mockRejectedValue(
            new Error("403"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useUpdateConsumption(), {
            wrapper,
        })

        result.current.mutate({
            propertyId: "prop-1",
            id: "rec-1",
            input: { kwhConsumed: 15 },
        })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteConsumption
// ─────────────────────────────────────────────────────────────────────────────

describe("useDeleteConsumption", () => {
    it("deleta chamando service.delete", async () => {
        vi.mocked(consumptionService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteConsumption(), {
            wrapper,
        })

        result.current.mutate({ propertyId: "prop-1", id: "rec-1" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.delete).toHaveBeenCalledWith(
            "prop-1",
            "rec-1",
        )
    })

    it("invalida listas (ampla) e remove o detalhe do cache", async () => {
        vi.mocked(consumptionService.delete).mockResolvedValue(undefined)

        const { queryClient, wrapper } = createWrapper()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
        const removeSpy = vi.spyOn(queryClient, "removeQueries")

        const { result } = renderHook(() => useDeleteConsumption(), {
            wrapper,
        })

        result.current.mutate({ propertyId: "prop-1", id: "rec-1" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "list"],
        })
        expect(removeSpy).toHaveBeenCalledWith({
            queryKey: ["consumption", "detail", "rec-1"],
        })
    })

    it("dispara toast de sucesso (sem description)", async () => {
        vi.mocked(consumptionService.delete).mockResolvedValue(undefined)

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteConsumption(), {
            wrapper,
        })

        result.current.mutate({ propertyId: "prop-1", id: "rec-1" })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        // Delete não recebe o registro (resposta é void) — toast simples
        expect(toast.success).toHaveBeenCalledWith("Registro excluído")
    })

    it("propaga erros sem disparar toast", async () => {
        vi.mocked(consumptionService.delete).mockRejectedValue(
            new Error("403"),
        )

        const { wrapper } = createWrapper()
        const { result } = renderHook(() => useDeleteConsumption(), {
            wrapper,
        })

        result.current.mutate({ propertyId: "prop-1", id: "rec-1" })

        await waitFor(() => expect(result.current.isError).toBe(true))

        expect(toast.success).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })
})