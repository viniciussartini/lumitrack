import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { toast } from "sonner"
import type { ReactNode } from "react"
import { useAlertStream } from "@/hooks/useAlertStream"
import { useAuth } from "@/contexts/AuthContext"
import { createAlertStream } from "@/lib/sse/alertStream"
import type { Alert } from "@/types/alert.types"

/**
 * Mocks:
 *
 * - createAlertStream: capturamos as `options` e retornamos um cleanup spy.
 *   Os testes simulam eventos chamando options.onAlert(...) manualmente.
 * - useAuth: controle direto sobre `user` e `isAuthenticated`.
 * - useNavigate: spy pra verificar navegação do botão "Ver" do toast.
 * - sonner: spy nos toasts.
 */

let lastStreamOptions: Parameters<typeof createAlertStream>[0] | null = null
let cleanupSpy = vi.fn()

vi.mock("@/lib/sse/alertStream", () => ({
    createAlertStream: vi.fn((options) => {
        lastStreamOptions = options
        return cleanupSpy
    }),
}))

const mockNavigate = vi.fn()
vi.mock("react-router-dom", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react-router-dom")>()
    return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/contexts/AuthContext", () => ({
    useAuth: vi.fn(),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
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
    triggeredAt: new Date().toISOString(),
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
})

interface SetupOptions {
    isAuthenticated?: boolean
    userId?: string | null
}

const setupHook = (options: SetupOptions = {}) => {
    const {
        isAuthenticated = true,
        userId = "user-1",
    } = options

    vi.mocked(useAuth).mockReturnValue({
        user: userId
            ? {
                id: userId,
                email: "test@example.com",
                userType: "INDIVIDUAL",
                firstName: "Test",
                lastName: "User",
                cpf: "529.982.247-25",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }
            : null,
        isAuthenticated,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        register: vi.fn(),
    })

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    })

    const wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </MemoryRouter>
    )

    return { queryClient, wrapper }
}

beforeEach(() => {
    vi.clearAllMocks()
    lastStreamOptions = null
    cleanupSpy = vi.fn()
})

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertStream — lifecycle", () => {
    it("conecta quando user está autenticado (cookie httpOnly enviado pelo browser)", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        expect(createAlertStream).toHaveBeenCalledTimes(1)
    })

    it("NÃO conecta quando user está deslogado", () => {
        const { wrapper } = setupHook({
            isAuthenticated: false,
            userId: null,
        })

        renderHook(() => useAlertStream(), { wrapper })

        expect(createAlertStream).not.toHaveBeenCalled()
    })

    it("desconecta ao desmontar (chama cleanup)", () => {
        const { wrapper } = setupHook()

        const { unmount } = renderHook(() => useAlertStream(), { wrapper })

        expect(cleanupSpy).not.toHaveBeenCalled()
        unmount()
        expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// onAlert → invalidate + toast
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertStream — onAlert handler", () => {
    it("invalida queryKeys.alerts.all ao receber alerta", () => {
        const { queryClient, wrapper } = setupHook()
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onAlert(makeAlert())
        })

        expect(invalidateSpy).toHaveBeenCalledWith({
            queryKey: ["alerts"],
        })
    })

    it("dispara toast.warning com message do alerta quando preenchida", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onAlert(
                makeAlert({ message: "Geladeira passou do limite" }),
            )
        })

        expect(toast.warning).toHaveBeenCalledWith(
            "Geladeira passou do limite",
            expect.objectContaining({
                description: expect.stringMatching(/100\s*kWh/),
            }),
        )
    })

    it("dispara toast.warning com fallback 'Alerta disparado' quando message é null", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onAlert(
                makeAlert({ message: null, thresholdKwh: 250 }),
            )
        })

        expect(toast.warning).toHaveBeenCalledWith(
            "Alerta disparado",
            expect.objectContaining({
                description: expect.stringMatching(/250\s*kWh/),
            }),
        )
    })

    it("inclui action button 'Ver' que navega para /alertas?triggered=true", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onAlert(makeAlert())
        })

        const call = vi.mocked(toast.warning).mock.calls[0]!
        const options = call[1] as {
            action: { label: string; onClick: () => void }
        }

        expect(options.action.label).toBe("Ver")

        // Clica no botão "Ver" → deve navegar
        options.action.onClick()

        expect(mockNavigate).toHaveBeenCalledWith("/alertas?triggered=true")
    })

    it("usa duration de 10s no toast (mais longo que default)", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onAlert(makeAlert())
        })

        const call = vi.mocked(toast.warning).mock.calls[0]!
        const options = call[1] as { duration: number }

        expect(options.duration).toBe(10_000)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// onError handler
// ─────────────────────────────────────────────────────────────────────────────

describe("useAlertStream — onError handler", () => {
    it("NÃO dispara toast em erros do stream (silencioso)", () => {
        const { wrapper } = setupHook()

        renderHook(() => useAlertStream(), { wrapper })

        act(() => {
            lastStreamOptions?.onError?.(new Error("Network blip"))
        })

        expect(toast.warning).not.toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
        expect(toast.success).not.toHaveBeenCalled()
    })
})