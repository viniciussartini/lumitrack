import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import {
    useConsumptionByProperty,
    useConsumptionByArea,
    useConsumptionByDevice,
    useConsumption,
} from "@/hooks/queries/useConsumption"
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

const mockRecord: ConsumptionRecord = {
    id: "rec-1",
    propertyId: "prop-1",
    areaId: null,
    deviceId: null,
    period: "DAILY",
    referenceDate: "2025-01-15T00:00:00.000Z",
    kwhConsumed: 12.5,
    costBrl: 9.375,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
}

const createWrapper = () => {
    // gcTime: 0 evita cache cruzando entre testes (regra do projeto pra suite)
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
// useConsumptionByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useConsumptionByProperty", () => {
    it("chama listByProperty com propertyId e sem period quando o filtro é undefined", async () => {
        vi.mocked(consumptionService.listByProperty).mockResolvedValue([
            mockRecord,
        ])

        const { result } = renderHook(
            () => useConsumptionByProperty("prop-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.listByProperty).toHaveBeenCalledWith(
            "prop-1",
            undefined,
        )
        expect(result.current.data).toEqual([mockRecord])
    })

    it("repassa o filtro period quando informado", async () => {
        vi.mocked(consumptionService.listByProperty).mockResolvedValue([])

        renderHook(() => useConsumptionByProperty("prop-1", "MONTHLY"), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(consumptionService.listByProperty).toHaveBeenCalledWith(
                "prop-1",
                "MONTHLY",
            ),
        )
    })

    it("não dispara a query quando propertyId é undefined", () => {
        renderHook(() => useConsumptionByProperty(undefined), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.listByProperty).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useConsumptionByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useConsumptionByArea", () => {
    it("chama listByArea com propertyId + areaId", async () => {
        vi.mocked(consumptionService.listByArea).mockResolvedValue([])

        renderHook(() => useConsumptionByArea("prop-1", "area-1"), {
            wrapper: createWrapper(),
        })

        await waitFor(() =>
            expect(consumptionService.listByArea).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                undefined,
            ),
        )
    })

    it("não dispara quando areaId é undefined", () => {
        renderHook(() => useConsumptionByArea("prop-1", undefined), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.listByArea).not.toHaveBeenCalled()
    })

    it("não dispara quando propertyId é undefined (mesmo com areaId)", () => {
        renderHook(() => useConsumptionByArea(undefined, "area-1"), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.listByArea).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useConsumptionByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useConsumptionByDevice", () => {
    it("chama listByDevice com a tripla completa de IDs e o filtro period", async () => {
        vi.mocked(consumptionService.listByDevice).mockResolvedValue([])

        renderHook(
            () => useConsumptionByDevice("prop-1", "area-1", "dev-1", "HOURLY"),
            { wrapper: createWrapper() },
        )

        await waitFor(() =>
            expect(consumptionService.listByDevice).toHaveBeenCalledWith(
                "prop-1",
                "area-1",
                "dev-1",
                "HOURLY",
            ),
        )
    })

    it("não dispara quando algum dos 3 IDs é undefined", () => {
        renderHook(
            () => useConsumptionByDevice("prop-1", "area-1", undefined),
            { wrapper: createWrapper() },
        )

        expect(consumptionService.listByDevice).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useConsumption (detalhe)
// ─────────────────────────────────────────────────────────────────────────────

describe("useConsumption", () => {
    it("chama getById quando propertyId + id estão presentes", async () => {
        vi.mocked(consumptionService.getById).mockResolvedValue(mockRecord)

        const { result } = renderHook(
            () => useConsumption("prop-1", "rec-1"),
            { wrapper: createWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(consumptionService.getById).toHaveBeenCalledWith(
            "prop-1",
            "rec-1",
        )
        expect(result.current.data).toEqual(mockRecord)
    })

    it("não dispara quando id é undefined", () => {
        renderHook(() => useConsumption("prop-1", undefined), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.getById).not.toHaveBeenCalled()
    })

    it("não dispara quando propertyId é undefined", () => {
        renderHook(() => useConsumption(undefined, "rec-1"), {
            wrapper: createWrapper(),
        })

        expect(consumptionService.getById).not.toHaveBeenCalled()
    })
})