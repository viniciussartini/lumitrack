import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useNetworks } from "@/hooks/useNetworks"
import { api } from "@/services/api"

vi.mock("@/services/api", () => ({
    api: {
        createNetwork: vi.fn(),
        deleteNetwork: vi.fn(),
        createDevice: vi.fn(),
        updateDevice: vi.fn(),
        deleteDevice: vi.fn(),
        setPower: vi.fn(),
        triggerAnomaly: vi.fn(),
        clearAnomaly: vi.fn(),
    },
}))

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe("useNetworks", () => {
    it("createNetwork chama api.createNetwork com o nome", async () => {
        vi.mocked(api.createNetwork).mockResolvedValue({ id: "1", name: "Casa Teste", devices: [] })
        const { result } = renderHook(() => useNetworks(), { wrapper: createWrapper() })

        result.current.createNetwork.mutate("Casa Teste")

        await waitFor(() => expect(result.current.createNetwork.isSuccess).toBe(true))
        expect(api.createNetwork).toHaveBeenCalledWith("Casa Teste")
    })

    it("setPower chama api.setPower com id e on", async () => {
        vi.mocked(api.setPower).mockResolvedValue({
            id: "dev-1",
            networkId: "net-1",
            name: "Medidor 1",
            topic: "sim/dev1",
            poweredOn: true,
            params: {
                nominalVoltage: 220,
                nominalPowerW: 1000,
                powerFactorBase: 0.95,
                noiseAmplitudePercent: 2,
                profile: "RESIDENTIAL_STEADY",
            },
            anomaly: { active: false, multiplier: 1, endsAt: null },
            lastSample: null,
            lastPublishedAt: null,
            publishCount: 0,
            connected: false,
        })
        const { result } = renderHook(() => useNetworks(), { wrapper: createWrapper() })

        result.current.setPower.mutate({ id: "dev-1", on: true })

        await waitFor(() => expect(result.current.setPower.isSuccess).toBe(true))
        expect(api.setPower).toHaveBeenCalledWith("dev-1", true)
    })

    it("triggerAnomaly chama api.triggerAnomaly com id/multiplier/durationSeconds", async () => {
        vi.mocked(api.triggerAnomaly).mockResolvedValue({} as never)
        const { result } = renderHook(() => useNetworks(), { wrapper: createWrapper() })

        result.current.triggerAnomaly.mutate({ id: "dev-1", multiplier: 3, durationSeconds: 30 })

        await waitFor(() => expect(result.current.triggerAnomaly.isSuccess).toBe(true))
        expect(api.triggerAnomaly).toHaveBeenCalledWith("dev-1", 3, 30)
    })

    it("deleteDevice chama api.deleteDevice com o id", async () => {
        vi.mocked(api.deleteDevice).mockResolvedValue(undefined)
        const { result } = renderHook(() => useNetworks(), { wrapper: createWrapper() })

        result.current.deleteDevice.mutate("dev-1")

        await waitFor(() => expect(result.current.deleteDevice.isSuccess).toBe(true))
        expect(api.deleteDevice).toHaveBeenCalledWith("dev-1")
    })
})
