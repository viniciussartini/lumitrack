import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement } from "react"
import { reportService } from "@/services/report.service"
import {
    useReportByProperty,
    useReportByArea,
    useReportByDevice,
} from "@/hooks/queries/useReport"
import type { ReportResult } from "@/types/report.types"

vi.mock("@/services/report.service", () => ({
    reportService: {
        generateByProperty: vi.fn(),
        generateByArea: vi.fn(),
        generateByDevice: vi.fn(),
    },
}))

const mockResult: ReportResult = {
    generatedAt: "2025-05-13T12:00:00.000Z",
    period: "MONTHLY",
    target: { type: "PROPERTY", propertyId: "prop-1" },
    dateRange: null,
    summary: {
        totalKwh: 100,
        totalCostBrl: 75,
        recordCount: 2,
        avgKwhPerRecord: 50,
        trend: "STABLE",
    },
    records: [],
}

const makeWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
        },
    })
    return ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// useReportByProperty
// ─────────────────────────────────────────────────────────────────────────────

describe("useReportByProperty", () => {
    it("chama generateByProperty com os args corretos", async () => {
        vi.mocked(reportService.generateByProperty).mockResolvedValue(mockResult)

        const { result } = renderHook(
            () =>
                useReportByProperty("prop-1", {
                    period: "MONTHLY",
                    dateFrom: "2025-01-01",
                    dateTo: "2025-12-31",
                }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(reportService.generateByProperty).toHaveBeenCalledWith("prop-1", {
            period: "MONTHLY",
            dateFrom: "2025-01-01",
            dateTo: "2025-12-31",
        })
    })

    it("retorna os dados do service", async () => {
        vi.mocked(reportService.generateByProperty).mockResolvedValue(mockResult)

        const { result } = renderHook(
            () => useReportByProperty("prop-1", { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(mockResult)
    })

    it("NÃO executa a query quando propertyId é undefined", () => {
        const { result } = renderHook(
            () => useReportByProperty(undefined, { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        expect(result.current.fetchStatus).toBe("idle")
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })

    it("NÃO executa a query quando propertyId é string vazia", () => {
        const { result } = renderHook(
            () => useReportByProperty("", { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        expect(result.current.fetchStatus).toBe("idle")
        expect(reportService.generateByProperty).not.toHaveBeenCalled()
    })

    it("propaga erro do service", async () => {
        vi.mocked(reportService.generateByProperty).mockRejectedValue(
            new Error("500"),
        )

        const { result } = renderHook(
            () => useReportByProperty("prop-1", { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.error).toBeInstanceOf(Error)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useReportByArea
// ─────────────────────────────────────────────────────────────────────────────

describe("useReportByArea", () => {
    it("chama generateByArea com propertyId, areaId e args", async () => {
        vi.mocked(reportService.generateByArea).mockResolvedValue(mockResult)

        const { result } = renderHook(
            () =>
                useReportByArea("prop-1", "area-1", {
                    period: "DAILY",
                    dateFrom: "2025-01-01",
                }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(reportService.generateByArea).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            { period: "DAILY", dateFrom: "2025-01-01", dateTo: undefined },
        )
    })

    it("NÃO executa quando propertyId é undefined", () => {
        renderHook(
            () => useReportByArea(undefined, "area-1", { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        expect(reportService.generateByArea).not.toHaveBeenCalled()
    })

    it("NÃO executa quando areaId é undefined", () => {
        renderHook(
            () => useReportByArea("prop-1", undefined, { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        expect(reportService.generateByArea).not.toHaveBeenCalled()
    })

    it("NÃO executa quando ambos são undefined", () => {
        const { result } = renderHook(
            () => useReportByArea(undefined, undefined, { period: "MONTHLY" }),
            { wrapper: makeWrapper() },
        )

        expect(result.current.fetchStatus).toBe("idle")
        expect(reportService.generateByArea).not.toHaveBeenCalled()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// useReportByDevice
// ─────────────────────────────────────────────────────────────────────────────

describe("useReportByDevice", () => {
    it("chama generateByDevice com propertyId, areaId, deviceId e args", async () => {
        vi.mocked(reportService.generateByDevice).mockResolvedValue(mockResult)

        const { result } = renderHook(
            () =>
                useReportByDevice("prop-1", "area-1", "device-1", {
                    period: "ANNUAL",
                }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))

        expect(reportService.generateByDevice).toHaveBeenCalledWith(
            "prop-1",
            "area-1",
            "device-1",
            { period: "ANNUAL", dateFrom: undefined, dateTo: undefined },
        )
    })

    it("NÃO executa quando deviceId é undefined", () => {
        renderHook(
            () =>
                useReportByDevice("prop-1", "area-1", undefined, {
                    period: "MONTHLY",
                }),
            { wrapper: makeWrapper() },
        )

        expect(reportService.generateByDevice).not.toHaveBeenCalled()
    })

    it("NÃO executa quando qualquer um dos 3 IDs é undefined", () => {
        const { result } = renderHook(
            () =>
                useReportByDevice(undefined, undefined, undefined, {
                    period: "MONTHLY",
                }),
            { wrapper: makeWrapper() },
        )

        expect(result.current.fetchStatus).toBe("idle")
        expect(reportService.generateByDevice).not.toHaveBeenCalled()
    })

    it("retorna os dados do service", async () => {
        vi.mocked(reportService.generateByDevice).mockResolvedValue(mockResult)

        const { result } = renderHook(
            () =>
                useReportByDevice("prop-1", "area-1", "device-1", {
                    period: "MONTHLY",
                }),
            { wrapper: makeWrapper() },
        )

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(mockResult)
    })
})